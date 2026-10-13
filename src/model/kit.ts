// Drum kits: the standard kit's 16 pads and which drum machine provides each sound, plus kits of single
// strokes a track chooses in place of a drum machine: the Indian kits (mridangam and tabla) and kits the player
// records (My kits, bank `my:<id>`).

export interface KitVoice {
  /** Strudel sound name; `bd:1` means the second bd sample. */
  voice: string;
  name: string;
  /** Large main pad vs smaller pad for less frequent sounds. */
  main: boolean;
  /** Main pads per row of four that this pad covers (2 for kick and snare, 4 for a full-width pad). */
  span?: 2 | 4;
  /** Indian kits: the hand that plays the stroke (pads are laid out left hand | both | right hand). */
  hand?: Hand;
  /** Sliding a finger up on the pad raises the stroke's pitch (a bass head pressed by the hand). */
  bends?: boolean;
}

/** A kit the player recorded: its strokes' sounds live on this device (see state/sampleDb). */
export interface MyKit {
  id: string;
  name: string;
  strokes: KitVoice[];
  /** The + Track group the kit belongs to: 'drums' or 'indian-drums' (the default). */
  group?: string;
}

let myKits: MyKit[] = [];
/** The player's recorded kits (kept in step with the store). */
export const setMyKits = (kits: MyKit[]) => { myKits = kits; };
export const getMyKits = () => myKits;
export const myKitBank = (id: string) => `my:${id}`;
const myKit = (bank?: string) => (bank?.startsWith('my:') ? myKits.find((k) => k.id === bank.slice(3)) : undefined);
/** A drum kit's name as the kit menu shows it. */
export const kitName = (bank?: string) => myKit(bank)?.name ?? bank?.replace('Roland', '') ?? '';

export type Hand = 'left' | 'both' | 'right';

/** What each hand's drum is called, per Indian kit. */
const HAND_NAMES: Record<string, Record<Hand, string>> = {
  Tabla: { left: 'Left hand · bayan', both: 'Both hands', right: 'Right hand · dayan' },
  Mridangam: { left: 'Left hand · thoppi', both: 'Both hands', right: 'Right hand · valanthalai' },
};
const PLAIN_HANDS: Record<Hand, string> = { left: 'Left hand', both: 'Both hands', right: 'Right hand' };
export const handName = (bank: string | undefined, hand: Hand) => (bank && HAND_NAMES[bank]?.[hand]) || PLAIN_HANDS[hand];

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
 * Indian kits: each voice is a sample set of its own (no drum machine), named by stroke, in grid order: right hand
 * (treble) on top, strokes for both hands, then the left hand (bass) at the bottom. Mridangam strokes are from
 * yaxu/mrid (CC BY-SA, Arthur Carabott, played by Harishankar V Menon); tabla strokes were chosen by ear from three
 * Freesound packs (see scripts/make-sample-maps.mjs and the README).
 */
export const INDIAN_KITS: Record<string, KitVoice[]> = {
  Mridangam: [
    { voice: 'nam', name: 'Nam', main: true, hand: 'right' },
    { voice: 'dhin', name: 'Dhin', main: true, hand: 'right' },
    { voice: 'chaapu', name: 'Chapu', main: true, hand: 'right' },
    { voice: 'ardha', name: 'Ardha chapu', main: true, hand: 'right' },
    { voice: 'ta', name: 'Ta', main: true, hand: 'right' },
    { voice: 'dhi', name: 'Dhi', main: true, hand: 'right' },
    { voice: 'na', name: 'Na', main: true, hand: 'right' },
    { voice: 'ka', name: 'Ka', main: true, hand: 'right' },
    { voice: 'dhum', name: 'Dhum', main: true, hand: 'both' },
    { voice: 'thom', name: 'Thom', main: true, hand: 'left', bends: true },
    { voice: 'tha', name: 'Tha', main: true, hand: 'left' },
    { voice: 'gumki', name: 'Gumki', main: true, hand: 'left' },
    { voice: 'ki', name: 'Ki', main: true, hand: 'left' },
  ],
  Tabla: [
    { voice: 'tabla_na', name: 'Na', main: true, hand: 'right' },
    { voice: 'tabla_ta', name: 'Ta', main: true, hand: 'right' },
    { voice: 'tabla_tin', name: 'Tin', main: true, hand: 'right' },
    { voice: 'tabla_tun', name: 'Tun', main: true, hand: 'right' },
    { voice: 'tabla_te', name: 'Te', main: true, hand: 'right' },
    { voice: 'tabla_te2', name: 'Te 2', main: true, hand: 'right' },
    { voice: 'tabla_tak', name: 'Tak', main: true, hand: 'right' },
    { voice: 'tabla_dha', name: 'Dha', main: true, hand: 'both' },
    { voice: 'tabla_dhin', name: 'Dhin', main: true, hand: 'both' },
    { voice: 'tabla_ge', name: 'Ge', main: true, hand: 'left', bends: true },
    { voice: 'tabla_ghe', name: 'Ghe', main: true, hand: 'left' },
    { voice: 'tabla_gha', name: 'Gha', main: true, hand: 'left' },
    { voice: 'tabla_ke', name: 'Ke', main: true, hand: 'left' },
    { voice: 'tabla_kat', name: 'Kat', main: true, hand: 'left' },
  ],
};

const indianVoices = new Set(Object.values(INDIAN_KITS).flat().map((k) => k.voice));

export const isIndianKit = (bank?: string) => !!bank && bank in INDIAN_KITS;
/** A kit of single strokes with no drum machine: an Indian kit or one the player recorded. */
export const isStrokeKit = (bank?: string) => isIndianKit(bank) || !!bank?.startsWith('my:');

const HAND_ORDER: Record<Hand, number> = { right: 0, both: 1, left: 2 };
/**
 * The pads of a track's kit: an Indian kit's strokes, a recorded kit's strokes (right hand first, as in the grid;
 * nothing when that kit is not on this device), or the standard kit for any drum machine.
 */
export const kitVoices = (bank?: string): KitVoice[] => {
  if (bank && INDIAN_KITS[bank]) return INDIAN_KITS[bank];
  if (bank?.startsWith('my:')) return [...(myKit(bank)?.strokes ?? [])].sort((a, b) => HAND_ORDER[a.hand ?? 'right'] - HAND_ORDER[b.hand ?? 'right']);
  return KIT;
};

/** Whether `voice` belongs to the track's kit (hits of another kit are kept but neither shown nor played). */
export const kitHas = (bank: string | undefined, voice: string) => {
  if (bank?.startsWith('my:')) return !myKit(bank) || kitVoices(bank).some((k) => k.voice === voice); // a kit not on this device keeps its hits
  return isIndianKit(bank) ? kitVoices(bank).some((k) => k.voice === voice) : !indianVoices.has(voice.split(':')[0]) && !myKits.some((m) => m.strokes.some((k) => k.voice === voice));
};

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
  if (isStrokeKit(bank)) return '';
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
