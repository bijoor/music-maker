import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, withCurrentScene } from './store';
import { demoSong } from '../model/demo';
import { generate } from '../codegen/generate';

const st = () => useStore.getState();
const drums = () => st().song.tracks[0];

beforeEach(() => useStore.setState({ song: demoSong(), chain: false, songMode: false, past: [], future: [] }));

describe('clip editing', () => {
  it('creates a clip in an empty slot, selects it, and fills it from a preset', () => {
    st().createClip('t1', 3, 1);
    expect(st().selected).toEqual({ trackId: 't1', slot: 3 });
    st().applyPreset('t1', 3, 'Four on the floor', 0);
    const code = generate(st().song).code;
    expect(code).toContain('const drums_D = s("bd*4, [~ cp]*2, [~ hh]*4").bank("RolandTR909")');
  });

  it('toggles hits on and off', () => {
    expect(st().toggleHit('t1', 0, 'cr', 0)).toBe(true);
    const c = drums().slots[0]!;
    expect(c.kind === 'drums' ? c.hits.cr[0] : -1).toBe(1);
    expect(st().toggleHit('t1', 0, 'cr', 0)).toBe(false);
  });

  it('lengthens a clip by repeating its bars and shortens it by keeping the first', () => {
    st().setClipBars('t1', 0, 2);
    const c = drums().slots[0]!;
    expect(c.bars).toBe(2);
    if (c.kind === 'drums') expect(c.hits.bd.slice(16)).toEqual(c.hits.bd.slice(0, 16));
    st().setClipBars('t2', 1, 1); // Walk: 2 bars -> 1
    const walk = st().song.tracks[1].slots[1]!;
    expect(walk.kind === 'melodic' && walk.notes.every((n) => n.step < 16)).toBe(true);
  });

  it('launches a clip alone, stops it on a second tap, and never launches an empty slot', () => {
    st().tapSlot('t1', 1);
    expect(drums().active).toEqual([1]);
    st().tapSlot('t1', 1);
    expect(drums().active).toEqual([]);
    st().tapSlot('t1', 3);
    expect(drums().active).toEqual([]);
  });

  it('duplicates into a free slot, adds slots up to 16, and deleting a playing clip stops it', () => {
    expect(st().duplicateClip('t1', 0)).toBe(3);
    expect(drums().slots[3]!.name).toBe('Groove 2');
    for (let i = 0; i < 20; i++) st().addSlot('t1');
    expect(drums().slots.length).toBe(16);
    st().deleteClip('t1', 0);
    expect(drums().active).toEqual([]);
  });

  it('adds and removes tracks', () => {
    st().addTrack(0);
    expect(st().song.tracks.length).toBe(5);
    const id = st().song.tracks[4].id;
    expect(st().selected.trackId).toBe(id);
    st().removeTrack(id);
    expect(st().song.tracks.length).toBe(4);
  });
});

describe('recording and undo', () => {
  it('groups one recording pass into a single undo step', () => {
    st().recordHit('t1', 0, 'cr', 0, 'rec:c1:0');
    st().recordHit('t1', 0, 'cr', 8, 'rec:c1:0');
    st().recordHit('t1', 0, 'oh', 4, 'rec:c1:1');
    const hits = () => { const c = drums().slots[0]!; return c.kind === 'drums' ? [c.hits.cr[0], c.hits.cr[8], c.hits.oh[4]] : []; };
    expect(hits()).toEqual([1, 1, 1]);
    st().undo();
    expect(hits()).toEqual([1, 1, 0]);
    st().undo();
    expect(hits()).toEqual([0, 0, 0]);
    st().redo();
    expect(hits()).toEqual([1, 1, 0]);
  });

  it('extends a held note when it is recorded again with a longer length', () => {
    st().recordNote('t4', 0, 6, [60], 1, 'rec:c8:0');
    st().recordNote('t4', 0, 6, [60], 4, 'rec:c8:0');
    const lead = st().song.tracks[3].slots[0]!;
    // Holding over the next note (step 8) replaces it, as overdubbing a held note should.
    expect(lead.kind === 'melodic' && lead.notes.find((n) => n.step === 6)).toMatchObject({ len: 4, pitches: [60] });
    expect(lead.kind === 'melodic' && lead.notes.some((n) => n.step === 8)).toBe(false);
  });

  it('does not undo launches or mute', () => {
    st().toggleHit('t1', 0, 'cr', 0);
    st().tapSlot('t1', 1);
    st().toggleMute('t2');
    st().undo();
    expect(drums().active).toEqual([1]);
    expect(st().song.tracks[1].mute).toBe(true);
  });
});

describe('chains, scenes and song', () => {
  it('chains slots in turn when chain mode is on', () => {
    st().setChain(true);
    st().stopTrack('t1');
    st().tapSlot('t1', 0); st().tapSlot('t1', 0); st().tapSlot('t1', 0); st().tapSlot('t1', 2);
    expect(drums().active).toEqual([0, 0, 0, 2]);
    st().setChain(false);
    st().tapSlot('t1', 1);
    expect(drums().active).toEqual([1]);
  });

  it('saves a scene and launches it; tracks the scene does not name are silent in it', () => {
    st().saveScene('Verse', false); // drums A, bass A, keys A (lead silent, not included)
    const verse = st().song.scenes[0];
    expect(Object.keys(verse.active).sort()).toEqual(['t1', 't2', 't3']);
    st().tapSlot('t1', 1);
    st().tapSlot('t4', 0);
    st().launchScene(verse.id);
    expect(drums().active).toEqual([0]);
    expect(st().song.tracks[3].active).toEqual([]);
    expect(st().song.current).toBe(verse.id);
  });

  it('edits the song arrangement and leaves song mode when it becomes empty', () => {
    st().saveScene('A', true);
    const id = st().song.scenes[0].id;
    st().addSongStep(id, 4);
    st().addSongStep(id);
    st().setSongStep(1, { bars: 100 });
    expect(st().song.arrangement.map((x) => x.bars)).toEqual([4, 64]);
    st().moveSongStep(1, -1);
    expect(st().song.arrangement.map((x) => x.bars)).toEqual([64, 4]);
    st().setSongMode(true);
    expect(st().songMode).toBe(true);
    st().removeSongStep(0); st().removeSongStep(0);
    expect(st().songMode).toBe(false);
    st().deleteScene(id);
    expect(st().song.scenes).toEqual([]);
  });
});

describe('names', () => {
  it('renames tracks and clips (blank names are ignored), and undo brings the old name back', () => {
    st().renameTrack('t1', '  Tabla  ');
    st().renameClip('t1', 0, 'Theka');
    st().renameClip('t1', 0, '   ');
    expect(drums().name).toBe('Tabla');
    expect(drums().slots[0]!.name).toBe('Theka');
    expect(generate(st().song).code).toContain('const tabla_A =');
    st().undo();
    expect(drums().slots[0]!.name).not.toBe('Theka');
  });

  it('numbers new clips rather than naming them after the track', async () => {
    const { INSTRUMENTS } = await import('../model/presets');
    st().addTrack(INSTRUMENTS.findIndex((p) => p.drone));
    const drone = st().song.tracks[st().song.tracks.length - 1];
    expect(drone.slots[0]!.name).toBe('Clip 1');
    st().createClip(drone.id, 1, 1);
    expect(drone.name).not.toBe(st().song.tracks[st().song.tracks.length - 1].slots[1]!.name);
    expect(st().song.tracks[st().song.tracks.length - 1].slots[1]!.name).toBe('Clip 2');
  });
});

describe('scenes built live', () => {
  const lead = () => st().song.tracks[3];
  beforeEach(() => useStore.setState({ song: withCurrentScene(demoSong()), chain: false, songMode: false, past: [], future: [] }));

  it('a song starts with a scene that follows what the tracks play', () => {
    const scene = st().song.scenes[0];
    expect(st().song.current).toBe(scene.id);
    st().setChain(true);
    st().stopTrack('t1');
    st().tapSlot('t1', 0); st().tapSlot('t1', 0); st().tapSlot('t1', 0); st().tapSlot('t1', 2);
    expect(st().song.scenes[0].active.t1).toEqual([0, 0, 0, 2]);
  });

  it('edits a line: repeat counts, off steps, order, adding a clip at the end', () => {
    st().stopTrack('t1');
    st().addStep('t1', 0); st().addStep('t1', 2);
    st().setStepTimes('t1', 0, 3);
    expect(drums().active).toEqual([0, 0, 0, 2]);
    st().toggleStep('t1', 1);
    expect(drums().active).toEqual([0, 0, 0]);
    expect(drums().line).toEqual([{ slot: 0, times: 3 }, { slot: 2, times: 1, off: true }]);
    st().moveStep('t1', 1, -1);
    expect(drums().line?.map((x) => x.slot)).toEqual([2, 0]);
    st().toggleStep('t1', 0); st().removeStep('t1', 1);
    expect(drums().active).toEqual([2]);
  });

  it('a new scene copies what is heard (not the off steps) and becomes current; the old one is kept', () => {
    st().stopTrack('t1');
    st().addStep('t1', 0); st().addStep('t1', 2); st().toggleStep('t1', 1);
    const first = st().song.current!;
    st().newScene();
    const second = st().song.current!;
    expect(second).not.toBe(first);
    expect(drums().line).toBeUndefined();
    expect(st().song.scenes.find((x) => x.id === second)!.active.t1).toEqual([0]);
    st().tapSlot('t1', 1); // morph: drums switch to B in the new scene only
    expect(st().song.scenes.find((x) => x.id === first)!.active.t1).toEqual([0]);
    expect(st().song.scenes.find((x) => x.id === second)!.active.t1).toEqual([1]);
    st().launchScene(first);
    expect(drums().active).toEqual([0]);
  });

  it('editing a clip an earlier scene also plays edits a copy in the current scene', () => {
    st().newScene();
    const before = structuredClone(drums().slots[0]);
    expect(st().toggleHit('t1', 0, 'cr', 0)).toBe(true);
    const copy = drums().active[0];
    expect(copy).not.toBe(0);
    expect(drums().slots[0]).toEqual(before); // the earlier scene's clip is untouched
    expect(drums().slots[copy]!.kind === 'drums' && (drums().slots[copy] as any).hits.cr[0]).toBe(1);
    st().toggleHit('t1', copy, 'cr', 4); // later edits go to the copy itself
    expect(drums().active[0]).toBe(copy);
    expect(lead().slots.filter(Boolean).length).toBe(1);
  });

  it('cuts shorter lines at the top of the scene so every track restarts together', async () => {
    const { generate } = await import('../codegen/generate');
    st().stopTrack('t1');
    st().addStep('t1', 0); st().setStepTimes('t1', 0, 3); // drums: 3 bars; keys play a 2-bar clip; bass 1 bar
    st().tapSlot('t2', 0); st().tapSlot('t2', 0);
    const code = generate(st().song).code;
    expect(code).toMatch(/\ndrums: drums_A\.room/); // 3 bars of a 1-bar clip: it loops by itself
    expect(code).toMatch(/keys: keys_A\.ribbon\(0, 3\)/);
    st().setSceneFit(st().song.current!, 'cycle');
    expect(generate(st().song).code).not.toContain('ribbon');
  });
});
