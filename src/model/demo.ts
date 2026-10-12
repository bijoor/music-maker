// The starter song: the same clips as the v4 mockup.
import { defaultFx, drumClip, melodicClip, track } from './build';
import type { Song } from './types';

export function demoSong(): Song {
  return {
    version: 1,
    name: 'Demo',
    bpm: 112,
    key: { tonic: 'C', scaleId: 'minor' },
    customScales: [],
    scenes: [],
    arrangement: [],
    tracks: [
      track({
        id: 't1', name: 'Drums', kind: 'drums', color: '#e8590c', bank: 'RolandTR909', fx: defaultFx({ room: 0.15 }),
        slots: [
          drumClip('Groove', 1, [{ bd: [0, 4, 8, 12], sd: [4, 12], hh: [2, 6, 10, 14] }], 'c1'),
          drumClip('Busy hats', 1, [{ bd: [0, 4, 8, 10, 12], sd: [4, 12], hh: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], oh: [14] }], 'c2'),
          drumClip('Fill', 1, [{ bd: [0, 4], sd: [8, 9, 10, 11], ht: [12], mt: [13], lt: [14, 15], cr: [0] }], 'c3'),
          null,
        ],
        active: [0],
      }),
      track({
        id: 't2', name: 'Bass', kind: 'melodic', color: '#2f9e44', sound: 'gm_synth_bass_1', octave: 2, fx: defaultFx({ lpf: 900, gain: 0.9 }),
        slots: [
          melodicClip('Root', 1, [[0, ['c2'], 2], [3, ['c2']], [6, ['g1'], 2], [10, ['bb1']], [12, ['c2'], 2]], 'c4'),
          melodicClip('Walk', 2, [[0, ['c2'], 2], [3, ['eb2']], [6, ['g2'], 2], [10, ['bb1']], [12, ['c2'], 2], [16, ['ab1'], 2], [19, ['ab1']], [22, ['c2'], 2], [26, ['eb2']], [28, ['g1'], 4]], 'c5'),
          null,
          null,
        ],
        active: [0],
      }),
      track({
        id: 't3', name: 'Keys', kind: 'melodic', color: '#1c7ed6', sound: 'piano', octave: 3, poly: true, fx: defaultFx({ room: 0.4, gain: 0.7 }),
        slots: [
          melodicClip('Cm · Ab', 2, [[0, ['c3', 'eb3', 'g3'], 16], [16, ['ab2', 'c3', 'eb3'], 16]], 'c6'),
          melodicClip('Cm Fm Ab G', 4, [[0, ['c3', 'eb3', 'g3'], 16], [16, ['c3', 'f3', 'ab3'], 16], [32, ['ab2', 'c3', 'eb3'], 16], [48, ['b2', 'd3', 'g3'], 16]], 'c7'),
          null,
          null,
        ],
        active: [0],
      }),
      track({
        id: 't4', name: 'Lead', kind: 'melodic', color: '#ae3ec9', sound: 'sawtooth', octave: 4, fx: defaultFx({ lpf: 2400, delay: 0.3, room: 0.3, gain: 0.5 }),
        slots: [
          melodicClip('Motif', 2, [[0, ['g4']], [2, ['bb4']], [4, ['c5'], 2], [8, ['eb5']], [10, ['d5']], [12, ['c5'], 3], [16, ['bb4']], [18, ['g4'], 2], [22, ['f4']], [24, ['g4'], 6]], 'c8'),
          null,
          null,
          null,
        ],
        active: [],
      }),
    ],
  };
}
