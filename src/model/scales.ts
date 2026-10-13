import type { ScaleDef, Song } from './types';

export const TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Lowercase = komal, Ma♯ = tivra Ma. */
export const SARGAM = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'Ma♯', 'Pa', 'dha', 'Dha', 'ni', 'Ni'];

export const SCALES: ScaleDef[] = [
  { id: 'major', name: 'Major', group: 'Western', degrees: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Minor', group: 'Western', degrees: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', name: 'Dorian', group: 'Western', degrees: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', name: 'Mixolydian', group: 'Western', degrees: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'majpent', name: 'Major pentatonic', group: 'Western', degrees: [0, 2, 4, 7, 9] },
  { id: 'minpent', name: 'Minor pentatonic', group: 'Western', degrees: [0, 3, 5, 7, 10] },
  { id: 'blues', name: 'Blues', group: 'Western', degrees: [0, 3, 5, 6, 7, 10] },
  { id: 'chromatic', name: 'Chromatic', group: 'Western', degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'yaman', name: 'Yaman', group: 'Ragas', degrees: [0, 2, 4, 6, 7, 9, 11], drone: [0, 7] },
  { id: 'bhairav', name: 'Bhairav', group: 'Ragas', degrees: [0, 1, 4, 5, 7, 8, 11], drone: [0, 7] },
  { id: 'bhupali', name: 'Bhupali', group: 'Ragas', degrees: [0, 2, 4, 7, 9], drone: [0, 7] },
  { id: 'malkauns', name: 'Malkauns', group: 'Ragas', degrees: [0, 3, 5, 8, 10], drone: [0, 5] },
  { id: 'kafi', name: 'Kafi', group: 'Ragas', degrees: [0, 2, 3, 5, 7, 9, 10], drone: [0, 7] },
  { id: 'todi', name: 'Todi', group: 'Ragas', degrees: [0, 1, 3, 6, 7, 8, 11], drone: [0, 7] },
  { id: 'darbari', name: 'Darbari', group: 'Ragas', degrees: [0, 2, 3, 5, 7, 8, 10], cents: { 3: -12, 8: -12 }, drone: [0, 7] },
];

export function findScale(song: Song): ScaleDef {
  return [...SCALES, ...song.customScales].find((s) => s.id === song.key.scaleId) ?? SCALES[1];
}

export const tonicPc = (tonic: string) => Math.max(0, TONICS.indexOf(tonic));

/** MIDI pitch of a scale degree (semitones above the tonic) in an octave, including its microtonal offset. */
export function scalePitch(scale: ScaleDef, tonic: string, degree: number, octave: number): number {
  const cents = scale.cents?.[degree] ?? 0;
  return (octave + 1) * 12 + tonicPc(tonic) + degree + cents / 100;
}

const degreeOf = (tonic: string, pitch: number) => ((Math.round(pitch) - tonicPc(tonic)) % 12 + 12) % 12;

export const inScale = (scale: ScaleDef, tonic: string, pitch: number) => scale.degrees.includes(degreeOf(tonic, pitch));

/** Label for a pitch: letter and octave (Eb3), or sargam (komal re) relative to the tonic as Sa. */
export function pitchLabel(pitch: number, tonic: string, sargam: boolean, withOctave = true): string {
  const r = Math.round(pitch);
  const cents = Math.round((pitch - r) * 100);
  const micro = cents ? ` ${cents > 0 ? '+' : '−'}${Math.abs(cents)}¢` : '';
  if (sargam) return SARGAM[degreeOf(tonic, pitch)] + micro;
  return TONICS[((r % 12) + 12) % 12] + (withOctave ? String(Math.floor(r / 12) - 1) : '') + micro;
}

/** Grid rows, highest first: two octaves of the scale from `octave`, the top Sa, plus any other pitches in use. */
export function gridRows(scale: ScaleDef, tonic: string, octave: number, used: number[]): number[] {
  const rows = [scalePitch(scale, tonic, 0, octave + 2)];
  for (let o = octave + 1; o >= octave; o--) for (const d of [...scale.degrees].reverse()) rows.push(scalePitch(scale, tonic, d, o));
  for (const p of used) if (!rows.some((r) => Math.abs(r - p) < 0.001)) rows.push(p);
  return rows.sort((a, b) => b - a);
}

export interface Chord {
  pitches: number[];
  name: string;
  /** Roman numeral for 7-note scales (I, ii, iii°…), else the degree number. */
  numeral: string;
}

/**
 * Triads built on each degree of the scale by stacking every other scale note. With `upperTonic`, the tonic
 * chord an octave up follows, so a row of chords lines up with a row of scale pads ending on the upper Sa.
 */
export function scaleChords(scale: ScaleDef, tonic: string, octave: number, sargam: boolean, upperTonic = false): Chord[] {
  const d = scale.degrees, n = d.length;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const chords = Array.from({ length: Math.min(n, 8) }, (_, i) => {
    const pick = (k: number) => scalePitch(scale, tonic, d[(i + k) % n], octave + Math.floor((i + k) / n));
    const pitches = [pick(0), pick(2), pick(4)];
    const a = Math.round(pitches[1] - pitches[0]), b = Math.round(pitches[2] - pitches[0]);
    const q = a === 4 && b === 7 ? '' : a === 3 && b === 7 ? 'm' : a === 3 && b === 6 ? '°' : a === 4 && b === 8 ? '+' : '';
    const numeral = n === 7 ? (q === '' || q === '+' ? roman[i] : roman[i].toLowerCase()) + (q === '°' ? '°' : '') : String(i + 1);
    // Chord names stay in letters (Cm, Ab); in sargam mode the numeral line shows the swara the chord is built on.
    return { pitches, name: pitchLabel(pitches[0], tonic, false, false) + q, numeral: sargam ? `${numeral} · ${pitchLabel(pitches[0], tonic, true)}` : numeral };
  });
  if (upperTonic && chords.length === n) {
    const top = chords[0];
    const pitches = top.pitches.map((p) => p + 12);
    chords.push({ ...top, pitches, numeral: sargam ? `${top.numeral.split(' · ')[0]} · ${pitchLabel(pitches[0], tonic, true)}` : top.numeral });
  }
  return chords;
}

/**
 * The chord row above the keyboard: over scale pads it lines up with the pads (one chord per scale note, then the
 * tonic an octave up; with two-octave rows, the chords of both octaves), over the piano just the scale's chords.
 */
export function padChords(scale: ScaleDef, tonic: string, octave: number, sargam: boolean, pads: boolean, perRow = 1): Chord[] {
  if (!pads) return scaleChords(scale, tonic, octave, sargam);
  if (perRow === 2) return [...scaleChords(scale, tonic, octave, sargam), ...scaleChords(scale, tonic, octave + 1, sargam, true)];
  return scaleChords(scale, tonic, octave, sargam, true);
}
