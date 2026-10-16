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

export function dampOnHold(sound: HeldNote, pointerId: number, x0: number, y0: number) {
  let moved = false;
  const move = (ev: PointerEvent) => { if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > STILL_PX) moved = true; };
  const done = () => {
    clearTimeout(timer);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
  };
  const up = (ev: PointerEvent) => { if (ev.pointerId === pointerId) done(); };
  const timer = setTimeout(() => { if (!moved) sound.stop(DAMP_FADE); done(); }, HOLD_MS);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}
