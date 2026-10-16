// Where an Indian (or recorded) kit's pads sit: each hand's section is a grid of spots, each playing a stroke ('' =
// empty), so pads can sit where the fingers play them and a stroke can have more than one pad. Kept per device; by
// default each hand's strokes follow the drum layout from the rim inward, every hand gets the same number of rows,
// and the spots left over are empty.
import { kitVoices, type Hand, type KitVoice } from './kit';
import { PARTS, layoutFor } from './drumLayout';

export const HANDS: Hand[] = ['left', 'both', 'right'];
/** Pads across: two for each hand's side, one for both hands. */
export const COLUMNS: Record<Hand, number> = { left: 2, both: 1, right: 2 };
export type Spots = Record<Hand, string[]>;

const KEY = 'music-maker:padSpots';
let version = 0;
let cache: Record<string, Spots> | null = null;
function stored(): Record<string, Spots> {
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { cache = {}; } }
  return cache!;
}
function save(all: Record<string, Spots>) {
  cache = all;
  version++;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* this session only */ }
}

/** Changes whenever spots are saved (for caches built from them, such as computer-key layouts). */
export const padOrderVersion = () => version;

/** Strokes as the drum layout places them on each head: rim, middle, syahi, centre, each from the top clockwise. */
function layoutOrder(bank: string): string[] {
  const out: string[] = [];
  for (const hd of layoutFor(bank)) {
    for (const part of PARTS) for (const v of [...hd.parts[part], ...(hd.closed?.[part] ?? [])]) if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** A kit's voices in the drum layout's order (others after, in kit order). */
export function orderedVoices(bank: string | undefined): KitVoice[] {
  const kit = kitVoices(bank);
  if (!bank || !kit.some((k) => k.hand)) return kit;
  const order = layoutOrder(bank);
  const rank = (v: string) => { const i = order.indexOf(v); return i < 0 ? order.length + kit.findIndex((k) => k.voice === v) : i; };
  return [...kit].sort((a, b) => rank(a.voice) - rank(b.voice));
}

/** Pad up to whole rows, the same number for every hand. */
function fill(spots: Spots): Spots {
  const rows = Math.max(1, ...HANDS.map((h) => Math.ceil(spots[h].length / COLUMNS[h])));
  return Object.fromEntries(HANDS.map((h) => [h, Array.from({ length: rows * COLUMNS[h] }, (_, i) => spots[h][i] ?? '')])) as Spots;
}

const rankIn = (order: string[], v: string) => { const i = order.indexOf(v); return i < 0 ? order.length : i; };
/** An order saved by an earlier version (one pad per stroke, swaps within a hand). */
function earlierOrder(bank: string): string[] | undefined {
  try { return JSON.parse(localStorage.getItem('music-maker:padOrder') ?? '{}')[bank]; } catch { return undefined; }
}

function defaultSpots(bank: string): Spots {
  const earlier = earlierOrder(bank);
  const voices = earlier ? [...orderedVoices(bank)].sort((a, b) => rankIn(earlier, a.voice) - rankIn(earlier, b.voice)) : orderedVoices(bank);
  return fill(Object.fromEntries(HANDS.map((h) => [h, voices.filter((k) => k.hand === h).map((k) => k.voice)])) as Spots);
}

/** A kit's pad spots: as arranged on this device (with any new strokes added), else the default. */
export function padSpots(bank: string): Spots {
  const own = stored()[bank];
  if (!own) return defaultSpots(bank);
  const spots: Spots = { left: [...own.left], both: [...own.both], right: [...own.right] };
  const kit = kitVoices(bank), have = new Set(HANDS.flatMap((h) => spots[h]));
  for (const k of kit) {
    if (have.has(k.voice) || !k.hand) continue;
    const list = spots[k.hand], free = list.indexOf('');
    if (free >= 0) list[free] = k.voice; else list.push(k.voice);
  }
  // Strokes no longer in the kit (a recorded kit edited) leave their spots empty.
  for (const h of HANDS) spots[h] = spots[h].map((v) => (v && kit.some((k) => k.voice === v) ? v : ''));
  return fill(spots);
}

export interface Spot { hand: Hand; i: number }
const edit = (bank: string, fn: (s: Spots) => void) => { const s = padSpots(bank); fn(s); save({ ...stored(), [bank]: fill(s) }); };

/** Swap two pads (any hands). */
export const swapSpots = (bank: string, a: Spot, b: Spot) =>
  edit(bank, (s) => { [s[a.hand][a.i], s[b.hand][b.i]] = [s[b.hand][b.i], s[a.hand][a.i]]; });
/** Give a spot a stroke ('' empties it): another pad for a stroke that already has one, or a pad in an empty spot. */
export const setSpot = (bank: string, at: Spot, voice: string) => edit(bank, (s) => { s[at.hand][at.i] = voice; });

/** Back to the default. */
export function resetPadOrder(bank: string) {
  const all = { ...stored() };
  delete all[bank];
  save(all);
}
