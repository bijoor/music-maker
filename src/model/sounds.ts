// Sounds offered for melodic tracks: Strudel samples, synths and General MIDI soundfonts.

export const SOUNDS: { id: string; name: string; group: string }[] = [
  { id: 'piano', name: 'Piano', group: 'Keys' },
  { id: 'gm_epiano1', name: 'Electric piano', group: 'Keys' },
  { id: 'gm_reed_organ', name: 'Reed organ (harmonium)', group: 'Keys' },
  { id: 'gm_accordion', name: 'Accordion', group: 'Keys' },
  { id: 'gm_vibraphone', name: 'Vibraphone', group: 'Keys' },
  { id: 'gm_marimba', name: 'Marimba', group: 'Keys' },
  { id: 'gm_kalimba', name: 'Kalimba', group: 'Keys' },
  { id: 'gm_sitar', name: 'Sitar', group: 'Strings' },
  { id: 'gm_acoustic_guitar_nylon', name: 'Nylon guitar', group: 'Strings' },
  { id: 'gm_electric_guitar_muted', name: 'Muted guitar', group: 'Strings' },
  { id: 'gm_koto', name: 'Koto', group: 'Strings' },
  { id: 'gm_violin', name: 'Violin', group: 'Strings' },
  { id: 'gm_cello', name: 'Cello', group: 'Strings' },
  { id: 'gm_string_ensemble_1', name: 'String ensemble', group: 'Strings' },
  { id: 'gm_synth_strings_1', name: 'Synth strings', group: 'Strings' },
  { id: 'gm_flute', name: 'Flute (bansuri-like)', group: 'Wind' },
  { id: 'gm_shanai', name: 'Shehnai', group: 'Wind' },
  { id: 'gm_pan_flute', name: 'Pan flute', group: 'Wind' },
  { id: 'gm_oboe', name: 'Oboe', group: 'Wind' },
  { id: 'gm_choir_aahs', name: 'Choir', group: 'Voice' },
  { id: 'gm_voice_oohs', name: 'Voice oohs', group: 'Voice' },
  { id: 'gm_synth_bass_1', name: 'Synth bass', group: 'Bass' },
  { id: 'gm_acoustic_bass', name: 'Acoustic bass', group: 'Bass' },
  { id: 'sawtooth', name: 'Saw lead', group: 'Synth' },
  { id: 'square', name: 'Square lead', group: 'Synth' },
  { id: 'triangle', name: 'Soft triangle', group: 'Synth' },
  { id: 'supersaw', name: 'Supersaw', group: 'Synth' },
];

export const soundName = (id?: string) => SOUNDS.find((s) => s.id === id)?.name ?? id ?? '';
