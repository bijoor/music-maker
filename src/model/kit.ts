// Drum kit: the 16 pads and which drum machine provides each sound.

export interface KitVoice {
  /** Strudel sound name; `bd:1` means the second bd sample. */
  voice: string;
  name: string;
  /** Large main pad vs smaller pad for less frequent sounds. */
  main: boolean;
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
  { voice: 'bd', name: 'Kick', main: true },
  { voice: 'sd', name: 'Snare', main: true },
  { voice: 'cp', name: 'Clap', main: false },
  { voice: 'cb', name: 'Cowbell', main: false },
  { voice: 'tb', name: 'Tambourine', main: false },
  { voice: 'sh', name: 'Shaker', main: false },
  { voice: 'bd:1', name: 'Kick 2', main: false },
  { voice: 'sd:1', name: 'Snare 2', main: false },
];

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

/** The machine that plays `voice` for a track using `bank`: its own if it has the sound, else the first fallback that does. */
export function voiceBank(bank: string, voice: string): string {
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
