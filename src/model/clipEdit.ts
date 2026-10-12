// Pure note-editing rules for melodic clips. Notes never overlap and never cross a bar line.
import { STEPS_PER_BAR, type MelodicClip, type Note } from './types';

const same = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** The note sounding at `step` (starting there or held over it), if any. */
export function noteCovering(clip: MelodicClip, step: number): Note | undefined {
  return clip.notes.find((n) => n.step <= step && step < n.step + n.len);
}

/**
 * Place pitches at `step` for `len` steps. `add` (chords on polyphonic tracks) merges into a note already
 * starting at that step; otherwise the new note replaces it. A note held over `step` is cut short, notes
 * starting inside the new note are removed, and the length stops at the bar line.
 */
export function writeNote(clip: MelodicClip, step: number, pitches: number[], len: number, add = false) {
  const barEnd = (Math.floor(step / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
  len = Math.max(1, Math.min(len, barEnd - step, clip.bars * STEPS_PER_BAR - step));
  const existing = clip.notes.find((n) => n.step === step);
  if (add && existing) {
    for (const p of pitches) if (!existing.pitches.some((x) => same(x, p))) existing.pitches.push(p);
    existing.pitches.sort((a, b) => a - b);
    len = Math.max(len, existing.len);
    existing.len = len;
  } else {
    clip.notes = clip.notes.filter((n) => n.step !== step);
    clip.notes.push({ step, len, pitches: [...pitches].sort((a, b) => a - b), vel: 1 });
  }
  for (const n of clip.notes) if (n.step < step && n.step + n.len > step) n.len = step - n.step;
  clip.notes = clip.notes.filter((n) => !(n.step > step && n.step < step + len));
  clip.notes.sort((a, b) => a.step - b.step);
}

/**
 * Tap on a grid cell: if the pitch sounds there, remove it from its note (the whole note goes when it was the
 * last pitch); otherwise add a note of `len` steps, merging into a chord on polyphonic tracks.
 */
export function toggleNote(clip: MelodicClip, step: number, pitch: number, len: number, poly: boolean): boolean {
  const n = noteCovering(clip, step);
  if (n && n.pitches.some((p) => same(p, pitch))) {
    n.pitches = n.pitches.filter((p) => !same(p, pitch));
    if (!n.pitches.length) clip.notes = clip.notes.filter((x) => x !== n);
    return false;
  }
  writeNote(clip, step, [pitch], len, poly);
  return true;
}

/** The note before the one starting at `step` (the latest note that starts earlier), if any. */
export function previousNote(clip: MelodicClip, step: number): Note | undefined {
  return clip.notes.filter((n) => n.step < step && n.pitches.length).sort((a, b) => b.step - a.step)[0];
}

/**
 * Semitones a note at `step` would bend in from to slide from the previous note's pitch (lowest pitch of each,
 * so a melody line reads naturally), limited to an octave; null when there is no previous note.
 */
export function bendFromPrevious(clip: MelodicClip, step: number): number | null {
  const n = clip.notes.find((x) => x.step === step), prev = previousNote(clip, step);
  if (!n?.pitches.length || !prev) return null;
  const d = prev.pitches[0] - n.pitches[0];
  return Math.max(-12, Math.min(12, Math.round(d * 100) / 100));
}

/** Set (or with `bend` 0 / null, clear) the bend of the note starting at `step`. Returns false when there is none. */
export function setBend(clip: MelodicClip, step: number, bend: number | null, time?: number): boolean {
  const n = clip.notes.find((x) => x.step === step);
  if (!n) return false;
  if (!bend) { delete n.bend; delete n.bendTime; return true; }
  n.bend = bend;
  if (time !== undefined) n.bendTime = time;
  return true;
}
