import { useStore } from '../state/store';

/**
 * Velocity from where a key or pad was struck, as in GeoShred: soft at one edge, full at the other (which edge is
 * a per-device setting; off means always full). The last stretch near the loud edge is all full strength, so a
 * normal tap there plays at full volume. Returns 0.25–1 in steps of 0.05.
 */
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
