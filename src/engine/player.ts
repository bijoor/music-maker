// Keeps the Strudel engine in step with the song: whenever the song changes, each track's generated code is
// compared with what that track is playing. A change of active clips launches on the next bar; anything else
// (notes, sound, effects, mute, solo) applies immediately.
import { fxValues, generate, sections, type GeneratedSong } from '../codegen/generate';
import type { Song, Track } from '../model/types';
import { kitVoices, voiceSound } from '../model/kit';
import { findScale, scalePitch } from '../model/scales';
import { keyboardOf } from '../model/groups';
import { strokeLevel } from '../model/strokeLevels';
import { strokeSpeed } from '../model/tuning';
import { useStore } from '../state/store';
import * as engine from './strudel';

interface Playing {
  /** Code currently playing on the track ('' = silence). */
  code: string;
  /** What the track plays (see TrackCode.playKey); a change launches on the next bar. */
  key: string;
}

const playing = new Map<string, Playing>();
const compiled = new Map<string, unknown>();
let queue: Promise<void> = Promise.resolve();
let latest: GeneratedSong | null = null;

/** Compiled patterns kept for reuse (most recent last). Recording changes the code with every stroke, so the cache
 * is capped: unbounded, it grew with every note played and slowly exhausted the device's memory. */
const COMPILED_MAX = 40;
async function compileCached(code: string) {
  if (compiled.has(code)) {
    const p = compiled.get(code);
    compiled.delete(code);
    compiled.set(code, p);
    return p;
  }
  const p = await engine.compile(code);
  compiled.set(code, p);
  while (compiled.size > COMPILED_MAX) compiled.delete(compiled.keys().next().value!);
  return p;
}

// Clicks for the count-in and the metronome, on their own engine tracks (not part of the song).
const CLICK = 's("rim*4").bank("RolandTR909").gain("[.9 .45 .45 .45]")';

async function apply(song: Song, notBefore = 0) {
  const { songMode, sceneOrigin } = useStore.getState();
  const g = generate(song, { songMode });
  latest = g;
  // Scenes: every track's line lines up with the bar the scene started on. A scene just chosen (origin null)
  // restarts every track together on the next bar, which becomes its start. (Song mode lines up on its own.)
  const scened = !songMode && !!song.current;
  const fresh = scened && sceneOrigin === null;
  let origin = scened && sceneOrigin !== null ? sceneOrigin : undefined;
  // Compile everything first, then launch together, so all tracks that change switch on the same bar.
  const work: { tc: (typeof g.tracks)[number]; code: string; pattern: unknown; launch: boolean }[] = [];
  for (const tc of g.tracks) {
    const code = tc.audible ? tc.runnable : '';
    const prev = playing.get(tc.trackId);
    if (prev && prev.code === code && prev.key === tc.playKey && !fresh) continue;
    const pattern = code ? await compileCached(code) : engine.silence;
    work.push({ tc, code, pattern, launch: fresh || !prev || prev.key !== tc.playKey });
  }
  const { setPending } = useStore.getState();
  for (const { tc, code, pattern, launch } of work) {
    if (launch) {
      const at = engine.launch(tc.trackId, pattern, { period: tc.period, notBefore, origin });
      if (fresh && origin === undefined) { origin = at; useStore.getState().setSceneOrigin(at); }
      if (engine.isStarted() && at > engine.cycleNow()) setPending(tc.trackId, at);
    } else {
      engine.edit(tc.trackId, pattern, tc.period);
    }
    playing.set(tc.trackId, { code, key: tc.playKey });
  }
}

/** Queue a sync so changes apply in order even though compiling is asynchronous. */
export function sync(song: Song, notBefore = 0) {
  queue = queue.then(() => apply(song, notBefore)).catch((err) => console.error('[player] sync failed', err));
  return queue;
}

/** Start playback; with a count-in, one bar of clicks plays first and the song starts on the next bar. */
export async function play(opts: { countIn?: boolean } = {}) {
  const store = useStore.getState();
  if (store.transport !== 'stopped') return;
  engine.unlockAudio();
  store.setTransport('loading');
  await engine.initEngine();
  warm();
  engine.setBpm(useStore.getState().song.bpm);
  playing.clear();
  let start = 0;
  // The scene starts with the music (after the count-in).
  if (opts.countIn) {
    engine.launch('__count', await compileCached(CLICK));
    engine.launch('__count', engine.silence, { notBefore: 1 });
    start = 1;
  }
  useStore.getState().setSceneOrigin(start);
  await sync(useStore.getState().song, start);
  useStore.getState().setTransport('playing');
  await setMetronome(useStore.getState().metronome);
}

async function setMetronome(on: boolean) {
  if (!engine.isStarted()) return;
  engine.launch('__metro', on ? await compileCached(CLICK) : engine.silence);
}

export function stop() {
  engine.stop();
  playing.clear();
  const store = useStore.getState();
  Object.keys(store.pendingAt).forEach((id) => store.setPending(id, null));
  store.setTransport('stopped');
}

export const generated = () => latest;

/** The arrangement step at a position (bars into the song) and the bars into that step. */
function songStepAt(song: Song, bars: number): { index: number; into: number } | null {
  let start = 0;
  for (let i = 0; i < song.arrangement.length; i++) {
    const st = song.arrangement[i];
    if (!song.scenes.some((x) => x.id === st.sceneId) || st.bars < 1) continue;
    if (bars < start + st.bars) return { index: i, into: bars - start };
    start += st.bars;
  }
  return null;
}

/** The slots a track plays during an arrangement step (carried over from earlier steps when not named). */
function activeAtStep(song: Song, trackId: string, index: number): number[] {
  let active: number[] = [];
  for (let i = 0; i <= index; i++) {
    const scene = song.scenes.find((x) => x.id === song.arrangement[i].sceneId);
    if (scene?.active[trackId]) active = scene.active[trackId];
  }
  return active;
}

/** The slot a track is playing right now and the step within that clip (fractional), or null when silent. */
export function playhead(trackId: string): { slot: number; step: number } | null {
  const pos = engine.position(trackId);
  const { song, songMode } = useStore.getState();
  const track = song.tracks.find((t) => t.id === trackId);
  if (!pos || !track) return null;
  let active = track.active, bars = pos.bars;
  if (songMode) {
    const at = songStepAt(song, pos.bars);
    if (!at) return null;
    active = activeAtStep(song, trackId, at.index);
    bars = at.into;
  }
  const secs = sections(track, active);
  const total = secs.reduce((a, x) => a + x.bars, 0);
  if (!total) return null;
  bars %= total;
  let start = 0;
  for (const sec of secs) {
    if (bars < start + sec.bars) {
      const clip = track.slots[sec.slot]!;
      return { slot: sec.slot, step: ((bars - start) % clip.bars) * 16 };
    }
    start += sec.bars;
  }
  return null;
}

/**
 * Play a drum or note immediately (pads, keys, grid taps) exactly as the clip will play it: the same sound,
 * the same effect controls as the generated code, and a length of `steps` sixteenth notes at the song's tempo.
 */
/**
 * The sounds a track can play from its pads or keys (melodic: every key its keyboard can show — all its rows, an
 * octave below for bends, and the top note — scale pitches included).
 */
function trackSounds(song: Song, track: Track): engine.SoundRef[] {
  if (track.kind === 'drums') {
    return kitVoices(track.bank).map(({ voice }) => voiceSound(track.bank, voice) as engine.SoundRef);
  }
  const scale = findScale(song), notes: number[] = [];
  const kb = keyboardOf(track);
  const span = Math.max(2, kb.layout === 'pads' ? kb.octaves * (kb.perRow ?? 1) : Math.min(2, kb.octaves));
  for (let o = track.octave - 1; o <= track.octave + span; o++) {
    for (let i = 0; i < 12; i++) notes.push((o + 1) * 12 + i);
    for (const d of scale.degrees) notes.push(scalePitch(scale, song.key.tonic, d, o));
  }
  return [{ s: track.sound ?? 'piano', notes }];
}

/**
 * Load sounds ahead of play, so every key and pad sounds the moment it is pressed (each sound's silent lead-in is
 * cut as it loads): one track's, or every track's. Loads are cached, so this is cheap to repeat.
 */
export function warm(song = useStore.getState().song, trackId?: string) {
  if (!engine.isReady()) return;
  song.tracks.forEach((t) => {
    if (trackId && t.id !== trackId) return;
    engine.preload(trackSounds(song, t));
    // Each stroke at its base level.
    if (t.kind === 'drums') kitVoices(t.bank).forEach(({ voice }) => engine.setSampleLevel(voiceSound(t.bank, voice), strokeLevel(t.bank, voice)));
  });
}
/** Start the engine if needed (from a tap, which may unlock audio) and load a track's sounds first, then the rest. */
export function warmTrack(trackId: string) {
  const go = () => { warm(undefined, trackId); warm(); };
  if (engine.isReady()) { go(); return; }
  engine.unlockAudio();
  engine.initEngine().then(go);
}
// Load again when a track's instrument, kit, octave or keyboard (or the scale) changes, and load a track's sounds
// when it is added or selected. Store updates run inside the tap that made them, so the engine may start here.
const soundKey = (song: Song) => JSON.stringify([song.key, song.customScales, song.tracks.map((t) => [t.kind, t.sound, t.bank, t.octave, keyboardOf(t)])]);
let warmedKey = '';
useStore.subscribe((st, prev) => {
  if (st.selected?.trackId && st.selected.trackId !== prev.selected?.trackId) warmTrack(st.selected.trackId);
  const k = soundKey(st.song);
  if (k !== warmedKey && engine.isReady()) { warmedKey = k; warm(st.song); }
});

/** A drum stroke's tuning to the song (model/tuning), as a sound field; nothing for other sounds. */
function tuned(track: Track, value: Record<string, unknown>): Record<string, unknown> {
  if (track.kind !== 'drums' || typeof value.s !== 'string') return {};
  const speed = strokeSpeed(useStore.getState().song, track, value.s);
  return speed !== 1 ? { speed } : {};
}

export function preview(trackId: string, value: Record<string, unknown>, steps = 1) {
  const track = useStore.getState().song.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const controls = fxValues(track);
  const go = () => engine.trigger({ ...value, ...tuned(track, value), ...controls }, steps / 16 / engine.getCps());
  // Once loaded, sound right away in the tap handler; nothing else may run first.
  if (engine.isReady()) { go(); return; }
  engine.unlockAudio();
  engine.initEngine().then(() => { go(); warm(); });
}

/**
 * Like preview, but the note can be stopped early and its pitch can glide: it sounds until stopped (a key held
 * with sustain on) or for `steps` sixteenths at most.
 */
export function hold(trackId: string, value: Record<string, unknown>, steps?: number): engine.HeldNote {
  const track = useStore.getState().song.tracks.find((t) => t.id === trackId);
  if (!track) return { stop() {}, glide() {}, level() {} };
  const v = { ...value, ...tuned(track, value), ...fxValues(track) };
  const max = () => (steps ? steps / 16 / engine.getCps() : 30);
  if (engine.isReady()) return engine.hold(v, max());
  // First sound: the engine is still starting; pass on what happens meanwhile.
  let note: engine.HeldNote | null = null, stopped = false, semis = 0, ratio = 1;
  engine.unlockAudio();
  engine.initEngine().then(() => { note = engine.hold(v, max()); if (semis) note.glide(semis); if (ratio !== 1) note.level(ratio); if (stopped) note.stop(); warm(); });
  return {
    stop(fade) { stopped = true; note?.stop(fade); },
    glide(s, ease) { semis = s; note?.glide(s, ease); },
    level(r) { ratio = r; note?.level(r); },
  };
}

// Note edits (e.g. while recording) are batched so a burst of notes compiles once, keeping taps responsive.
// Launches, stops and mutes apply at once.
let pendingEdit: ReturnType<typeof setTimeout> | undefined;
const launchesChanged = (a: Song, b: Song) =>
  a.tracks.length !== b.tracks.length ||
  a.tracks.some((t, i) => t.id !== b.tracks[i].id || t.active.join() !== b.tracks[i].active.join() || t.mute !== b.tracks[i].mute || t.solo !== b.tracks[i].solo);

useStore.subscribe((state, prev) => {
  if (state.metronome !== prev.metronome && state.transport === 'playing') setMetronome(state.metronome);
  if (state.song === prev.song && state.songMode === prev.songMode) return;
  if (state.song.bpm !== prev.song.bpm) engine.setBpm(state.song.bpm);
  if (state.transport !== 'playing') return;
  clearTimeout(pendingEdit);
  const songChanged = state.songMode && (state.song.arrangement !== prev.song.arrangement || state.song.scenes !== prev.song.scenes);
  if (state.songMode !== prev.songMode || songChanged || launchesChanged(state.song, prev.song)) sync(state.song);
  else pendingEdit = setTimeout(() => sync(useStore.getState().song), 150);
});

/** In song mode: which arrangement step is playing and how far into it, from the heard position. */
export function songPosition(): { index: number; bar: number; bars: number } | null {
  const { songMode, song } = useStore.getState();
  if (!songMode) return null;
  for (const t of song.tracks) {
    const pos = engine.position(t.id);
    const at = pos && songStepAt(song, pos.bars);
    if (at) return { index: at.index, bar: Math.floor(at.into), bars: song.arrangement[at.index].bars };
  }
  return null;
}
