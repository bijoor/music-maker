// Note bends: written as Strudel's pitch envelope in the note's rhythm, played as such, and read back.
import { beforeAll, describe, expect, it } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { clipCode, generate } from './generate';
import { parseCode } from './parse';
import { demoSong } from '../model/demo';
import { melodicClip } from '../model/build';
import { bendFromPrevious, setBend } from '../model/clipEdit';
import type { MelodicClip, Song } from '../model/types';

beforeAll(async () => {
  await core.evalScope(core, mini);
});

const strip = (x: unknown) => JSON.parse(JSON.stringify(x));

function bentSong(): Song {
  const s = demoSong();
  const clip = melodicClip('Meend', 1, [[0, ['c4'], 4], [4, ['e4'], 4], [8, ['d4'], 2], [12, ['g4', 'b4'], 4]], 'cmeend');
  setBend(clip, 4, -4, 0.3); // slide up from C into E
  setBend(clip, 8, 2); // fall from E into D, default speed
  s.tracks[3].slots[1] = clip;
  return s;
}

describe('note bends', () => {
  it('writes the pitch envelope in the notes’ rhythm', () => {
    const s = bentSong();
    const { code } = clipCode(s.tracks[3], s.tracks[3].slots[1]!);
    // Unbent notes (penv 0) reuse the first bend's time: it makes no difference to how they sound.
    expect(code).toBe('note("c4@4 e4@4 d4@2 ~ ~ [g4,b4]@4").s("sawtooth").penv("0@4 4@4 -2@2 ~ ~ 0@4").pattack(".3@4 .3@4 .2@2 ~ ~ .3@4")');
  });

  it('plays each note with its own bend', async () => {
    const s = bentSong();
    const { code } = clipCode(s.tracks[3], s.tracks[3].slots[1]!);
    const pat = (await core.evaluate(code, transpiler, {})).pattern;
    const evs = pat.queryArc(0, 1).filter((h: any) => h.hasOnset()).map((h: any) => [h.value.note, h.value.penv, h.value.pattack]);
    expect(evs).toEqual([['c4', 0, 0.3], ['e4', 4, 0.3], ['d4', -2, 0.2], ['g4', 0, 0.3], ['b4', 0, 0.3]]);
  });

  it('round-trips bends through the code unchanged', async () => {
    const s = bentSong();
    const res = await parseCode(generate(s).code, s);
    expect(res.errors).toEqual([]);
    expect(res.notes).toEqual([]);
    expect(strip(res.song.tracks[3].slots[1])).toEqual(strip(s.tracks[3].slots[1]));
  });

  it('reads a bend typed into the code', async () => {
    const s = demoSong();
    s.tracks[3].slots[1] = melodicClip('Two', 1, [[0, ['c4'], 8], [8, ['e4'], 8]], 'ctwo');
    const code = generate(s).code;
    const line = code.split('\n').find((l) => l.startsWith('const lead_B'))!;
    const { song } = await parseCode(code.replace(line, 'const lead_B = note("c4@8 e4@8").s("sawtooth").penv("0 4").pattack(.5)'), s);
    const c = song.tracks[3].slots[1] as MelodicClip;
    expect(c.code).toBeUndefined();
    expect(c.notes.map((n) => [n.step, n.bend, n.bendTime])).toEqual([[0, undefined, undefined], [8, -4, 0.5]]);
  });

  it('works out the bend from the previous note', () => {
    const clip = melodicClip('x', 1, [[0, ['c4'], 4], [4, ['e4'], 4], [8, ['c5'], 4]]);
    expect(bendFromPrevious(clip, 0)).toBeNull();
    expect(bendFromPrevious(clip, 4)).toBe(-4);
    expect(bendFromPrevious(clip, 8)).toBe(-8);
  });
});
