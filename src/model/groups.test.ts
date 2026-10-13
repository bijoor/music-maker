import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state/store';
import { GROUPS, groupById } from './presets';
import { groupOf, keyboardOf } from './groups';
import { setMyKits } from './kit';
import { track } from './build';

const st = () => useStore.getState();
const last = () => st().song.tracks[st().song.tracks.length - 1];

beforeEach(() => useStore.setState({ song: { ...st().song, tracks: [] }, past: [], future: [] }));

describe('instrument groups', () => {
  it('names new tracks after their group, numbered, in the group’s colour', () => {
    const strings = groupById('strings')!;
    st().addTrack(strings);
    st().addTrack(strings);
    st().addTrack(groupById('indian-drums')!);
    expect(st().song.tracks.map((t) => t.name)).toEqual(['Strings', 'Strings 2', 'Indian drums']);
    expect(st().song.tracks.map((t) => t.color)).toEqual([strings.color, strings.color, groupById('indian-drums')!.color]);
    expect(last().bank).toBe('Tabla');
  });

  it('opens each group on its own keyboard, and each track keeps the one it is given', () => {
    st().addTrack(groupById('indian')!);
    expect(keyboardOf(last())).toEqual({ layout: 'pads', octaves: 2 });
    st().addTrack(groupById('keys')!);
    const keys = last();
    expect(keyboardOf(keys)).toEqual({ layout: 'piano', octaves: 2 });
    st().setTrackKeyboard(keys.id, { octaves: 1 });
    expect(keyboardOf(last())).toEqual({ layout: 'piano', octaves: 1 });
    expect(keyboardOf(st().song.tracks[0])).toEqual({ layout: 'pads', octaves: 2 });
  });

  it('places older tracks (without a group) by their sound or kit', () => {
    expect(groupOf(track({ id: 'a', name: 'x', kind: 'melodic', color: '', sound: 'gm_sitar' })).id).toBe('indian');
    expect(groupOf(track({ id: 'b', name: 'x', kind: 'melodic', color: '', sound: 'trumpet' })).id).toBe('wind');
    expect(groupOf(track({ id: 'c', name: 'x', kind: 'melodic', color: '', sound: 'acoustic_guitar' })).id).toBe('strings');
    expect(groupOf(track({ id: 'd', name: 'x', kind: 'drums', color: '', bank: 'Mridangam' })).id).toBe('indian-drums');
    expect(groupOf(track({ id: 'e', name: 'x', kind: 'drums', color: '', bank: 'RolandTR808' })).id).toBe('drums');
  });

  it('adds a recorded kit as a track of the group it was recorded into', () => {
    setMyKits([{ id: 'dh', name: 'Dholak', group: 'indian-drums', strokes: [{ voice: 'dholak_na', name: 'Na', main: true, hand: 'right' }] }]);
    st().addTrack(groupById('indian-drums')!, 'my:dh');
    expect(last()).toMatchObject({ name: 'Indian drums', bank: 'my:dh', group: 'indian-drums' });
    expect(GROUPS.filter((g) => g.kind === 'melodic').every((g) => g.keyboard && g.sounds?.length)).toBe(true);
  });
});
