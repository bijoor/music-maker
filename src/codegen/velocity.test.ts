// Velocity: softer hits and notes are written as .velocity("…") in their own rhythm, played as such, and read back.
import { beforeAll, describe, expect, it } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { clipCode, generate } from './generate';
import { parseCode } from './parse';
import { demoSong } from '../model/demo';
import { drumClip, melodicClip } from '../model/build';
import type { Song } from '../model/types';

beforeAll(async () => {
  await core.evalScope(core, mini);
});

const strip = (x: unknown) => JSON.parse(JSON.stringify(x));

function softSong(): Song {
  const s = demoSong();
  const beat = drumClip('Soft hats', 1, [{ bd: [0, 8], sd: [4, 12], hh: [0, 2, 4, 6, 8, 10, 12, 14] }], 'csoft');
  beat.hits.hh = beat.hits.hh.map((v, i) => (v ? (i % 4 === 0 ? 1 : 0.5) : 0)); // accents on the beat
  s.tracks[0].slots[3] = beat;
  const tune = melodicClip('Dynamics', 1, [[0, ['c4'], 4], [4, ['e4'], 4], [8, ['g4', 'b4'], 8]], 'cdyn');
  tune.notes[1].vel = 0.4;
  tune.notes[2].vel = 0.75;
  s.tracks[3].slots[1] = tune;
  return s;
}

describe('velocity', () => {
  it('gives a drum voice with softer hits its own layer with velocities in the same rhythm', () => {
    const s = softSong();
    const { code } = clipCode(s.tracks[0], s.tracks[0].slots[3]!);
    expect(code).toBe('stack(s("bd*2, [~ sd]*2").bank("RolandTR909"), s("[hh hh]*4").velocity("[1 .5]*4").bank("RolandTR909"))');
  });

  it('plays hits and notes at their velocities', async () => {
    const s = softSong();
    const drums = (await core.evaluate(clipCode(s.tracks[0], s.tracks[0].slots[3]!).code, transpiler, {})).pattern;
    const hats = drums.queryArc(0, 1).filter((h: any) => h.hasOnset() && h.value.s === 'hh')
      .sort((a: any, b: any) => a.whole.begin.valueOf() - b.whole.begin.valueOf()).map((h: any) => h.value.velocity);
    expect(hats).toEqual([1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5]);
    const { code } = clipCode(s.tracks[3], s.tracks[3].slots[1]!);
    expect(code).toBe('note("c4@4 e4@4 [g4,b4]@8").s("sawtooth").velocity("1@4 .4@4 .75@8")');
    const notes = (await core.evaluate(code, transpiler, {})).pattern.queryArc(0, 1).filter((h: any) => h.hasOnset()).map((h: any) => [h.value.note, h.value.velocity]);
    expect(notes).toEqual([['c4', 1], ['e4', 0.4], ['g4', 0.75], ['b4', 0.75]]);
  });

  it('leaves full-strength clips as they were', () => {
    expect(generate(demoSong()).code).not.toContain('velocity');
  });

  it('round-trips velocities through the code unchanged', async () => {
    const s = softSong();
    const res = await parseCode(generate(s).code, s);
    expect(res.errors).toEqual([]);
    expect(res.notes).toEqual([]);
    expect(strip(res.song.tracks[0].slots[3])).toEqual(strip(s.tracks[0].slots[3]));
    expect(strip(res.song.tracks[3].slots[1])).toEqual(strip(s.tracks[3].slots[1]));
  });
});
