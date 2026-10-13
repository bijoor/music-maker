// The song model: the single source of truth. Strudel code is generated from it.

export const STEPS_PER_BAR = 16;
export const MAX_SLOTS = 8;
export type Bars = 1 | 2 | 4;

/** Drum clip: one row of hits per voice. Each row has bars × 16 steps; a value is the velocity (0 = no hit). */
export interface DrumClip {
  kind: 'drums';
  id: string;
  name: string;
  bars: Bars;
  hits: Record<string, number[]>;
  /** Hand-written Strudel code that the grid cannot show; it plays instead of `hits` until reset. */
  code?: string;
}

/** A note or chord starting at `step` (0-based within the clip), held for `len` steps, never crossing a bar line. */
export interface Note {
  step: number;
  len: number;
  /** MIDI note numbers; fractional values are microtones (cents / 100). */
  pitches: number[];
  vel: number;
  /**
   * Bend into the note: it starts this many semitones away (negative = from below) and slides to its pitch over
   * `bendTime` seconds. Written as Strudel's pitch envelope, `.penv(-bend).pattack(bendTime)`.
   */
  bend?: number;
  bendTime?: number;
}

export interface MelodicClip {
  kind: 'melodic';
  id: string;
  name: string;
  bars: Bars;
  notes: Note[];
  /** Hand-written Strudel code that the grid cannot show; it plays instead of `notes` until reset. */
  code?: string;
}

export type Clip = DrumClip | MelodicClip;

export interface Fx {
  gain: number;
  pan: number;
  /** Low-pass cutoff in Hz; undefined = filter open. */
  lpf?: number;
  room?: number;
  delay?: number;
  /**
   * Seconds each note takes to fade in, and keeps ringing after it ends (Strudel's attack and release). Together
   * they let a held note that repeats every bar (a drone) overlap itself instead of stopping at the bar line.
   */
  attack?: number;
  release?: number;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  kind: 'drums' | 'melodic';
  /** Drum machine for drum tracks, e.g. 'RolandTR909'. */
  bank?: string;
  /** Sound for melodic tracks, e.g. 'piano', 'gm_synth_bass_1', 'sawtooth'. */
  sound?: string;
  /** Lowest octave shown on the keyboard and grid. */
  octave: number;
  /** Whether a step may hold several notes (chords). */
  poly: boolean;
  fx: Fx;
  mute: boolean;
  solo: boolean;
  /** 1 to MAX_SLOTS slots; null = empty slot. */
  slots: (Clip | null)[];
  /** Slot indexes played in turn; [] = stopped. */
  active: number[];
  /** Hand-written play line (what the track plays) that the clip launcher cannot express; used until reset. */
  playCode?: string;
  /** The + Track group it was added from (model/presets GROUPS); older tracks are placed by their sound. */
  group?: string;
  /** Melodic tracks: the keyboard layout it plays with (else its group's default). */
  keyboard?: { layout: 'piano' | 'pads'; octaves: 1 | 2 };
}

/** A saved set of active slots, from any tracks. Tracks it does not name keep playing. */
export interface Scene {
  id: string;
  name: string;
  active: Record<string, number[]>;
}

export interface ScaleDef {
  id: string;
  name: string;
  group: 'Western' | 'Ragas' | 'Custom';
  /** Semitones above the tonic (Sa). */
  degrees: number[];
  /** Microtonal offset in cents per degree. */
  cents?: Record<number, number>;
  /** Degrees for a drone, e.g. [0, 7] for Sa–Pa. */
  drone?: number[];
}

export interface Song {
  version: 1;
  name: string;
  bpm: number;
  key: { tonic: string; scaleId: string };
  customScales: ScaleDef[];
  tracks: Track[];
  scenes: Scene[];
  /** Song mode: scenes in order with a bar count each (Phase 5). */
  arrangement: { sceneId: string; bars: number }[];
}
