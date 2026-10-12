import { describe, expect, it } from 'vitest';
import { parseCode } from './parse';
import { generate } from './generate';
import { demoSong } from '../model/demo';

const code = () => generate(demoSong()).code;
const strip = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('reading edited code back into the song', () => {
  it('changes nothing when the code is unchanged', async () => {
    const { song, notes, errors } = await parseCode(code(), demoSong());
    expect(errors).toEqual([]);
    expect(notes).toEqual([]);
    expect(strip(song)).toEqual(strip(demoSong()));
  });

  it('reads a changed drum pattern back onto the grid', async () => {
    const { song, notes } = await parseCode(code().replace('s("bd*4, [~ sd]*2, [~ hh]*4")', 's("bd*8, [~ sd]*2, [~ hh]*4")'), demoSong());
    const c = song.tracks[0].slots[0]!;
    expect(c.kind === 'drums' && !c.code && c.hits.bd.filter(Boolean).length).toBe(8);
    expect(notes).toContain('Drums A: updated');
  });

  it('turns code written differently into grid notes when it fits the grid (e.g. .fast(2))', async () => {
    const edited = code().replace('const drums_A = s("bd*4, [~ sd]*2, [~ hh]*4").bank("RolandTR909")', 'const drums_A = s("bd*2, [~ sd]").bank("RolandTR909").fast(2)');
    const { song } = await parseCode(edited, demoSong());
    const c = song.tracks[0].slots[0]!;
    expect(c.kind === 'drums' && !c.code).toBe(true);
    expect(generate(song).code).toContain('const drums_A = s("bd*4, [~ sd]*2").bank("RolandTR909")');
  });

  it('keeps code the grid cannot show as custom code, which still plays', async () => {
    const edited = code().replace('s("bd*4, [~ sd]*2, [~ hh]*4").bank("RolandTR909")', 's("bd*4, [~ sd]*2, [~ hh]*4").bank("RolandTR909").speed(1.5)');
    const { song, notes } = await parseCode(edited, demoSong());
    const c = song.tracks[0].slots[0]!;
    expect(c.code).toBe('s("bd*4, [~ sd]*2, [~ hh]*4").bank("RolandTR909").speed(1.5)');
    expect(c.kind === 'drums' && c.hits.bd.filter(Boolean).length).toBe(4); // grid content kept for Reset
    expect(notes).toContain('Drums A: kept as custom code');
    expect(generate(song).code).toContain('.speed(1.5)  // Groove · 1 bar · custom');
  });

  it('reads melodic edits, chords and lengths', async () => {
    const edited = code().replace('note("c2@2 ~ c2 ~ ~ g1@2 ~ ~ bb1 ~ c2@2 ~ ~")', 'note("c2@4 ~ ~ ~ ~ [g1,d2]@2 ~ ~ ~ ~ ~ ~")');
    const { song } = await parseCode(edited, demoSong());
    const c = song.tracks[1].slots[0]!;
    expect(c.code).toBeUndefined();
    expect(c.kind === 'melodic' && c.notes.map((n) => `${n.step}:${n.len}:${n.pitches.join('+')}`)).toEqual(['0:4:36', '8:2:31+38']);
    // 18 steps in a bar no longer fit the 16-step grid: kept as custom code.
    const off = await parseCode(code().replace('note("c2@2 ~ c2 ~ ~ g1@2 ~ ~ bb1 ~ c2@2 ~ ~")', 'note("c2@4 ~ ~ ~ ~ [g1,d2]@2 ~ ~ ~ ~ ~ ~ ~ ~")'), demoSong());
    expect(off.song.tracks[1].slots[0]!.code).toBeTruthy();
  });

  it('reads the play line: chains, effects and mute', async () => {
    const edited = code()
      .replace('drums: drums_A.room(.15)', 'drums: arrange([2, drums_A], [1, drums_C]).room(.3).lpf(1200)')
      .replace('bass: bass_A.lpf(900).gain(.9)', '_bass: bass_A.lpf(900).gain(.9)');
    const { song } = await parseCode(edited, demoSong());
    expect(song.tracks[0].active).toEqual([0, 0, 2]);
    expect(song.tracks[0].fx).toMatchObject({ room: 0.3, lpf: 1200, gain: 1, pan: 0.5 });
    expect(song.tracks[1].mute).toBe(true);
  });

  it('keeps a play line it cannot express as custom code', async () => {
    const edited = code().replace('keys: keys_A.room(.4).gain(.7)', 'keys: keys_A.room(.4).gain(.7).jux(rev)');
    const { song } = await parseCode(edited, demoSong());
    expect(song.tracks[2].playCode).toBe('keys_A.room(.4).gain(.7).jux(rev)');
    expect(generate(song).code).toContain('keys: keys_A.room(.4).gain(.7).jux(rev)\n');
  });

  it('adds and removes clips from their const lines, and reads the tempo', async () => {
    const edited = code()
      .replace('setcpm(112/4)', 'setcpm(124/4)')
      .replace(/const lead_A = [^\n]*\n/, 'const lead_C = note("c4 e4 g4 c5").s("sawtooth")  // Arp · 1 bar\n');
    const { song, notes } = await parseCode(edited, demoSong());
    expect(song.bpm).toBe(124);
    expect(song.tracks[3].slots[0]).toBeNull();
    expect(song.tracks[3].slots[2]!.name).toBe('Arp');
    expect(notes).toEqual(expect.arrayContaining(['Lead C: new clip', 'Lead A: removed']));
  });

  it('reports syntax errors and leaves that track unchanged', async () => {
    const { song, errors } = await parseCode(code().replace('const bass_A = note(', 'const bass_A = note(('), demoSong());
    expect(errors[0]).toMatch(/^Bass:/);
    expect(strip(song.tracks[1])).toEqual(strip(demoSong().tracks[1]));
  });
});
