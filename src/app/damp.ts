// Open and damped strokes: struck and lifted at once, a stroke rings; struck with the finger left resting on the
// skin, it is damped after a moment (as a tabla player stops a stroke ringing). A finger that slides is swelling or
// bending the stroke instead, so it is not damped.
import type { HeldNote } from '../engine/strudel';

/** A finger still down this long after striking damps the stroke. */
const HOLD_MS = 110;
/** How quickly a damped stroke dies away (seconds). */
const DAMP_FADE = 0.07;
/** Moving further than this (px) counts as sliding. */
const STILL_PX = 8;

/**
 * Wait to see whether a finger rests or lifts: `rest` runs if it is still down (and has not slid) after HOLD_MS,
 * `lift` if it comes up (or slides) first.
 */
export function onRest(pointerId: number, x0: number, y0: number, rest: () => void, lift: () => void = () => {}, after = HOLD_MS) {
  let moved = false, settled = false;
  const finish = (rested: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    if (rested) rest(); else lift();
  };
  const move = (ev: PointerEvent) => { if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > STILL_PX) { moved = true; finish(false); } };
  const up = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false); };
  const timer = setTimeout(() => finish(!moved), after);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/** How quickly an open stroke is cut when its closed stroke takes over (seconds). */
export const SWAP_FADE = 0.025;

export function dampOnHold(sound: HeldNote, pointerId: number, x0: number, y0: number) {
  onRest(pointerId, x0, y0, () => sound.stop(DAMP_FADE));
}
