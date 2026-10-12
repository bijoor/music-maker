import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { demoSong } from '../model/demo';
import { generate } from '../codegen/generate';

const st = () => useStore.getState();
const drums = () => st().song.tracks[0];

beforeEach(() => useStore.setState({ song: demoSong() }));

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
    expect(drums().slots[0]!.kind === 'drums' && drums().slots[0]!.hits.cr[0]).toBe(1);
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

  it('duplicates into a free slot, adds slots up to 8, and deleting a playing clip stops it', () => {
    expect(st().duplicateClip('t1', 0)).toBe(3);
    expect(drums().slots[3]!.name).toBe('Groove 2');
    for (let i = 0; i < 10; i++) st().addSlot('t1');
    expect(drums().slots.length).toBe(8);
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
