// Computer keyboard as an instrument (for devices without a touch screen).
//
// Drums mirror the pad layout:      Keys (piano layout, "musical typing"):
//   1 2 3 4   crash ride ohat hat      W E   T Y U   O P      black keys
//   Q W E R   toms ×3, rim            A S D F G H J K L ;     white keys from C
//   A S = kick   D F = snare          Z / X octave down / up, 1–8 chords, hold Shift to sustain
//   T Y G H B N  the smaller pads     Scale pads: A S D F … the scale from Sa, Q W E R … the octave above
// (Mridangam and tabla pads use the same blocks, in their pad order.)

import { kitVoices } from '../model/kit';

const MAIN_ROWS = ['1234', 'qwer', 'asdf'];
const AUX_KEYS = 'tyghbn';

/**
 * Keys for a kit's pads, laid out like the pads: main pads take the 4×3 block 1–4 / Q–R / A–F in order (a wide
 * pad takes two or four keys), smaller pads take T Y G H B N. Returns key → voice and voice → hint.
 */
function layout(bank?: string) {
  const keys: Record<string, string> = {}, hints: Record<string, string> = {};
  const cells = MAIN_ROWS.join('').split('');
  let c = 0, a = 0;
  for (const k of kitVoices(bank)) {
    const mine = k.main ? cells.slice(c, (c += k.span ?? 1)) : AUX_KEYS[a++] ? [AUX_KEYS[a - 1]] : [];
    mine.forEach((key) => (keys[key] = k.voice));
    if (mine.length) hints[k.voice] = (mine.length > 2 ? `${mine[0]}–${mine[mine.length - 1]}` : mine.join(' ')).toUpperCase();
  }
  return { keys, hints };
}
const layouts = new Map<string, ReturnType<typeof layout>>();
const kitLayout = (bank?: string) => {
  const id = bank ?? '';
  if (!layouts.has(id)) layouts.set(id, layout(bank));
  return layouts.get(id)!;
};

/** The pad a computer key plays on a track with this kit or drum machine. */
export const drumKey = (bank: string | undefined, key: string): string | undefined => kitLayout(bank).keys[key];
/** The key shown on a pad. */
export const drumHint = (bank: string | undefined, voice: string): string => kitLayout(bank).hints[voice] ?? '';

/** Piano layout: semitones above the C of the track's octave. */
export const PIANO_KEYS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};
export const PIANO_HINT: Record<number, string> = Object.fromEntries(Object.entries(PIANO_KEYS).map(([k, v]) => [v, k.toUpperCase()]));

/** Scale pads: lower row from Sa of the track's octave, upper row the octave above. */
export const PAD_ROWS = { low: 'asdfghjkl;'.split(''), high: 'qwertyuiop'.split('') };

export const CHORD_KEYS = '12345678'.split('');
