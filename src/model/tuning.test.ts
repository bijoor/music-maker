import { describe, expect, it } from 'vitest';
import { strokeSpeed, tuneSemis } from './tuning';
import { clipCode } from '../codegen/generate';
import type { Song, Track } from './types';

const song = (tonic: string) => ({ key: { tonic, scale: 'major' } }) as unknown as Song;
const tabla = (tuning?: Track['tuning']) => ({ id: 't', kind: 'drums', bank: 'Tabla', tuning, fx: {} }) as unknown as Track;

describe('tuning to the song', () => {
  it('moves the dayan to the nearest Sa', () => {
    expect(tuneSemis(song('C'), tabla())).toBe(0);
    expect(tuneSemis(song('D'), tabla())).toBe(2);
    expect(tuneSemis(song('G'), tabla())).toBe(-5); // down to G3, not up to G4
    expect(tuneSemis(song('F#'), tabla())).toBe(-6);
    expect(tuneSemis(song('F'), tabla())).toBe(5);
  });
  it('adds the track offset, or stays as recorded when off', () => {
    expect(tuneSemis(song('C'), tabla({ offset: 7 }))).toBe(7);
    expect(tuneSemis(song('D'), tabla({ off: true }))).toBe(0);
  });
  it('tunes only the pitched strokes', () => {
    expect(strokeSpeed(song('D'), tabla(), 'tabla_na')).toBeCloseTo(2 ** (2 / 12), 3);
    expect(strokeSpeed(song('D'), tabla(), 'tabla_ge')).toBe(1);
    expect(strokeSpeed(song('D'), tabla(), 'tabla_te')).toBe(1);
  });
  it('writes tuned strokes as their own layer at their speed', () => {
    const clip = { kind: 'drums', id: 'c', name: 'A', bars: 1, hits: { tabla_na: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], tabla_ge: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] } } as const;
    const { code } = clipCode(tabla(), clip as never, song('D'));
    expect(code).toContain('.speed(1.1225)');
    expect(code).toMatch(/s\("[^"]*tabla_ge[^"]*"\)(?!\.speed)/);
    expect(clipCode(tabla(), clip as never, song('C')).code).not.toContain('speed');
  });
});
