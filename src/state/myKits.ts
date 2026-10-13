// The player's recorded kits: names, strokes and hands in local storage; the strokes' sounds in IndexedDB,
// registered with the engine by sound name so clips play them like any other sample.
import { getMyKits, setMyKits, type Hand, type KitVoice, type MyKit } from '../model/kit';
import { deleteSample, getSample, putSample } from './sampleDb';

const KEY = 'music-maker:myKits';
const urls = new Map<string, string>();

function save(kits: MyKit[]) {
  setMyKits(kits);
  try { localStorage.setItem(KEY, JSON.stringify(kits)); } catch { /* kept for this session */ }
  listeners.forEach((fn) => fn(kits));
}

const listeners = new Set<(kits: MyKit[]) => void>();
/** Hear about kits being saved or deleted (the store keeps a copy so the UI updates). */
export const onMyKits = (fn: (kits: MyKit[]) => void) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Load the kits saved on this device and make their sounds playable. */
export function loadMyKits(): MyKit[] {
  let kits: MyKit[] = [];
  try { kits = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { kits = []; }
  setMyKits(kits);
  void Promise.all(kits.flatMap((k) => k.strokes.map((s) => registerStroke(s.voice))));
  return kits;
}

async function registerStroke(voice: string, wav?: Blob) {
  const blob = wav ?? (await getSample(voice).catch(() => undefined));
  if (!blob) return;
  const old = urls.get(voice);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(blob);
  urls.set(voice, url);
  // Loaded here rather than up front, so the store (and its tests) do not need the audio engine.
  const engine = await import('../engine/strudel');
  engine.registerSounds({ [voice]: url });
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

/** A stroke being saved: an existing one (has `voice`), with a new recording when `wav` is given. */
export interface StrokeDraft {
  voice?: string;
  name: string;
  hand: Hand;
  bends: boolean;
  wav?: Blob;
}

/**
 * Save a kit (new when `id` is not given): new strokes get a sound name from the kit and stroke names, e.g.
 * `dholak_na`, unique among all sounds, and kept when the stroke is renamed later (clips refer to it). Strokes
 * dropped from the kit lose their sounds. Returns the kit.
 */
export async function saveMyKit(draft: { id?: string; name: string; strokes: StrokeDraft[] }, taken: (name: string) => boolean): Promise<MyKit> {
  const kits = getMyKits();
  const old = kits.find((k) => k.id === draft.id);
  const id = old?.id ?? `${slug(draft.name)}${Date.now().toString(36)}`;
  const used = new Set(kits.flatMap((k) => k.strokes.map((s) => s.voice)));
  const kitSlug = old?.strokes[0]?.voice.split('_')[0] ?? slug(draft.name).replace(/_/g, '');
  const strokes: KitVoice[] = [];
  for (const s of draft.strokes) {
    let voice = s.voice;
    if (!voice) {
      const base = `${kitSlug}_${slug(s.name)}`;
      voice = base;
      for (let n = 2; used.has(voice) || taken(voice); n++) voice = `${base}${n}`;
      used.add(voice);
    }
    if (s.wav) { await putSample(voice, s.wav); await registerStroke(voice, s.wav); }
    strokes.push({ voice, name: s.name.trim() || 'Stroke', main: true, hand: s.hand, ...(s.bends ? { bends: true } : {}) });
  }
  for (const s of old?.strokes ?? []) if (!strokes.some((x) => x.voice === s.voice)) void deleteSample(s.voice);
  const kit: MyKit = { id, name: draft.name.trim() || 'My kit', strokes };
  save(old ? kits.map((k) => (k.id === id ? kit : k)) : [...kits, kit]);
  return kit;
}

/** Delete a kit and its sounds from this device (clips that used it keep their hits). */
export function deleteMyKit(id: string) {
  const kit = getMyKits().find((k) => k.id === id);
  kit?.strokes.forEach((s) => void deleteSample(s.voice));
  save(getMyKits().filter((k) => k.id !== id));
}

/** A saved stroke's sound, for editing the kit. */
export const strokeSound = (voice: string) => getSample(voice);
