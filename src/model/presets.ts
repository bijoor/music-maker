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

/** Presets for the Indian kits, one bar of 16 steps. */
export const INDIAN_PRESETS: Record<string, Record<string, Record<string, number[]>>> = {
  Tabla: {
    // Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha — one matra per step.
    Teentaal: { tabla_dha: [0, 3, 4, 7, 8, 15], tabla_dhin: [1, 2, 5, 6, 13, 14], tabla_tin: [9, 10], tabla_ta: [11, 12] },
    // Dha Ge Na Te | Na Ka Dhin Na — one matra per eighth note.
    Keherwa: { tabla_dha: [0], tabla_ge: [2], tabla_na: [4, 8, 14], tabla_te: [6], tabla_kat: [10], tabla_dhin: [12] },
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

/** A keyboard layout for melodic tracks: piano keys or scale pads, one or two octaves. */
export interface KeyboardSetup {
  layout: 'piano' | 'pads';
  octaves: 1 | 2;
}

/**
 * A kind of track offered by + Track. Tracks take the group's colour and are named after it ("Strings",
 * "Strings 2"); melodic groups also set the starting instrument and keyboard layout, and list their instruments
 * first in the track's instrument menu.
 */
export interface InstrumentPreset {
  /** Group id (stored on the track). */
  id: string;
  /** What + Track shows. */
  label: string;
  /** Default track name. */
  name: string;
  kind: 'drums' | 'melodic';
  color: string;
  bank?: string;
  sound?: string;
  octave: number;
  poly: boolean;
  /** Start with a held drone clip on the scale's drone notes (Sa–Pa). */
  drone?: boolean;
  /** Melodic groups: the keyboard a new track opens with. */
  keyboard?: KeyboardSetup;
  /** Melodic groups: the instrument menu's groups (model/sounds) that belong here, listed first. */
  sounds?: string[];
}

export const GROUPS: InstrumentPreset[] = [
  { id: 'drums', label: 'Drums', name: 'Drums', kind: 'drums', color: '#e8590c', bank: 'RolandTR909', octave: 3, poly: false },
  { id: 'indian-drums', label: 'Indian drums', name: 'Indian drums', kind: 'drums', color: '#a5531c', bank: 'Tabla', octave: 3, poly: false },
  { id: 'indian', label: 'Indian', name: 'Indian', kind: 'melodic', color: '#b35c00', sound: 'harmonium', octave: 3, poly: true, keyboard: { layout: 'pads', octaves: 2 }, sounds: ['Indian'] },
  { id: 'keys', label: 'Keys', name: 'Keys', kind: 'melodic', color: '#1c7ed6', sound: 'piano', octave: 3, poly: true, keyboard: { layout: 'piano', octaves: 2 }, sounds: ['Keys', 'Mallets & bells'] },
  { id: 'strings', label: 'Strings & guitars', name: 'Strings', kind: 'melodic', color: '#0c8599', sound: 'gm_string_ensemble_1', octave: 3, poly: true, keyboard: { layout: 'piano', octaves: 2 }, sounds: ['Strings', 'Guitars'] },
  { id: 'wind', label: 'Wind & brass', name: 'Wind', kind: 'melodic', color: '#3b8a8a', sound: 'flute', octave: 4, poly: false, keyboard: { layout: 'pads', octaves: 2 }, sounds: ['Wind', 'Brass'] },
  { id: 'bass', label: 'Bass', name: 'Bass', kind: 'melodic', color: '#2f9e44', sound: 'gm_synth_bass_1', octave: 2, poly: false, keyboard: { layout: 'piano', octaves: 2 }, sounds: ['Bass'] },
  { id: 'synth', label: 'Synth', name: 'Synth', kind: 'melodic', color: '#ae3ec9', sound: 'sawtooth', octave: 4, poly: false, keyboard: { layout: 'piano', octaves: 2 }, sounds: ['Synth', 'Voice'] },
  { id: 'drone', label: 'Drone (Sa–Pa)', name: 'Drone', kind: 'melodic', color: '#c2255c', sound: 'harmonium', octave: 3, poly: true, drone: true, keyboard: { layout: 'pads', octaves: 1 }, sounds: ['Indian', 'Keys'] },
];

/** Kept for older callers: the groups are the instruments + Track offers. */
export const INSTRUMENTS = GROUPS;

export const groupById = (id?: string) => GROUPS.find((g) => g.id === id);
