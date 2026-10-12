// Keeps the Strudel engine in step with the song: whenever the song changes, each track's generated code is
// compared with what that track is playing. A change of active clips launches on the next bar; anything else
// (notes, sound, effects, mute, solo) applies immediately.
import { fxValues, generate, sections, type GeneratedSong } from '../codegen/generate';
import type { Song } from '../model/types';
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

async function compileCached(code: string) {
  if (!compiled.has(code)) compiled.set(code, await engine.compile(code));
  return compiled.get(code);
}

// Clicks for the count-in and the metronome, on their own engine tracks (not part of the song).
const CLICK = 's("rim*4").bank("RolandTR909").gain("[.9 .45 .45 .45]")';

async function apply(song: Song, notBefore = 0) {
  const g = generate(song, { songMode: useStore.getState().songMode });
  latest = g;
  // Compile everything first, then launch together, so all tracks that change switch on the same bar.
  const work: { tc: (typeof g.tracks)[number]; code: string; pattern: unknown; launch: boolean }[] = [];
  for (const tc of g.tracks) {
    const code = tc.audible ? tc.runnable : '';
    const prev = playing.get(tc.trackId);
    if (prev && prev.code === code && prev.key === tc.playKey) continue;
    const pattern = code ? await compileCached(code) : engine.silence;
    work.push({ tc, code, pattern, launch: !prev || prev.key !== tc.playKey });
  }
  const { setPending } = useStore.getState();
  for (const { tc, code, pattern, launch } of work) {
    if (launch) {
      const at = engine.launch(tc.trackId, pattern, { period: tc.period, notBefore });
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
  engine.setBpm(useStore.getState().song.bpm);
  playing.clear();
  let start = 0;
  if (opts.countIn) {
    engine.launch('__count', await compileCached(CLICK));
    engine.launch('__count', engine.silence, { notBefore: 1 });
    start = 1;
  }
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
export function preview(trackId: string, value: Record<string, unknown>, steps = 1) {
  const track = useStore.getState().song.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const controls = fxValues(track);
  const go = () => engine.trigger({ ...value, ...controls }, steps / 16 / engine.getCps());
  // Once loaded, sound right away in the tap handler; nothing else may run first.
  if (engine.isReady()) { go(); return; }
  engine.unlockAudio();
  engine.initEngine().then(go);
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
