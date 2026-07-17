import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { OBSTACLE_SPECS } from '../../src/game/entities';

describe('authored duck clearance contract', () => {
  for (const type of ['beam', 'gate'] as const) {
    it(`${type} blocks standing Rin and clears crouched Rin`, () => {
      const clearance = OBSTACLE_SPECS[type].clearHeight;
      expect(TUNING.cart.standingRiderTop).toBeGreaterThan(clearance);
      expect(TUNING.cart.duckRiderTop).toBeLessThan(clearance);
      expect(clearance - TUNING.cart.duckRiderTop).toBeCloseTo(0.07, 5);
    });
  }
});
