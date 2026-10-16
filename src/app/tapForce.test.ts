import { describe, expect, it } from 'vitest';
import { joltVelocity } from './tapForce';

describe('tap force', () => {
  it('plays harder jolts louder, up to the hardest recent tap', () => {
    const recent = [0.5, 1, 2];
    expect(joltVelocity(0.01, recent)).toBe(0.2);
    expect(joltVelocity(2, recent)).toBeCloseTo(1);
    expect(joltVelocity(5, recent)).toBe(1);
    expect(joltVelocity(0.3, recent)).toBeGreaterThan(0.2);
    expect(joltVelocity(0.3, recent)).toBeLessThan(joltVelocity(1, recent));
  });
});
