// Tracks' lines and scenes: steps with repeat counts, what they play, and how long a scene is.
import type { Scene, Song, Step, Track } from './types';

/** Group what a track plays into steps: [0, 0, 0, 2] → A ×3, C ×1. */
export function groupLine(active: number[]): Step[] {
  const out: Step[] = [];
  for (const slot of active) {
    const last = out[out.length - 1];
    if (last && last.slot === slot) last.times++;
    else out.push({ slot, times: 1 });
  }
  return out;
}

/** What a line plays: its steps that are on, each repeated its number of times. */
export const expandLine = (line: Step[]): number[] => line.flatMap((s) => (s.off ? [] : Array(Math.max(1, s.times)).fill(s.slot)));

/** A track's line: the one kept on the track when it still matches what plays, else what plays, grouped. */
export function lineOf(track: Track): Step[] {
  if (track.line && expandLine(track.line).join() === track.active.join()) return track.line;
  return groupLine(track.active);
}

/** Set a track's line (and so what it plays). The line is only kept when it has off steps. */
export function setLine(track: Track, line: Step[]) {
  const clean = line.filter((s) => track.slots[s.slot]).map((s) => ({ ...s, times: Math.max(1, Math.round(s.times)) }));
  track.active = expandLine(clean);
  if (clean.some((s) => s.off)) track.line = clean;
  else delete track.line;
}

/** Drop a track's off steps (when the scene is left). */
export const pruneLine = (track: Track) => { delete track.line; };

/** Bars a track's line plays for (once through). */
export const lineBars = (track: Track, active: number[] = track.active) =>
  active.reduce((n, slot) => n + (track.slots[slot]?.bars ?? 0), 0);

/** A scene's length in bars: its longest track's line (0 when nothing plays). */
export function sceneBars(song: Song, scene?: Scene): number {
  return Math.max(0, ...song.tracks.map((t) => lineBars(t, scene ? scene.active[t.id] ?? [] : t.active)));
}

export const currentScene = (song: Song) => song.scenes.find((s) => s.id === song.current);

/** Which scenes, other than the current one, play this slot of this track. */
export const otherScenesUsing = (song: Song, trackId: string, slot: number) =>
  song.scenes.filter((s) => s.id !== song.current && s.active[trackId]?.includes(slot));
