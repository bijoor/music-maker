// Computer keyboard as an instrument (for devices without a touch screen).
//
// Drums: Space kick, B kick 2, C snare, S snare 2, D rim, M hat, L open hat, F G H toms, P crash, Q ride,
//   R T Y U clap, cowbell, shaker, tambourine.
// Keys (piano layout, "musical typing"): W E  T Y U  O P black keys over A S D F G H J K L ; white keys from C;
//   Z / X octave down / up.
// Scale pads: Z X C V … the scale from Sa, A S D F … the octave above, Q W E R … the next (one row: A S D F …);
//   − / = octave down / up.
// Melodic tracks: 1–9 chords, hold Shift to sustain. Everywhere: Enter plays and stops the song.
// Mridangam and tabla: left-hand strokes on F D S A / R E W Q / V C X Z, right-hand strokes on J K L ; / U I O P /
// M , . /, strokes for both hands on G H T Y B N.

import { padGrid, padOrderVersion } from '../model/padOrder';
import { kitVoices } from '../model/kit';

/**
 * The drum kit's keys, spread like a drummer's limbs: Space kicks, the snares and hats under the fingers, toms on
 * F G H, cymbals at the edges, the small percussion on the row above.
 */
const KIT_KEYS: Record<string, string> = {
  ' ': 'bd', b: 'bd:1', c: 'sd', s: 'sd:1', d: 'rim', m: 'hh', l: 'oh',
  f: 'ht', g: 'mt', h: 'lt', p: 'cr', q: 'rd', r: 'cp', t: 'cb', y: 'sh', u: 'tb',
};
/** Keyboard rows, top to bottom: an Indian kit's pad grid uses as many as it has rows, ending on the bottom one. */
const GRID_KEYS = ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];

/**
 * Keys for a kit's pads: the drum kit's fixed keys, or for the Indian kits the keyboard laid over the pad grid
 * (bottom row of pads on Z X C V …, the next on A S D F …, and so on; a stroke with two pads has two keys).
 * Returns key → voice, voice → hint, and each pad's hint by cell.
 */
function layout(bank?: string) {
  const keys: Record<string, string> = {}, hints: Record<string, string> = {}, cellHints: Record<number, string> = {};
  const label = (key: string) => (key === ' ' ? 'Space' : key.toUpperCase());
  const kit = kitVoices(bank);
  if (bank && kit.some((k) => k.hand)) {
    const g = padGrid(bank);
    g.cells.forEach((v, i) => {
      const r = Math.floor(i / g.cols), c = i % g.cols;
      const key = GRID_KEYS[GRID_KEYS.length - g.rows + r]?.[c];
      if (!key || !v) return;
      keys[key] = v; cellHints[i] = label(key);
      hints[v] ??= label(key);
    });
    return { keys, hints, cellHints };
  }
  for (const k of kit) {
    const mine = Object.keys(KIT_KEYS).filter((key) => KIT_KEYS[key] === k.voice);
    mine.forEach((key) => (keys[key] = k.voice));
    if (mine.length) hints[k.voice] = mine.map(label).join(' ');
  }
  return { keys, hints, cellHints };
}
const layouts = new Map<string, ReturnType<typeof layout>>();
const kitLayout = (bank?: string) => {
  const id = `${bank ?? ''}:${padOrderVersion()}`;
  if (!layouts.has(id)) layouts.set(id, layout(bank));
  return layouts.get(id)!;
};

/** The pad a computer key plays on a track with this kit or drum machine. */
export const drumKey = (bank: string | undefined, key: string): string | undefined => kitLayout(bank).keys[key];
/** The key shown on a pad. */
export const drumHint = (bank: string | undefined, voice: string): string => kitLayout(bank).hints[voice] ?? '';
/** The key shown on an Indian kit's pad (by its cell in the pad grid). */
export const cellHint = (bank: string | undefined, i: number): string => kitLayout(bank).cellHints[i] ?? '';

/** Piano layout: semitones above the C of the track's octave. */
export const PIANO_KEYS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};
export const PIANO_HINT: Record<number, string> = Object.fromEntries(Object.entries(PIANO_KEYS).map(([k, v]) => [v, k.toUpperCase()]));

/** Scale pads: lower row from Sa of the track's octave, upper row the octave above. */
export const PAD_ROWS = { low: 'zxcvbnm,./'.split(''), high: 'asdfghjkl;'.split(''), top: 'qwertyuiop'.split('') };

/** Computer keys for each scale pad row, lowest octave first: one row on A S D F…, more from Z X C V… upward. */
export const padRowKeys = (rows: number): string[][] => (rows === 1 ? [PAD_ROWS.high] : [PAD_ROWS.low, PAD_ROWS.high, PAD_ROWS.top]);

export const CHORD_KEYS = '123456789'.split('');
