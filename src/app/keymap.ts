// Computer keyboard as an instrument (for devices without a touch screen).
//
// Drums mirror the pad layout:      Keys (piano layout, "musical typing"):
//   1 2 3 4   crash ride ohat hat      W E   T Y U   O P      black keys
//   Q W E R   toms ×3, rim            A S D F G H J K L ;     white keys from C
//   A S = kick   D F = snare          Z / X octave down / up, 1–8 chords, hold Shift to sustain
//   T Y G H B N  the smaller pads     Scale pads: A S D F … the scale from Sa, Q W E R … the octave above

export const DRUM_KEYS: Record<string, string> = {
  '1': 'cr', '2': 'rd', '3': 'oh', '4': 'hh',
  q: 'ht', w: 'mt', e: 'lt', r: 'rim',
  a: 'bd', s: 'bd', d: 'sd', f: 'sd',
  t: 'cp', y: 'cb', g: 'tb', h: 'sh', b: 'bd:1', n: 'sd:1',
};

/** The key shown on each drum pad. */
export const DRUM_HINT: Record<string, string> = { cr: '1', rd: '2', oh: '3', hh: '4', ht: 'Q', mt: 'W', lt: 'E', rim: 'R', bd: 'A S', sd: 'D F', cp: 'T', cb: 'Y', tb: 'G', sh: 'H', 'bd:1': 'B', 'sd:1': 'N' };

/** Piano layout: semitones above the C of the track's octave. */
export const PIANO_KEYS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};
export const PIANO_HINT: Record<number, string> = Object.fromEntries(Object.entries(PIANO_KEYS).map(([k, v]) => [v, k.toUpperCase()]));

/** Scale pads: lower row from Sa of the track's octave, upper row the octave above. */
export const PAD_ROWS = { low: 'asdfghjkl;'.split(''), high: 'qwertyuiop'.split('') };

export const CHORD_KEYS = '12345678'.split('');
