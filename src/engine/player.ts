// Keeps the Strudel engine in step with the song: whenever the song changes, each track's generated code is
// compared with what that track is playing. A change of active clips launches on the next bar; anything else
// (notes, sound, effects, mute, solo) applies immediately.
import { generate, type GeneratedSong } from '../codegen/generate';
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

async function apply(song: Song) {
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
      const at = engine.launch(tc.trackId, pattern, { period: tc.period });
      if (engine.isStarted() && at > engine.cycleNow()) setPending(tc.trackId, at);
    } else {
      engine.edit(tc.trackId, pattern, tc.period);
    }
    playing.set(tc.trackId, { code, active });
  }
}

/** Queue a sync so changes apply in order even though compiling is asynchronous. */
export function sync(song: Song) {
  queue = queue.then(() => apply(song)).catch((err) => console.error('[player] sync failed', err));
  return queue;
}

export async function play() {
  const store = useStore.getState();
  engine.unlockAudio();
  store.setTransport('loading');
  await engine.initEngine();
  engine.setBpm(useStore.getState().song.bpm);
  playing.clear();
  await sync(useStore.getState().song);
  useStore.getState().setTransport('playing');
}

export function stop() {
  engine.stop();
  playing.clear();
  const store = useStore.getState();
  Object.keys(store.pendingAt).forEach((id) => store.setPending(id, null));
  store.setTransport('stopped');
}

export const generated = () => latest;

// Follow song changes while playing.
useStore.subscribe((state, prev) => {
  if (state.song === prev.song) return;
  if (state.song.bpm !== prev.song.bpm) engine.setBpm(state.song.bpm);
  if (state.transport === 'playing') sync(state.song);
});
