// Sounds offered for melodic tracks: Strudel samples, synths, General MIDI soundfonts (gm_*), and recorded
// instruments from VCSL (CC0) and tonejs-instruments (CC-BY 3.0, see public/samples/tonejs.json and README).
// "(sampled)" marks a recording of the real instrument where a soundfont version is also offered.

export const SOUNDS: { id: string; name: string; group: string }[] = [
  { id: 'harmonium', name: 'Harmonium', group: 'Indian' },
  { id: 'gm_sitar', name: 'Sitar', group: 'Indian' },
  { id: 'gm_shanai', name: 'Shehnai', group: 'Indian' },
  { id: 'gm_flute', name: 'Flute (bansuri-like)', group: 'Indian' },
  { id: 'gm_dulcimer', name: 'Dulcimer (santoor-like)', group: 'Indian' },
  { id: 'psaltery_pluck', name: 'Psaltery (swarmandal-like)', group: 'Indian' },

  { id: 'piano', name: 'Piano', group: 'Keys' },
  { id: 'steinway', name: 'Grand piano', group: 'Keys' },
  { id: 'gm_epiano1', name: 'Electric piano', group: 'Keys' },
  { id: 'gm_reed_organ', name: 'Reed organ', group: 'Keys' },
  { id: 'gm_accordion', name: 'Accordion', group: 'Keys' },
  { id: 'church_organ', name: 'Church organ', group: 'Keys' },
  { id: 'gm_drawbar_organ', name: 'Drawbar organ', group: 'Keys' },

  { id: 'acoustic_guitar', name: 'Acoustic guitar', group: 'Guitars' },
  { id: 'nylon_guitar', name: 'Nylon guitar (sampled)', group: 'Guitars' },
  { id: 'gm_acoustic_guitar_nylon', name: 'Nylon guitar', group: 'Guitars' },
  { id: 'gm_acoustic_guitar_steel', name: 'Steel-string guitar', group: 'Guitars' },
  { id: 'electric_guitar', name: 'Electric guitar', group: 'Guitars' },
  { id: 'gm_electric_guitar_jazz', name: 'Jazz guitar', group: 'Guitars' },
  { id: 'gm_electric_guitar_muted', name: 'Muted guitar', group: 'Guitars' },
  { id: 'gm_overdriven_guitar', name: 'Overdriven guitar', group: 'Guitars' },
  { id: 'gm_distortion_guitar', name: 'Distortion guitar', group: 'Guitars' },
  { id: 'gm_banjo', name: 'Banjo', group: 'Guitars' },
  { id: 'strumstick', name: 'Strumstick', group: 'Guitars' },

  { id: 'violin', name: 'Violin (sampled)', group: 'Strings' },
  { id: 'gm_violin', name: 'Violin', group: 'Strings' },
  { id: 'cello', name: 'Cello (sampled)', group: 'Strings' },
  { id: 'gm_cello', name: 'Cello', group: 'Strings' },
  { id: 'gm_string_ensemble_1', name: 'String ensemble', group: 'Strings' },
  { id: 'gm_pizzicato_strings', name: 'Pizzicato strings', group: 'Strings' },
  { id: 'gm_synth_strings_1', name: 'Synth strings', group: 'Strings' },
  { id: 'concert_harp', name: 'Harp', group: 'Strings' },
  { id: 'gm_koto', name: 'Koto', group: 'Strings' },

  { id: 'flute', name: 'Flute (sampled)', group: 'Wind' },
  { id: 'gm_pan_flute', name: 'Pan flute', group: 'Wind' },
  { id: 'recorder_alto_sus', name: 'Recorder', group: 'Wind' },
  { id: 'ocarina', name: 'Ocarina', group: 'Wind' },
  { id: 'gm_oboe', name: 'Oboe', group: 'Wind' },
  { id: 'clarinet', name: 'Clarinet', group: 'Wind' },
  { id: 'bassoon', name: 'Bassoon', group: 'Wind' },
  { id: 'saxophone', name: 'Saxophone', group: 'Wind' },
  { id: 'harmonica', name: 'Harmonica', group: 'Wind' },

  { id: 'trumpet', name: 'Trumpet', group: 'Brass' },
  { id: 'trombone', name: 'Trombone', group: 'Brass' },
  { id: 'french_horn', name: 'French horn', group: 'Brass' },
  { id: 'tuba', name: 'Tuba', group: 'Brass' },

  { id: 'gm_vibraphone', name: 'Vibraphone', group: 'Mallets & bells' },
  { id: 'gm_marimba', name: 'Marimba', group: 'Mallets & bells' },
  { id: 'xylophone_tj', name: 'Xylophone', group: 'Mallets & bells' },
  { id: 'gm_kalimba', name: 'Kalimba', group: 'Mallets & bells' },
  { id: 'glockenspiel', name: 'Glockenspiel', group: 'Mallets & bells' },
  { id: 'tubularbells', name: 'Tubular bells', group: 'Mallets & bells' },
  { id: 'gm_steel_drums', name: 'Steel drums', group: 'Mallets & bells' },

  { id: 'gm_acoustic_bass', name: 'Acoustic bass', group: 'Bass' },
  { id: 'double_bass', name: 'Double bass (sampled)', group: 'Bass' },
  { id: 'electric_bass', name: 'Electric bass', group: 'Bass' },
  { id: 'gm_fretless_bass', name: 'Fretless bass', group: 'Bass' },
  { id: 'gm_synth_bass_1', name: 'Synth bass', group: 'Bass' },

  { id: 'gm_choir_aahs', name: 'Choir', group: 'Voice' },
  { id: 'gm_voice_oohs', name: 'Voice oohs', group: 'Voice' },

  { id: 'sawtooth', name: 'Saw lead', group: 'Synth' },
  { id: 'square', name: 'Square lead', group: 'Synth' },
  { id: 'triangle', name: 'Soft triangle', group: 'Synth' },
  { id: 'supersaw', name: 'Supersaw', group: 'Synth' },
];

export const soundName = (id?: string) => SOUNDS.find((s) => s.id === id)?.name ?? id ?? '';
