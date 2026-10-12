// Phase 0 test material: small clips whose sounds make each check measurable from the played events.

export const BANK = 'RolandTR909';

// Clip A uses a snare (sd); clip B swaps it for a clap (cp). A clean switch means no sd at or after the
// switch bar and no cp before it.
export const CLIP_A = `s("bd*4, [~ sd]*2, [~ hh]*4").bank("${BANK}")`;
export const CLIP_B = `s("bd*2 [~ bd] bd, [~ cp]*2, hh*8").bank("${BANK}")`;

// A 2-bar bass line: bar 1 starts on c2, bar 2 starts on g1. Launched on any bar it must start with c2.
export const BASS_2BAR = `note("<[c2 ~ c2 ~ eb2 ~ g2 ~] [g1 ~ g1 ~ bb1 ~ c2 ~]>").s("sawtooth").lpf(700).gain(.7)`;

// Three bars of groove then one bar of fill; only the fill uses the clap.
export const GROOVE = `s("bd*4, hh*8").bank("${BANK}")`;
export const FILL = `s("bd sd [sd sd] [sd cp]").bank("${BANK}")`;
export const CHAIN = `arrange([3, ${GROOVE}], [1, ${FILL}])`;

export const METRONOME = `s("rim*4").bank("${BANK}").gain(.8)`;

// The pad voices planned for the drum kit.
export const KIT_VOICES = ['bd', 'sd', 'rim', 'cp', 'hh', 'oh', 'cr', 'rd', 'lt', 'mt', 'ht', 'cb', 'tb', 'sh'];
export const BANKS = ['RolandTR909', 'RolandTR808', 'RolandTR707', 'LinnDrum', 'AkaiMPC60', 'RolandCompurhythm1000'];
