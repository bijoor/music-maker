import { useStore } from '../state/store';

/**
 * Velocity from where a key or pad was struck, as in GeoShred: soft at one edge, full at the other (which edge is
 * a per-device setting; off means always full). The last stretch near the loud edge is all full strength, so a
 * normal tap there plays at full volume. Returns 0.25–1 in steps of 0.05.
 */
/**
 * Velocity after the finger moved `dy` pixels (down is positive) on a key `height` tall, from `start`: the same
 * scale as striking, so sliding the length of the key covers the whole range. Unchanged when the setting is off.
 */
export function slideVelocity(start: number, dy: number, height: number): number {
  const dir = useStore.getState().touchVelocity;
  if (!dir || !height) return start;
  const v = start + (dir * dy * 0.75) / (0.85 * height);
  return Math.max(0.05, Math.min(1, Math.round(v * 100) / 100));
}

export function strikeVelocity(clientY: number, el: Element): number {
  const dir = useStore.getState().touchVelocity;
  if (!dir) return 1;
  const r = el.getBoundingClientRect();
  if (!r.height) return 1;
  let t = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  if (dir < 0) t = 1 - t;
  t = Math.min(1, t / 0.85);
  return Math.round((0.25 + 0.75 * t) * 20) / 20;
}

/**
 * Drum pads: velocity from where the pad was struck in both directions, soft at the top-left corner and full at the
 * bottom-right (flipped with the setting), on the same scale as the keys.
 */
export function strikeVelocity2D(clientX: number, clientY: number, el: Element): number {
  const dir = useStore.getState().touchVelocity;
  if (!dir) return 1;
  const r = el.getBoundingClientRect();
  if (!r.height || !r.width) return 1;
  let t = (Math.max(0, Math.min(1, (clientX - r.left) / r.width)) + Math.max(0, Math.min(1, (clientY - r.top) / r.height))) / 2;
  if (dir < 0) t = 1 - t;
  t = Math.min(1, t / 0.85);
  return Math.round((0.25 + 0.75 * t) * 20) / 20;
}

/**
 * Drum pads: velocity after the finger moved (`dx`, `dy`) from the strike, either way: right and down are louder
 * (flipped with the setting); moving the pad's full width or height covers the whole range.
 */
export function slideVelocity2D(start: number, dx: number, dy: number, width: number, height: number): number {
  const dir = useStore.getState().touchVelocity;
  if (!dir || !width || !height) return start;
  const v = start + (dir * 0.75 / 0.85) * (dx / width + dy / height);
  return Math.max(0.05, Math.min(1, Math.round(v * 100) / 100));
}
