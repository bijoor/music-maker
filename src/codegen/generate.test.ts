// Golden and round-trip tests: generated code is compiled with Strudel itself and queried, and the events must
// match the model exactly (hits, notes, lengths, banks, chains) and map back to their code tokens.
import { beforeAll, describe, expect, it } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { clipCode, findToken, fxValues, generate, sections } from './generate';
import { demoSong } from '../model/demo';
import { drumClip, melodicClip, track } from '../model/build';
import { STEPS_PER_BAR, type Clip, type Song, type Track } from '../model/types';

beforeAll(async () => {
  await core.evalScope(core, mini);
});

const compile = async (code: string) => (await core.evaluate(code, transpiler, {})).pattern;

function onsets(pattern: any, cycles: number) {
  return pattern.queryArc(0, cycles).filter((h: any) => h.hasOnset());
}
const stepOf = (h: any) => Math.round(h.whole.begin.valueOf() * STEPS_PER_BAR);
const voiceOf = (h: any) => (h.value.n ? `${h.value.s}:${h.value.n}` : h.value.s);
const midiOf = (v: unknown) => (typeof v === 'number' ? v : core.noteToMidi(v as string));

function modelHits(clip: Clip) {
  if (clip.kind !== 'drums') return [];
  return Object.entries(clip.hits).flatMap(([v, row]) => row.flatMap((x, s) => (x > 0 ? [`${v}@${s}`] : []))).sort();
}
function modelNotes(clip: Clip) {
  if (clip.kind !== 'melodic') return [];
  return clip.notes.flatMap((n) => n.pitches.map((p) => `${n.step}:${p}:${n.len}`)).sort();
}

describe('generated code', () => {
  it('matches the golden file for the demo song', async () => {
    await expect(generate(demoSong()).code).toMatchFileSnapshot('./__snapshots__/demo-song.strudel.js');
  });

  it('every demo clip plays exactly its model', async () => {
    for (const t of demoSong().tracks) {
      for (const clip of t.slots) {
        if (!clip) continue;
        const haps = onsets(await compile(clipCode(t, clip).code), clip.bars);
        if (clip.kind === 'drums') {
          expect(haps.map((h: any) => `${voiceOf(h)}@${stepOf(h)}`).sort(), `${t.name} ${clip.name}`).toEqual(modelHits(clip));
          expect(new Set(haps.map((h: any) => h.value.bank))).toEqual(new Set([t.bank]));
        } else {
          const got = haps.map((h: any) => `${stepOf(h)}:${midiOf(h.value.note)}:${Math.round(h.duration.valueOf() * STEPS_PER_BAR)}`).sort();
          expect(got, `${t.name} ${clip.name}`).toEqual(modelNotes(clip));
          expect(new Set(haps.map((h: any) => h.value.s))).toEqual(new Set([t.sound]));
        }
      }
    }
  });

  it('compresses repeating drum rows', () => {
    const t = demoSong().tracks[0];
    expect(clipCode(t, t.slots[0]!).code).toBe('s("bd*4, [~ sd]*2, [~ hh]*4").bank("RolandTR909")');
  });

  it('borrows sounds the drum machine lacks from another machine', async () => {
    const t = track({ id: 'd', name: 'Drums', kind: 'drums', color: '#000', bank: 'RolandTR909' });
    const clip = drumClip('Latin', 1, [{ bd: [0, 8], cb: [4, 12], sh: [2, 6, 10, 14] }], 'x');
    const { code } = clipCode(t, clip);
    expect(code).toBe('stack(s("bd*2").bank("RolandTR909"), s("[~ cb]*2, [~ sh]*4").bank("RolandTR808"))');
    const haps = onsets(await compile(code), 1);
    expect(haps.filter((h: any) => h.value.s === 'cb').every((h: any) => h.value.bank === 'RolandTR808')).toBe(true);
    expect(haps.map((h: any) => `${voiceOf(h)}@${stepOf(h)}`).sort()).toEqual(modelHits(clip));
  });

  it('writes numbered samples, chords, held notes and microtones', async () => {
    const d = track({ id: 'd', name: 'Drums', kind: 'drums', color: '#000', bank: 'RolandTR909' });
    const kicks = drumClip('Two kicks', 1, [{ 'bd:1': [0, 8], bd: [4] }], 'k');
    expect(onsets(await compile(clipCode(d, kicks).code), 1).map((h: any) => `${voiceOf(h)}@${stepOf(h)}`).sort()).toEqual(modelHits(kicks));

    const m = track({ id: 'm', name: 'Keys', kind: 'melodic', color: '#000', sound: 'piano', poly: true });
    const clip = melodicClip('Mix', 1, [[0, ['c3', 'eb3', 'g3'], 4], [8, ['c4'], 2]], 'm1');
    clip.notes.push({ step: 12, len: 1, pitches: [62.88], vel: 1 });
    const { code } = clipCode(m, clip);
    expect(code).toBe('note("[c3,eb3,g3]@4 ~ ~ ~ ~ c4@2 ~ ~ 62.88 ~ ~ ~").s("piano")');
    const got = onsets(await compile(code), 1).map((h: any) => `${stepOf(h)}:${midiOf(h.value.note)}:${Math.round(h.duration.valueOf() * 16)}`).sort();
    expect(got).toEqual(modelNotes(clip));
  });

  it('plays chained slots in turn with arrange()', async () => {
    const song = demoSong();
    const drums = song.tracks[0];
    drums.active = [0, 0, 0, 2]; // Groove ×3, Fill (only the fill has a crash)
    expect(sections(drums)).toEqual([{ slot: 0, bars: 3 }, { slot: 2, bars: 1 }]);
    const tc = generate(song).tracks[0];
    expect(tc.period).toBe(4);
    expect(generate(song).code).toContain('drums: arrange([3, drums_A], [1, drums_C]).room(.15)');
    const haps = onsets(await compile(tc.runnable), 8);
    const crashBars = [...new Set(haps.filter((h: any) => h.value.s === 'cr').map((h: any) => Math.floor(h.whole.begin.valueOf())))];
    expect(crashBars).toEqual([3, 7]);
  });

  it('maps every played event back to its code token', async () => {
    const song = demoSong();
    const g = generate(song);
    for (const tc of g.tracks.filter((x) => x.audible)) {
      const t = song.tracks.find((x) => x.id === tc.trackId)!;
      const clip = t.slots[t.active[0]]!;
      const haps = onsets(await compile(tc.runnable), clip.bars);
      expect(haps.length).toBeGreaterThan(0);
      for (const h of haps) {
        // An event carries several locations (its note token, the .bank() string, *n factors); one must be a token.
        const tok = findToken(g.tokens, h.context.locations ?? [], tc.start);
        expect(tok, `${t.name}: no token among ${JSON.stringify(h.context.locations)}`).toBeTruthy();
        expect(tok!.clipId).toBe(clip.id);
        expect(tok!.steps).toContain(stepOf(h) % (clip.bars * STEPS_PER_BAR));
      }
    }
  });

  it('marks muted and solo-silenced tracks and keeps runnable code aligned', () => {
    const song: Song = demoSong();
    song.tracks[1].mute = true;
    let g = generate(song);
    expect(g.code).toContain('_bass: bass_A');
    expect(g.tracks[1].audible).toBe(false);
    expect(g.tracks[1].runnable.length).toBe(g.tracks[1].end - g.tracks[1].start);
    expect(g.tracks[1].runnable).not.toContain('bass:');

    song.tracks[1].mute = false;
    song.tracks[2].solo = true;
    g = generate(song);
    expect(g.tracks.map((t) => t.audible)).toEqual([false, false, true, false]);
    expect(g.code).toContain('_drums: drums_A');
  });

  it('gives tracks with the same name unique labels', () => {
    const song = demoSong();
    const copy: Track = { ...song.tracks[0], id: 't9' };
    song.tracks.push(copy);
    expect(generate(song).code).toContain('drums2: drums2_A');
  });

  it('gives previews exactly the effect values the pattern produces', async () => {
    // Pads and keys play sounds directly; their values must match what Strudel makes of the track's code.
    const song = demoSong();
    song.tracks[1].fx = { gain: 0.8, pan: 0.3, lpf: 900, room: 0.2, delay: 0.25 };
    const tc = generate(song).tracks[1];
    const hap = onsets(await compile(tc.runnable), 1)[0];
    const { note, s, ...fx } = hap.value;
    expect(note).toBeDefined();
    expect(s).toBe('gm_synth_bass_1');
    expect(fx).toEqual(fxValues(song.tracks[1]));
  });

  it('plays the song arrangement, carrying clips over when a scene does not name a track', async () => {
    const song = demoSong();
    song.scenes = [
      { id: 'v', name: 'Verse', active: { t1: [0], t2: [0], t3: [] } },
      { id: 'c', name: 'Chorus', active: { t1: [1, 1, 1, 2], t3: [1] } }, // bass not named: keeps Root
    ];
    song.arrangement = [{ sceneId: 'v', bars: 4 }, { sceneId: 'c', bars: 8 }];
    const g = generate(song, { songMode: true });
    expect(g.code).toContain('// song: Verse 4, Chorus 8 (bars)');
    expect(g.code).toContain('drums: arrange([4, drums_A], [8, arrange([3, drums_B], [1, drums_C])]).room(.15)');
    expect(g.code).toContain('bass: bass_A.lpf(900).gain(.9)'); // same clip all song: no arrange needed
    expect(g.code).toContain('keys: arrange([4, silence], [8, keys_B]).room(.4).gain(.7)');
    expect(g.tracks[0].period).toBe(12);
    // The chorus chain restarts at the chorus: bars 4–6 busy hats, bar 7 the fill (crash), and again from bar 8.
    const haps = onsets(await compile(g.tracks[0].runnable), 12);
    const crashBars = [...new Set(haps.filter((h: any) => h.value.s === 'cr').map((h: any) => Math.floor(h.whole.begin.valueOf())))];
    expect(crashBars).toEqual([7, 11]);
    // Without song mode, tracks play their own active clips.
    expect(generate(song).code).toContain('drums: drums_A.room(.15)');
  });

  it('writes silence for a track with nothing active', () => {
    expect(generate(demoSong()).code).toContain('lead: silence\n');
  });
});
