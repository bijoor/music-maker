// Which + Track group a track belongs to, and what that means for its keyboard (per-device group defaults).
import { GROUPS, groupById, type InstrumentPreset, type KeyboardSetup } from './presets';
import { SOUNDS } from './sounds';
import { getMyKits, isIndianKit } from './kit';
import type { Track } from './types';

/** The group of a track: the one it was added from, else the one its sound or kit belongs to. */
export function groupOf(track: Track): InstrumentPreset {
  const g = groupById(track.group);
  if (g) return g;
  if (track.kind === 'drums') {
    const mine = getMyKits().find((k) => `my:${k.id}` === track.bank);
    return groupById(isIndianKit(track.bank) || (mine && mine.group !== 'drums') ? 'indian-drums' : 'drums')!;
  }
  const soundGroup = SOUNDS.find((s) => s.id === track.sound)?.group;
  return GROUPS.find((x) => x.kind === 'melodic' && !x.drone && x.sounds?.includes(soundGroup ?? '')) ?? groupById('keys')!;
}

const KEY = 'music-maker:groupKeyboards';
function defaults(): Record<string, KeyboardSetup> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

/** The keyboard a new track of this group opens with: the last one chosen for the group on this device, else the group's own. */
export const groupKeyboard = (g: InstrumentPreset): KeyboardSetup => defaults()[g.id] ?? g.keyboard ?? { layout: 'piano', octaves: 2 };

/** Remember a keyboard as the group's default for new tracks (on this device). */
export function setGroupKeyboard(groupId: string, k: KeyboardSetup) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...defaults(), [groupId]: k })); } catch { /* this session only */ }
}

/** The keyboard a track plays with: its own, else its group's default. */
export const keyboardOf = (track: Track): KeyboardSetup => track.keyboard ?? groupKeyboard(groupOf(track));

/** A new track's name: the group's name, numbered from the second ("Strings", "Strings 2"). */
export function trackName(g: InstrumentPreset, tracks: Track[]): string {
  const n = tracks.filter((t) => groupOf(t).id === g.id).length;
  return n ? `${g.name} ${n + 1}` : g.name;
}
