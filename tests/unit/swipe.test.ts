// Mobile is the primary input for a YouTube Playable, so the swipe thresholds
// get the same scrutiny as the fairness rules.
//
// The regression these guard: the old recogniser required distance AND velocity
// together, so an ordinary deliberate thumb swipe (roughly 90 px over half a
// second) was silently discarded and the cart just did not move.
import { describe, expect, it } from 'vitest';
import { classifySwipe } from '../../src/game/input';
import { TUNING } from '../../src/config/tuning';

const g = TUNING.gesture;

describe('classifySwipe', () => {
  it('accepts a slow deliberate swipe on distance alone', () => {
    // 90 px over 600 ms = 0.15 px/ms — well under minSwipeVel, and the single
    // most common real-world swipe. This MUST register.
    expect(classifySwipe(-90, 4, 600, null)).toBe('left');
    expect(90 / 600).toBeLessThan(g.minSwipeVel);
  });

  it('accepts a fast flick before it reaches the full distance', () => {
    const dist = (g.flickDist + g.minSwipeDist) / 2; // between the two gates
    expect(dist).toBeLessThan(g.minSwipeDist);
    expect(classifySwipe(0, -dist, 30, null)).toBe('jump');
  });

  it('ignores jitter below both gates', () => {
    expect(classifySwipe(4, 3, 200, null)).toBeNull();
    // Short AND slow: under flickDist velocity relief and under minSwipeDist.
    expect(classifySwipe(g.flickDist - 1, 0, 500, null)).toBeNull();
  });

  it('maps direction by dominant axis', () => {
    expect(classifySwipe(60, 10, 200, null)).toBe('right');
    expect(classifySwipe(-60, 10, 200, null)).toBe('left');
    expect(classifySwipe(10, -60, 200, null)).toBe('jump');
    expect(classifySwipe(10, 60, 200, null)).toBe('duck');
  });

  it('never repeats the same direction on one held finger', () => {
    // The regression this prevents: re-arming on distance alone made a single
    // ordinary 100 px drag fire TWO lane changes, killing blameless players.
    expect(classifySwipe(-200, 0, 900, 'left')).toBeNull();
    expect(classifySwipe(-1000, 0, 3000, 'left')).toBeNull();
  });

  it('lets a held finger change direction with less travel', () => {
    const between = (g.reArmDist + g.minSwipeDist) / 2;
    expect(between).toBeLessThan(g.minSwipeDist);
    expect(between).toBeGreaterThan(g.reArmDist);
    // Too short to start a fresh gesture...
    expect(classifySwipe(0, -between, 500, null)).toBeNull();
    // ...but enough to follow a left with a jump without lifting the thumb.
    expect(classifySwipe(0, -between, 500, 'left')).toBe('jump');
  });

  it('still needs real travel to change direction', () => {
    expect(classifySwipe(0, -(g.reArmDist - 2), 500, 'left')).toBeNull();
  });

  it('keeps the thresholds in a sane order', () => {
    expect(g.flickDist).toBeLessThan(g.minSwipeDist);
    expect(g.reArmDist).toBeLessThan(g.minSwipeDist);
    expect(g.maxTapDist).toBeLessThan(g.minSwipeDist);
  });
});
