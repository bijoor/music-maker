import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUTS, depthVelocity, headCircles, hitTest, VIEW, type DrumLayout } from './drumLayout';

const tabla = (): DrumLayout => structuredClone(DEFAULT_LAYOUTS.Tabla);
/** A point on a head at a fraction of its radius, a fraction of a turn clockwise from the top. */
const at = (layout: DrumLayout, head: 0 | 1, r: number, turn: number) => {
  const c = headCircles(VIEW)[head];
  return hitTest(layout, c.cx + r * c.R * Math.sin(turn * 2 * Math.PI), c.cy - r * c.R * Math.cos(turn * 2 * Math.PI));
};

describe('drum layout hit test', () => {
  it('finds the area and segment under a point', () => {
    const l = tabla();
    expect(at(l, 1, 0.95, 0)).toMatchObject({ head: 1, part: 'rim', seg: 0 });
    expect(at(l, 1, 0.95, 1 / 3)).toMatchObject({ head: 1, part: 'rim', seg: 1 });
    expect(at(l, 1, 0.05, 0)).toMatchObject({ head: 1, part: 'centre' });
    expect(at(l, 0, 0.95, 0.5)).toMatchObject({ head: 0, part: 'rim', seg: 1 });
  });

  it('turns segments with the area', () => {
    const l = tabla();
    l[1].turn = { rim: 1 / 6 };
    // Segment 1 now spans from the top to a third of a turn; just left of the top is segment 3.
    expect(at(l, 1, 0.95, 0.1)).toMatchObject({ part: 'rim', seg: 0 });
    expect(at(l, 1, 0.95, 0.95)).toMatchObject({ part: 'rim', seg: 2 });
    // Other areas keep their places.
    expect(at(l, 1, 0.4, 0.01)).toMatchObject({ part: 'syahi', seg: 0 });
  });

  it('misses outside the heads', () => {
    expect(hitTest(tabla(), 2, 2)).toBeNull();
  });
});

describe('velocity by depth', () => {
  it('rises across the area toward its loud side', () => {
    const l = tabla();
    const inner = at(l, 1, 0.73, 0)!, outer = at(l, 1, 0.99, 0)!;
    expect(inner.part).toBe('rim');
    expect(depthVelocity(outer)).toBeGreaterThan(0.9);
    expect(depthVelocity(inner)).toBeLessThan(0.35);
    expect(depthVelocity(inner, 'in')).toBeGreaterThan(0.9);
  });
});
