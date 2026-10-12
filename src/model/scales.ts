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
