import { describe, expect, it } from 'vitest';
import { noteCovering, toggleNote, writeNote } from './clipEdit';
import { melodicClip } from './build';
import { nameToMidi } from './notes';
import { pitchLabel, scaleChords, SCALES } from './scales';

const C3 = nameToMidi('c3'), E3 = nameToMidi('e3'), G3 = nameToMidi('g3');
const summary = (c: ReturnType<typeof melodicClip>) => c.notes.map((n) => `${n.step}:${n.len}:${n.pitches.join('+')}`);

describe('note editing', () => {
  it('adds a note and removes it on a second tap', () => {
    const c = melodicClip('t', 1, []);
    expect(toggleNote(c, 4, C3, 2, false)).toBe(true);
    expect(summary(c)).toEqual([`4:2:${C3}`]);
    expect(toggleNote(c, 5, C3, 2, false)).toBe(false); // tapping the held part removes the note
    expect(c.notes).toEqual([]);
  });

  it('replaces the note at a step on monophonic tracks and builds chords on polyphonic ones', () => {
    const mono = melodicClip('m', 1, []);
    toggleNote(mono, 0, C3, 1, false);
    toggleNote(mono, 0, E3, 1, false);
    expect(summary(mono)).toEqual([`0:1:${E3}`]);
    const poly = melodicClip('p', 1, []);
    toggleNote(poly, 0, C3, 4, true);
    toggleNote(poly, 0, G3, 1, true);
    toggleNote(poly, 0, E3, 1, true);
    expect(summary(poly)).toEqual([`0:4:${C3}+${E3}+${G3}`]);
    toggleNote(poly, 0, E3, 1, true);
    expect(summary(poly)).toEqual([`0:4:${C3}+${G3}`]);
  });

  it('cuts a held note short and removes notes the new one covers', () => {
    const c = melodicClip('t', 1, [[0, ['c3'], 8], [10, ['e3']], [12, ['g3']]]);
    writeNote(c, 4, [E3], 8);
    expect(summary(c)).toEqual([`0:4:${C3}`, `4:8:${E3}`, `12:1:${G3}`]);
  });

  it('never lets a note cross a bar line', () => {
    const c = melodicClip('t', 2, []);
    writeNote(c, 12, [C3], 16);
    expect(summary(c)).toEqual([`12:4:${C3}`]);
    expect(noteCovering(c, 16)).toBeUndefined();
  });

  it('keeps microtonal pitches distinct from their neighbours', () => {
    const c = melodicClip('t', 1, []);
    toggleNote(c, 0, 62.88, 1, true);
    toggleNote(c, 0, 63, 1, true);
    expect(c.notes[0].pitches).toEqual([62.88, 63]);
  });
});


describe('labels and chords', () => {
  it('labels microtones with their cents and sargam relative to the tonic', () => {
    expect(pitchLabel(50.86, 'C', false)).toBe('Eb3 −14¢');
    expect(pitchLabel(nameToMidi('d3'), 'D', true)).toBe('Sa');
    expect(pitchLabel(nameToMidi('f3'), 'D', true)).toBe('ga');
  });

  it('builds diatonic chords with letter names and numerals', () => {
    const minor = SCALES.find((s) => s.id === 'minor')!;
    const chords = scaleChords(minor, 'C', 3, false);
    expect(chords.map((c) => `${c.name} ${c.numeral}`)).toEqual(['Cm i', 'D° ii°', 'Eb III', 'Fm iv', 'Gm v', 'Ab VI', 'Bb VII']);
  });
});
