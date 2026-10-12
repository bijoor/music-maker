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
}

const held = new Map<number, Held>();
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

/** The quantised step of the selected clip under what you hear now, and the recording pass it belongs to. */
function recordStep(track: Track, slot: number): { step: number; cycle: number; group: string } | null {
  const cycle = engine.heardCycle();
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

/** A drum pad. */
export function drum(trackId: string, voice: string, sound: Record<string, unknown>) {
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
  const at = recordStep(track, slot);
  if (at) s.recordHit(trackId, slot, voice, at.step, at.group);
}

/** A key or chord pressed with pointer `pointerId`. */
export function press(trackId: string, pitches: number[], pointerId: number, chord = false) {
  const track = trackOf(trackId);
  if (!track) return;
  pitches.forEach((p) => player.preview(trackId, { note: p, s: track.sound ?? 'piano' }));
  const s = state();
  if (s.mode === 'perform') return;
  const slot = needClip(track);
  if (slot === null) return;
  if (s.mode === 'edit') {
    const len = chord ? s.chordLen : s.noteLen;
    s.recordNote(trackId, slot, s.cursor % (track.slots[slot]!.bars * STEPS_PER_BAR), pitches, len, `edit:${editGroup++}`);
    advance(track, slot, len);
    return;
  }
  if (!readyToRecord(track, slot)) return;
  const at = recordStep(track, slot);
  if (!at) return;
  s.recordNote(trackId, slot, at.step, pitches, s.quantize, at.group);
  held.set(pointerId, { trackId, slot, step: at.step, pitches, startCycle: at.cycle, group: at.group });
}

/** The key or chord was released: set the recorded note's length to how long it was held. */
export function release(pointerId: number) {
  const h = held.get(pointerId);
  if (!h) return;
  held.delete(pointerId);
  const q = state().quantize;
  const steps = (engine.heardCycle() - h.startCycle) * STEPS_PER_BAR;
  const len = Math.max(q, Math.round(steps / q) * q);
  if (len > q) state().recordNote(h.trackId, h.slot, h.step, h.pitches, len, h.group);
}
