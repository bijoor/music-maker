// Note names as written in Strudel code: lowercase letter, optional # or b, octave (c4 = MIDI 60).

const NAMES = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'];
const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function nameToMidi(name: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/i.exec(name.trim());
  if (!m) throw new Error(`Not a note name: ${name}`);
  const pc = LETTER[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + pc;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Code form of a pitch: a note name, or a decimal MIDI number for microtones (e.g. 62.88). */
export function pitchToCode(midi: number): string {
  if (Math.abs(midi - Math.round(midi)) > 0.001) return String(round2(midi));
  const r = Math.round(midi);
  return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}
