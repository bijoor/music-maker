// Helpers to build clips and tracks concisely (demo content and tests).
import { KIT } from './kit';
import { nameToMidi } from './notes';
import { STEPS_PER_BAR, type Bars, type DrumClip, type Fx, type MelodicClip, type Track } from './types';

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyHits = (bars: Bars) => Object.fromEntries(KIT.map((k) => [k.voice, Array(bars * STEPS_PER_BAR).fill(0)]));

/** drumClip('Groove', 1, [{ bd: [0, 4, 8, 12], sd: [4, 12] }]) — one object of voice → steps per bar. */
export function drumClip(name: string, bars: Bars, perBar: Record<string, number[]>[], id = newId('c')): DrumClip {
  const hits = emptyHits(bars);
  perBar.forEach((bar, b) => {
    for (const voice in bar) {
      if (!hits[voice]) hits[voice] = Array(bars * STEPS_PER_BAR).fill(0);
      bar[voice].forEach((s) => (hits[voice][b * STEPS_PER_BAR + s] = 1));
    }
  });
  return { kind: 'drums', id, name, bars, hits };
}

/** melodicClip('Root', 1, [[0, ['c2'], 2], [3, ['eb2']]]) — [step, note names, length in steps]. */
export function melodicClip(name: string, bars: Bars, notes: [number, string[], number?][], id = newId('c')): MelodicClip {
  return {
    kind: 'melodic',
    id,
    name,
    bars,
    notes: notes.map(([step, names, len = 1]) => ({ step, len, pitches: names.map(nameToMidi), vel: 1 })),
  };
}

export const defaultFx = (over: Partial<Fx> = {}): Fx => ({ gain: 1, pan: 0.5, ...over });

export function track(t: Partial<Track> & Pick<Track, 'id' | 'name' | 'kind' | 'color'>): Track {
  return {
    octave: 3,
    poly: false,
    fx: defaultFx(),
    mute: false,
    solo: false,
    slots: [null, null, null, null],
    active: [],
    ...t,
  };
}
