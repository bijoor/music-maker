// What a pad, key or chord press does in each mode:
//   Perform — sound only.
//   Record  — sound, and the hit or note snaps to the nearest step of the selected clip as it loops. Held keys
//             set the note length on release. Starting from silence plays a one-bar count-in first.
//   Edit    — sound, and the hit or note is placed at the cursor step, which then moves on.
import { useStore } from '../state/store';
import { sections } from '../codegen/generate';
import { STEPS_PER_BAR, type Track } from '../model/types';
import * as engine from './strudel';
import * as player from './player';

interface Held {
  trackId: string;
  slot: number;
  step: number;
  pitches: number[];
  startCycle: number;
  group: string;
  /** Bend the note was recorded with (a slide from another key), kept when its length is set on release. */
  bend?: { bend: number; time: number };
  vel: number;
}

const held = new Map<number, Held>();

/**
 * Bar position you heard when you touched (from the touch's timestamp), corrected by this device's
 * calibrated record offset: positive offsets mean taps register late, so they are moved earlier.
 */
function heardAt(timeStamp?: number): number {
  const cycle = engine.cycleHeardAt(timeStamp ?? performance.now());
  return cycle - (state().recordOffsetMs / 1000) * engine.getCps();
}
let editGroup = 0;

const state = () => useStore.getState();
const trackOf = (id: string) => state().song.tracks.find((t) => t.id === id);

/** The selected clip slot on this track, if there is one. */
function selectedSlot(track: Track): number | null {
  const { selected } = state();
  return selected.trackId === track.id && selected.slot !== null && track.slots[selected.slot] ? selected.slot : null;
}

/**
 * Make sure the selected clip is playing so the press can be recorded. Returns false (and starts or launches
 * what is needed) when the clip is not playing yet; this press is then heard but not written.
 */
function readyToRecord(track: Track, slot: number): boolean {
  const s = state();
  const onlyThis = track.active.length === 1 && track.active[0] === slot;
  if (s.transport === 'stopped') {
    if (!onlyThis) s.tapSlot(track.id, slot);
    player.play({ countIn: s.countIn });
    s.setMessage(s.countIn ? 'Count-in: recording starts after one bar' : 'Recording');
    return false;
  }
  if (s.transport !== 'playing') return false;
  if (!track.active.includes(slot)) {
    s.tapSlot(track.id, slot);
    s.setMessage('The clip starts at the next bar; keep playing to record');
    return false;
  }
  return true;
}

/**
 * The quantised step of the selected clip that was heard when the touch happened (from the event's own
 * timestamp, so a busy moment cannot push the note later), and its recording pass.
 */
function recordStep(track: Track, slot: number, timeStamp: number | undefined): { step: number; cycle: number; group: string } | null {
  const cycle = heardAt(timeStamp);
  const pos = engine.position(track.id, cycle);
  const clip = track.slots[slot];
  if (!pos || !clip) return null;
  let start = 0;
  for (const sec of sections(track)) {
    if (pos.bars < start + sec.bars) {
      if (sec.slot !== slot) return null;
      const total = clip.bars * STEPS_PER_BAR;
      const exact = ((pos.bars - start) % clip.bars) * STEPS_PER_BAR;
      const q = state().quantize;
      return { step: (Math.round(exact / q) * q) % total, cycle, group: `rec:${clip.id}:${pos.pass}` };
    }
    start += sec.bars;
  }
  return null;
}

/** Move the Edit-mode cursor on by `by` steps, wrapping within the clip. */
function advance(track: Track, slot: number, by: number) {
  const clip = track.slots[slot]!;
  const s = state();
  s.setUi({ cursor: (s.cursor + by) % (clip.bars * STEPS_PER_BAR) });
}

function needClip(track: Track): number | null {
  const slot = selectedSlot(track);
  if (slot === null) state().setMessage('Select a clip, or tap + in an empty slot, to put notes in');
  return slot;
}

/** Sound fields for a velocity: none at full strength, so values stay as the generated code plays them. */
const velocityValue = (vel: number) => (vel < 1 ? { velocity: vel } : {});

/** A drum pad struck at velocity `vel` (0–1). `timeStamp` is the pointer event's timestamp. */
export function drum(trackId: string, voice: string, sound: Record<string, unknown>, timeStamp?: number, vel = 1) {
  player.preview(trackId, { ...sound, ...velocityValue(vel) });
  const track = trackOf(trackId);
  const s = state();
  if (!track || s.mode === 'perform') return;
  const slot = needClip(track);
  if (slot === null) return;
  if (s.mode === 'edit') {
    s.recordHit(trackId, slot, voice, s.cursor % (track.slots[slot]!.bars * STEPS_PER_BAR), `edit:${editGroup++}`, vel);
    advance(track, slot, s.quantize);
    return;
  }
  if (!readyToRecord(track, slot)) return;
  const at = recordStep(track, slot, timeStamp);
  if (at) s.recordHit(trackId, slot, voice, at.step, at.group, vel);
}

let pedal = false;
/** Notes sounding while their key is held, by pointer: call to let go. */
const sounding = new Map<number, () => void>();
/** Notes whose key was let go while the sustain pedal was down: they ring until it comes up. */
let pedalled: (() => void)[] = [];
const pedalDown = () => pedal || state().sustain;
/** Let go of every note the pedal was holding. */
function liftPedal() {
  const notes = pedalled;
  pedalled = [];
  notes.forEach((stop) => stop());
}
// The Sustain button coming off lifts the pedal too.
useStore.subscribe((s, prev) => { if (prev.sustain && !s.sustain && !pedal) liftPedal(); });
/**
 * What each pointer is playing, so sliding the finger can glide its pitch: `base` is the pitch the note started
 * on, `landed` the key it is nearest now (what gets recorded).
 */
const voices = new Map<number, { trackId: string; base: number; landed: number; struck: number; vel: number; notes: engine.HeldNote[] }>();
/** Seconds a recorded slide takes to reach the new note when played back. */
export const SLIDE_TIME = 0.12;
/** Hold the sustain pedal (Shift on a computer keyboard) while it is down. */
export const setPedal = (down: boolean) => {
  pedal = down;
  if (!down && !state().sustain) liftPedal();
};

/** A key or chord pressed with pointer `pointerId`, struck at velocity `vel`; `timeStamp` is the pointer event's timestamp. */
export function press(trackId: string, pitches: number[], pointerId: number, chord = false, timeStamp?: number, vel = 1) {
  const track = trackOf(trackId);
  if (!track) return;
  // Like a real instrument (and GeoShred), a note sounds for as long as its key is held; with the sustain pedal
  // down (Sustain button or Shift) it keeps ringing after the key is let go, until the pedal comes up.
  const notes = pitches.map((p) => player.hold(trackId, { note: p, s: track.sound ?? 'piano', ...velocityValue(vel) }));
  sounding.get(pointerId)?.();
  sounding.set(pointerId, () => notes.forEach((n) => n.stop()));
  voices.set(pointerId, { trackId, base: pitches[0], landed: pitches[0], struck: vel, vel, notes });
  recordPress(track, pitches, pointerId, chord, timeStamp, vel);
}

/** Write a pressed key or chord into the selected clip (Edit: at the cursor; Record: at the step it was heard). */
function recordPress(track: Track, pitches: number[], pointerId: number, chord: boolean, timeStamp: number | undefined, vel: number, bend?: { bend: number; time: number }) {
  const s = state();
  if (s.mode === 'perform') return;
  const slot = needClip(track);
  if (slot === null) return;
  if (s.mode === 'edit') {
    const len = chord ? s.chordLen : s.noteLen;
    s.recordNote(track.id, slot, s.cursor % (track.slots[slot]!.bars * STEPS_PER_BAR), pitches, len, `edit:${editGroup++}`, bend, vel);
    advance(track, slot, len);
    return;
  }
  if (!readyToRecord(track, slot)) return;
  const at = recordStep(track, slot, timeStamp);
  if (!at) return;
  // A quick tap writes the "New notes" length (as previewed); holding longer extends it on release.
  s.recordNote(track.id, slot, at.step, pitches, Math.max(s.quantize, s.noteLen), at.group, bend, vel);
  held.set(pointerId, { trackId: track.id, slot, step: at.step, pitches, startCycle: at.cycle, group: at.group, bend, vel });
}

/** Set a recorded note's length to how long it was held (Record mode). */
function finishHeld(pointerId: number, timeStamp?: number) {
  const h = held.get(pointerId);
  if (!h) return;
  held.delete(pointerId);
  const { quantize: q, noteLen } = state();
  const steps = (heardAt(timeStamp) - h.startCycle) * STEPS_PER_BAR;
  const len = Math.round(steps / q) * q;
  if (len > Math.max(q, noteLen)) state().recordNote(h.trackId, h.slot, h.step, h.pitches, len, h.group, h.bend, h.vel);
}

/** The key or chord was released: stop its notes (or leave them to the pedal), and set the recorded note's length to how long it was held. */
export function release(pointerId: number, timeStamp?: number) {
  const stop = sounding.get(pointerId);
  sounding.delete(pointerId);
  if (stop) { if (pedalDown()) pedalled.push(stop); else stop(); }
  voices.delete(pointerId);
  finishHeld(pointerId, timeStamp);
}

/**
 * The finger holding a key moved up or down: the note gets louder or softer smoothly, to velocity `vel`. Notes
 * recorded from here on (keys the finger slides onto) take that velocity.
 */
export function swell(pointerId: number, vel: number) {
  const v = voices.get(pointerId);
  if (!v) return;
  v.vel = Math.round(vel * 100) / 100;
  v.notes.forEach((n) => n.level(vel / v.struck));
}

/**
 * The finger holding a key moved sideways: the note's pitch follows it smoothly to `pitch` (fractional between
 * keys), like a string bend, or with `ease` (seconds) eases there (settling onto a key). `landed` is the key under the finger: when that changes, Record and Edit write the
 * new key's note, bending in from the previous one, so the grid keeps an outline of the slide.
 */
export function glide(pointerId: number, pitch: number, landed: number, timeStamp?: number, ease?: number) {
  const v = voices.get(pointerId);
  if (!v) return;
  v.notes.forEach((n) => n.glide(pitch - v.base, ease));
  if (Math.abs(landed - v.landed) < 0.001) return;
  const from = v.landed;
  v.landed = landed;
  const track = trackOf(v.trackId);
  if (!track) return;
  finishHeld(pointerId, timeStamp);
  recordPress(track, [landed], pointerId, false, timeStamp, v.vel, { bend: Math.round((from - landed) * 100) / 100, time: SLIDE_TIME });
}
