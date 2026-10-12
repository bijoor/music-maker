// Keeps the Strudel engine in step with the song: whenever the song changes, each track's generated code is
// compared with what that track is playing. A change of active clips launches on the next bar; anything else
// (notes, sound, effects, mute, solo) applies immediately.
import { generate, sections, type GeneratedSong } from '../codegen/generate';
import type { Song } from '../model/types';
import { useStore } from '../state/store';
import * as engine from './strudel';

interface Playing {
  /** Code currently playing on the track ('' = silence). */
  code: string;
  /** Active slots of the last launch. */
  active: string;
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
  const g = generate(song);
  latest = g;
  const { setPending } = useStore.getState();
  for (const tc of g.tracks) {
    const track = song.tracks.find((t) => t.id === tc.trackId)!;
    const code = tc.audible ? tc.runnable : '';
    const active = track.active.join(',');
    const prev = playing.get(tc.trackId);
    if (prev && prev.code === code && prev.active === active) continue;
    const pattern = code ? await compileCached(code) : engine.silence;
    if (!prev || prev.active !== active) {
      const at = engine.launch(tc.trackId, pattern, { period: tc.period, notBefore });
      if (engine.isStarted() && at > engine.cycleNow()) setPending(tc.trackId, at);
    } else {
      engine.edit(tc.trackId, pattern, tc.period);
    }
    playing.set(tc.trackId, { code, active });
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

/** The slot a track is playing right now and the step within that clip (fractional), or null when silent. */
export function playhead(trackId: string): { slot: number; step: number } | null {
  const pos = engine.position(trackId);
  const track = useStore.getState().song.tracks.find((t) => t.id === trackId);
  if (!pos || !track) return null;
  let start = 0;
  for (const sec of sections(track)) {
    if (pos.bars < start + sec.bars) {
      const clip = track.slots[sec.slot]!;
      return { slot: sec.slot, step: ((pos.bars - start) % clip.bars) * 16 };
    }
    start += sec.bars;
  }
  return null;
}

/** Play a drum or note immediately (pads and keys), with the track's sound and effects. */
export function preview(trackId: string, value: Record<string, unknown>) {
  const track = useStore.getState().song.tracks.find((t) => t.id === trackId);
  if (!track) return;
  engine.unlockAudio();
  engine.initEngine().then(() => {
    const f = track.fx;
    engine.trigger({ ...value, gain: f.gain, pan: f.pan, ...(f.lpf ? { lpf: f.lpf } : {}), ...(f.room ? { room: f.room } : {}) });
  });
}

// Follow song changes while playing.
useStore.subscribe((state, prev) => {
  if (state.metronome !== prev.metronome && state.transport === 'playing') setMetronome(state.metronome);
  if (state.song === prev.song) return;
  if (state.song.bpm !== prev.song.bpm) engine.setBpm(state.song.bpm);
  if (state.transport === 'playing') sync(state.song);
});
