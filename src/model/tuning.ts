// Tuning a kit to the song: the tabla's dayan (and the mridangam's right head) is tuned to the song's Sa. Each kit's
// tuned strokes are played faster or slower so the Sa they were recorded at lands on the song's Sa — the nearest
// one, so a stroke moves at most half an octave — plus the track's own offset (e.g. +7 to tune to Pa).
import type { Song, Track } from './types';
import { kitVoices } from './kit';
import { tonicPc } from './scales';

/** The Sa (MIDI pitch) each Indian kit's tuned strokes were recorded at, measured from their ringing tones. */
export const KIT_SA: Record<string, number> = {
  // Na and Ta ring at G5 (786 Hz) and Tin at C5 (525 Hz): the 3rd and 2nd harmonics of a dayan at C4.
  Tabla: 60,
  // Nam, Dhin and Chapu ring at 383–385 Hz and Ardha chapu at 190 Hz: a right head at G3, 40 cents flat.
  Mridangam: 54.6,
};

/** Semitones a track's tuned strokes are moved, or 0 (not a tunable kit, or tuning off). */
export function tuneSemis(song: Song, track: Track): number {
  const sa = track.bank !== undefined ? KIT_SA[track.bank] : undefined;
  if (sa === undefined || track.tuning?.off) return 0;
  let d = (((tonicPc(song.key.tonic) - sa) % 12) + 12) % 12;
  if (d >= 6) d -= 12; // the nearest Sa: from 6 below to 5 above
  return d + (track.tuning?.offset ?? 0);
}

/** Playback speed for a stroke on a track (1 = as recorded): its kit's tuning when the stroke is a tuned one. */
export function strokeSpeed(song: Song, track: Track, voice: string): number {
  const semis = tuneSemis(song, track);
  if (!semis || !kitVoices(track.bank).find((k) => k.voice === voice)?.tuned) return 1;
  return Math.round(2 ** (semis / 12) * 10000) / 10000;
}
