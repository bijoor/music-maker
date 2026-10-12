// Drum kits: the standard kit's 16 pads and which drum machine provides each sound, plus the Indian kits
// (mridangam and tabla strokes), which a track chooses in place of a drum machine.

export interface KitVoice {
  /** Strudel sound name; `bd:1` means the second bd sample. */
  voice: string;
  name: string;
  /** Large main pad vs smaller pad for less frequent sounds. */
  main: boolean;
  /** Main pads per row of four that this pad covers (2 for kick and snare, 4 for a full-width pad). */
  span?: 2 | 4;
}

export const KIT: KitVoice[] = [
  { voice: 'cr', name: 'Crash', main: true },
  { voice: 'rd', name: 'Ride', main: true },
  { voice: 'oh', name: 'Open hat', main: true },
  { voice: 'hh', name: 'Closed hat', main: true },
  { voice: 'ht', name: 'High tom', main: true },
  { voice: 'mt', name: 'Mid tom', main: true },
  { voice: 'lt', name: 'Low tom', main: true },
  { voice: 'rim', name: 'Rim', main: true },
  { voice: 'bd', name: 'Kick', main: true, span: 2 },
  { voice: 'sd', name: 'Snare', main: true, span: 2 },
  { voice: 'cp', name: 'Clap', main: false },
  { voice: 'cb', name: 'Cowbell', main: false },
  { voice: 'tb', name: 'Tambourine', main: false },
  { voice: 'sh', name: 'Shaker', main: false },
  { voice: 'bd:1', name: 'Kick 2', main: false },
  { voice: 'sd:1', name: 'Snare 2', main: false },
];

/**
 * Indian kits: each voice is a sample set of its own (no drum machine), named by stroke. Mridangam strokes are
 * from yaxu/mrid (CC BY-SA, Arthur Carabott, played by Harishankar V Menon); tabla strokes are TidalCycles
 * Dirt-Samples recordings grouped under the nearest bol (see scripts/make-sample-maps.mjs).
 */
export const INDIAN_KITS: Record<string, KitVoice[]> = {
  Mridangam: [
    { voice: 'nam', name: 'Nam', main: true },
    { voice: 'dhin', name: 'Dhin', main: true },
    { voice: 'chaapu', name: 'Chapu', main: true },
    { voice: 'ardha', name: 'Ardha chapu', main: true },
    { voice: 'ta', name: 'Ta', main: true },
    { voice: 'ki', name: 'Ki', main: true },
    { voice: 'dhi', name: 'Dhi', main: true },
    { voice: 'dhum', name: 'Dhum', main: true },
    { voice: 'thom', name: 'Thom', main: true, span: 2 },
    { voice: 'tha', name: 'Tha', main: true, span: 2 },
    { voice: 'gumki', name: 'Gumki', main: false },
    { voice: 'ka', name: 'Ka', main: false },
    { voice: 'na', name: 'Na', main: false },
  ],
  Tabla: [
    { voice: 'tabla_na', name: 'Na', main: true },
    { voice: 'tabla_tin', name: 'Tin', main: true },
    { voice: 'tabla_ta', name: 'Ta', main: true },
    { voice: 'tabla_tun', name: 'Tun', main: true },
    { voice: 'tabla_ke', name: 'Ke', main: true, span: 2 },
    { voice: 'tabla_ghe', name: 'Ghe', main: true, span: 2 },
    { voice: 'tabla_ge', name: 'Ge', main: true, span: 4 },
  ],
};

const indianVoices = new Set(Object.values(INDIAN_KITS).flat().map((k) => k.voice));

export const isIndianKit = (bank?: string) => !!bank && bank in INDIAN_KITS;

/** The pads of a track's kit: an Indian kit's strokes, or the standard kit for any drum machine. */
export const kitVoices = (bank?: string): KitVoice[] => (bank && INDIAN_KITS[bank]) || KIT;

/** Whether `voice` belongs to the track's kit (hits of another kit are kept but neither shown nor played). */
export const kitHas = (bank: string | undefined, voice: string) =>
  isIndianKit(bank) ? kitVoices(bank).some((k) => k.voice === voice) : !indianVoices.has(voice.split(':')[0]);

/** Sounds each drum machine provides (from the Phase 0 check of Strudel's tidal-drum-machines library). */
export const BANK_VOICES: Record<string, string[]> = {
  RolandTR909: ['bd', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'rd', 'rim', 'sd'],
  RolandTR808: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'perc', 'rim', 'sd', 'sh'],
  RolandTR707: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'rim', 'sd', 'tb'],
  LinnDrum: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'perc', 'rd', 'rim', 'sd', 'sh', 'tb'],
};

export const BANKS = Object.keys(BANK_VOICES);

/** Machines to borrow a missing sound from, in order of preference. */
const FALLBACK = ['RolandTR808', 'RolandTR707', 'LinnDrum'];

/**
 * The machine that plays `voice` for a track using `bank`: its own if it has the sound, else the first fallback
 * that does; '' for an Indian kit, whose strokes are sounds of their own.
 */
export function voiceBank(bank: string, voice: string): string {
  if (isIndianKit(bank)) return '';
  const base = voice.split(':')[0];
  if (BANK_VOICES[bank]?.includes(base)) return bank;
  return FALLBACK.find((b) => BANK_VOICES[b].includes(base)) ?? bank;
}

/** Order of voices in generated code: kick first, as drummers read it. */
const CODE_ORDER = ['bd', 'bd:1', 'sd', 'sd:1', 'rim', 'cp', 'hh', 'oh', 'rd', 'cr', 'lt', 'mt', 'ht', 'cb', 'tb', 'sh'];

export const voiceOrder = (voice: string) => {
  const i = CODE_ORDER.indexOf(voice);
  return i < 0 ? CODE_ORDER.length : i;
};

/** The value that plays a pad: `bd:1` → { s: 'bd', n: 1, bank }. */
export function voiceSound(bank: string | undefined, voice: string): Record<string, unknown> {
  const [s, n] = voice.split(':');
  const b = voiceBank(bank ?? 'RolandTR909', voice);
  return { s, ...(n ? { n: +n } : {}), ...(b ? { bank: b } : {}) };
}
