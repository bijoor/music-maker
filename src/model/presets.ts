// Drum presets (one bar, 16 steps) and the instruments offered when adding a track.

export const DRUM_PRESETS: Record<string, Record<string, number[]>> = {
  'Four on the floor': { bd: [0, 4, 8, 12], cp: [4, 12], hh: [2, 6, 10, 14] },
  'Boom bap': { bd: [0, 7, 10], sd: [4, 12], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  Rock: { bd: [0, 8, 10], sd: [4, 12], hh: [0, 2, 4, 6, 8, 10, 12, 14], cr: [0] },
  Breakbeat: { bd: [0, 2, 10, 11], sd: [4, 7, 9, 12, 15], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  'Bossa nova': { bd: [0, 3, 8, 11], rim: [0, 3, 6, 10, 13], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  Reggaeton: { bd: [0, 4, 8, 12], sd: [3, 6, 11, 14], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  // Rough kit versions of Indian taals until tabla samples are added.
  Keherwa: { bd: [0, 2, 12], lt: [2], rim: [4, 8, 12, 14], hh: [6, 10] },
  Teentaal: { bd: [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15], rim: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], oh: [0] },
};

export interface InstrumentPreset {
  label: string;
  name: string;
  kind: 'drums' | 'melodic';
  color: string;
  bank?: string;
  sound?: string;
  octave: number;
  poly: boolean;
  /** Start with a held drone clip on the scale's drone notes (Sa–Pa). */
  drone?: boolean;
}

export const INSTRUMENTS: InstrumentPreset[] = [
  { label: 'Drum kit · TR-909', name: 'Drums', kind: 'drums', color: '#e8590c', bank: 'RolandTR909', octave: 3, poly: false },
  { label: 'Drum kit · TR-808', name: 'Drums 808', kind: 'drums', color: '#f08c00', bank: 'RolandTR808', octave: 3, poly: false },
  { label: 'Drum kit · LinnDrum', name: 'Linn', kind: 'drums', color: '#e67700', bank: 'LinnDrum', octave: 3, poly: false },
  { label: 'Synth bass', name: 'Bass', kind: 'melodic', color: '#2f9e44', sound: 'gm_synth_bass_1', octave: 2, poly: false },
  { label: 'Piano', name: 'Piano', kind: 'melodic', color: '#1c7ed6', sound: 'piano', octave: 3, poly: true },
  { label: 'Saw lead', name: 'Lead', kind: 'melodic', color: '#ae3ec9', sound: 'sawtooth', octave: 4, poly: false },
  { label: 'Strings', name: 'Strings', kind: 'melodic', color: '#0c8599', sound: 'gm_synth_strings_1', octave: 3, poly: true },
  { label: 'Sitar', name: 'Sitar', kind: 'melodic', color: '#b35c00', sound: 'gm_sitar', octave: 3, poly: false },
  { label: 'Flute (bansuri-like)', name: 'Flute', kind: 'melodic', color: '#3b8a8a', sound: 'gm_flute', octave: 4, poly: false },
  { label: 'Drone (Sa–Pa)', name: 'Drone', kind: 'melodic', color: '#c2255c', sound: 'gm_reed_organ', octave: 3, poly: true, drone: true },
];
