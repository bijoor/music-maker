// Drum presets (one bar, 16 steps) and the instruments offered when adding a track.

export const DRUM_PRESETS: Record<string, Record<string, number[]>> = {
  'Four on the floor': { bd: [0, 4, 8, 12], cp: [4, 12], hh: [2, 6, 10, 14] },
  'Boom bap': { bd: [0, 7, 10], sd: [4, 12], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  Rock: { bd: [0, 8, 10], sd: [4, 12], hh: [0, 2, 4, 6, 8, 10, 12, 14], cr: [0] },
  Breakbeat: { bd: [0, 2, 10, 11], sd: [4, 7, 9, 12, 15], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  'Bossa nova': { bd: [0, 3, 8, 11], rim: [0, 3, 6, 10, 13], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  Reggaeton: { bd: [0, 4, 8, 12], sd: [3, 6, 11, 14], hh: [0, 2, 4, 6, 8, 10, 12, 14] },
  // Kit versions of Indian taals (choose the Tabla kit for the real thing).
  'Keherwa (kit)': { bd: [0, 2, 12], lt: [2], rim: [4, 8, 12, 14], hh: [6, 10] },
  'Teentaal (kit)': { bd: [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15], rim: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], oh: [0] },
};

/**
 * Presets for the Indian kits, one bar of 16 steps. Two strokes on one step make a combined bol: Dha = Na + Ge,
 * Dhin = Tin + Ge on tabla.
 */
export const INDIAN_PRESETS: Record<string, Record<string, Record<string, number[]>>> = {
  Tabla: {
    // Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha — one matra per step.
    Teentaal: {
      tabla_ge: [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15],
      tabla_na: [0, 3, 4, 7, 8, 11, 12, 15],
      tabla_tin: [1, 2, 5, 6, 9, 10, 13, 14],
    },
    // Dha Ge Na Ti | Na Ka Dhi Na — one matra per eighth note.
    Keherwa: { tabla_ge: [0, 2, 12], tabla_na: [0, 4, 8, 14], tabla_ke: [6, 10], tabla_tin: [12] },
  },
  Mridangam: {
    // Adi talam (8 beats, two steps each): Tha Dhi Thom Nam, twice.
    'Adi talam · basic': { tha: [0, 8], dhi: [2, 10], thom: [4, 12], nam: [6, 14] },
    // A busier sarvalaghu-style groove in Adi talam.
    'Adi talam · groove': { thom: [0, 6, 12], nam: [2, 8, 14], dhin: [4, 10], ta: [3, 9], ki: [7, 15], chaapu: [11] },
  },
};

/** The presets offered for a track's kit or drum machine. */
export const drumPresets = (bank?: string) => (bank && INDIAN_PRESETS[bank]) || DRUM_PRESETS;

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
  { label: 'Tabla', name: 'Tabla', kind: 'drums', color: '#a5531c', bank: 'Tabla', octave: 3, poly: false },
  { label: 'Mridangam', name: 'Mridangam', kind: 'drums', color: '#8f5a2b', bank: 'Mridangam', octave: 3, poly: false },
  { label: 'Synth bass', name: 'Bass', kind: 'melodic', color: '#2f9e44', sound: 'gm_synth_bass_1', octave: 2, poly: false },
  { label: 'Piano', name: 'Piano', kind: 'melodic', color: '#1c7ed6', sound: 'piano', octave: 3, poly: true },
  { label: 'Saw lead', name: 'Lead', kind: 'melodic', color: '#ae3ec9', sound: 'sawtooth', octave: 4, poly: false },
  { label: 'Strings', name: 'Strings', kind: 'melodic', color: '#0c8599', sound: 'gm_synth_strings_1', octave: 3, poly: true },
  { label: 'Harmonium', name: 'Harmonium', kind: 'melodic', color: '#9c3d54', sound: 'harmonium', octave: 3, poly: true },
  { label: 'Acoustic guitar', name: 'Guitar', kind: 'melodic', color: '#7a5c2e', sound: 'acoustic_guitar', octave: 3, poly: true },
  { label: 'Sitar', name: 'Sitar', kind: 'melodic', color: '#b35c00', sound: 'gm_sitar', octave: 3, poly: false },
  { label: 'Flute (bansuri-like)', name: 'Flute', kind: 'melodic', color: '#3b8a8a', sound: 'gm_flute', octave: 4, poly: false },
  { label: 'Drone (Sa–Pa)', name: 'Drone', kind: 'melodic', color: '#c2255c', sound: 'gm_reed_organ', octave: 3, poly: true, drone: true },
];
