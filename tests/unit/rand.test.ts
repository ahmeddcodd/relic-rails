import { describe, expect, it } from 'vitest';
import { Rand } from '../../src/core/rand';

describe('seeded RNG', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rand(1234);
    const b = new Rand(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    expect(new Rand(1).next()).not.toBe(new Rand(2).next());
  });

  it('respects bounds', () => {
    const r = new Rand(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
