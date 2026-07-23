// Collision is a 1-D overlap test sampled once per frame, so a hazard is only
// caught if the cart cannot cross its whole overlap window inside a single
// integration step. Raising the speed curve eats into that margin.
//
// This is the hard ceiling on any future speed increase: if these fail, either
// widen the hazard windows or lower TUNING.maxFrameDt — do not just raise the
// speed. (Commit fe9e121 was already a phase-through fix.)
import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/config/tuning';
import { OBSTACLE_SPECS, type ObstacleType } from '../../src/game/entities';

/** Metres the cart can close on a hazard in one worst-case frame. */
function worstCaseStep(type: ObstacleType): number {
  // Overdrive adds speed on top of the endless ramp's hard ceiling, and an
  // oncoming cart drives toward the player at the same time.
  const closing =
    TUNING.speed.max +
    TUNING.speed.overdriveBonus +
    (type === 'oncoming' ? TUNING.collision.oncomingSpeed : 0);
  return closing * TUNING.maxFrameDt;
}

/** Full length of the overlap window along the track. */
function windowLength(type: ObstacleType): number {
  return 2 * (OBSTACLE_SPECS[type].halfLen + TUNING.collision.cartHalf);
}

describe('collision sampling margin', () => {
  const types = Object.keys(OBSTACLE_SPECS) as ObstacleType[];

  it.each(types)('%s cannot be crossed in a single frame', (type) => {
    // Strictly greater than 1 means at least one sample always lands inside.
    // 1.25 keeps real headroom rather than sitting on the boundary.
    expect(windowLength(type) / worstCaseStep(type)).toBeGreaterThan(1.25);
  });

  it('reports the tightest hazard so the ceiling is visible', () => {
    const tightest = types
      .map((t) => ({ t, ratio: windowLength(t) / worstCaseStep(t) }))
      .sort((a, b) => a.ratio - b.ratio)[0];
    // Documents which hazard limits future speed increases.
    expect(tightest.ratio).toBeGreaterThan(1.25);
    expect(OBSTACLE_SPECS[tightest.t].halfLen).toBeLessThanOrEqual(1.2);
  });

  it('keeps a free lane reachable: a switch fits between lanes', () => {
    // A hazard occupies laneWidth either side of its lane centre; adjacent lane
    // centres must sit outside that, or a "free" lane would still collide.
    const laneGap = TUNING.track.laneOffsets[1] - TUNING.track.laneOffsets[0];
    expect(laneGap).toBeGreaterThan(TUNING.collision.laneWidth);
  });
});
