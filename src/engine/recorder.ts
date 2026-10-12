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

/** A drum pad. `timeStamp` is the pointer event's timestamp. */
export function drum(trackId: string, voice: string, sound: Record<string, unknown>, timeStamp?: number) {
  player.preview(trackId, sound);
  const track = trackOf(trackId);
  const s = state();
  if (!track || s.mode === 'perform') return;
  const slot = needClip(track);
  if (slot === null) return;
  if (s.mode === 'edit') {
    s.recordHit(trackId, slot, voice, s.cursor % (track.slots[slot]!.bars * STEPS_PER_BAR), `edit:${editGroup++}`);
    advance(track, slot, s.quantize);
    return;
  }
  if (!readyToRecord(track, slot)) return;
  const at = recordStep(track, slot, timeStamp);
  if (at) s.recordHit(trackId, slot, voice, at.step, at.group);
}

let pedal = false;
/** Held notes still sounding (sustain on), by pointer: call to let go. */
const sounding = new Map<number, () => void>();
/** What each pointer is playing, so sliding to another key can glide from it. */
const voices = new Map<number, { trackId: string; pitch: number; stop: () => void }>();
/** Seconds a slide between keys takes to reach the new note. */
export const SLIDE_TIME = 0.12;
/** Hold the sustain pedal (Shift on a computer keyboard) while it is down. */
export const setPedal = (down: boolean) => { pedal = down; };

/**
 * A key or chord pressed with pointer `pointerId`; `timeStamp` is the pointer event's timestamp. `slideFrom` is
 * the pitch the finger slid from: the note then bends in from it (and is recorded with that bend).
 */
export function press(trackId: string, pitches: number[], pointerId: number, chord = false, timeStamp?: number, slideFrom?: number) {
  const track = trackOf(trackId);
  if (!track) return;
  const st = state();
  const bend = slideFrom !== undefined && pitches.length === 1 ? Math.round((slideFrom - pitches[0]) * 100) / 100 : 0;
  const bendInfo = bend ? { bend, time: SLIDE_TIME } : undefined;
  const value = (p: number) => ({ note: p, s: track.sound ?? 'piano', ...(bend ? { penv: -bend, pattack: SLIDE_TIME } : {}) });
  // The preview lasts as long as the note that will be written: chord length for chords in Edit, else the "New notes" length.
  // With sustain on (button or Shift held), the note sounds for as long as the key is held. Either way it can be
  // cut short by sliding to another key.
  const sustained = st.sustain || pedal;
  const previewLen = chord && st.mode === 'edit' ? st.chordLen : st.noteLen;
  const stops = pitches.map((p) => player.hold(trackId, value(p), sustained ? undefined : previewLen));
  const stop = () => stops.forEach((f) => f());
  if (sustained) sounding.set(pointerId, stop);
  voices.set(pointerId, { trackId, pitch: pitches[0], stop });
  const s = state();
  if (s.mode === 'perform') return;
  const slot = needClip(track);
  if (slot === null) return;
  if (s.mode === 'edit') {
    const len = chord ? s.chordLen : s.noteLen;
    s.recordNote(trackId, slot, s.cursor % (track.slots[slot]!.bars * STEPS_PER_BAR), pitches, len, `edit:${editGroup++}`, bendInfo);
    advance(track, slot, len);
    return;
  }
  if (!readyToRecord(track, slot)) return;
  const at = recordStep(track, slot, timeStamp);
  if (!at) return;
  // A quick tap writes the "New notes" length (as previewed); holding longer extends it on release.
  s.recordNote(trackId, slot, at.step, pitches, Math.max(s.quantize, s.noteLen), at.group, bendInfo);
  held.set(pointerId, { trackId, slot, step: at.step, pitches, startCycle: at.cycle, group: at.group, bend: bendInfo });
}

/** The key or chord was released: stop a sustained note, and set the recorded note's length to how long it was held. */
export function release(pointerId: number, timeStamp?: number) {
  sounding.get(pointerId)?.();
  sounding.delete(pointerId);
  voices.delete(pointerId);
  const h = held.get(pointerId);
  if (!h) return;
  held.delete(pointerId);
  const { quantize: q, noteLen } = state();
  const steps = (heardAt(timeStamp) - h.startCycle) * STEPS_PER_BAR;
  const len = Math.round(steps / q) * q;
  if (len > Math.max(q, noteLen)) state().recordNote(h.trackId, h.slot, h.step, h.pitches, len, h.group, h.bend);
}

/**
 * The finger holding a key slid onto another key: the old note stops and the new one bends in from its pitch,
 * like a meend. In Record and Edit the new note is written with that bend.
 */
export function slide(pointerId: number, pitch: number, timeStamp?: number) {
  const v = voices.get(pointerId);
  if (!v || Math.abs(v.pitch - pitch) < 0.001) return;
  v.stop();
  release(pointerId, timeStamp);
  press(v.trackId, [pitch], pointerId, false, timeStamp, v.pitch);
}
