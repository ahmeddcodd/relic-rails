import { describe, expect, it } from 'vitest';
import { sampleCrashMotion } from '../src/game/crashMotion';

const DURATION = 1.8;

describe('sampleCrashMotion', () => {
  it('adds a readable hop and settles on the rails', () => {
    const airborne = sampleCrashMotion(0.62, 1, DURATION);
    const settled = sampleCrashMotion(DURATION, 1, DURATION);

    expect(airborne.lift).toBeGreaterThan(0.2);
    expect(settled.lift).toBe(0);
    expect(settled.squash).toBe(0);
    expect(settled.drift).toBeCloseTo(0.32);
    expect(settled.recoil).toBeCloseTo(-0.28);
  });

  it('mirrors only the lateral drift', () => {
    const left = sampleCrashMotion(0.9, -1, DURATION);
    const right = sampleCrashMotion(0.9, 1, DURATION);

    expect(left.drift).toBeCloseTo(-right.drift);
    expect(left.lift).toBeCloseTo(right.lift);
    expect(left.recoil).toBeCloseTo(right.recoil);
    expect(left.squash).toBeCloseTo(right.squash);
  });

  it('clamps invalid timeline values to stable endpoints', () => {
    expect(sampleCrashMotion(-4, 1, DURATION)).toEqual(sampleCrashMotion(0, 1, DURATION));
    expect(sampleCrashMotion(99, 1, DURATION)).toEqual(sampleCrashMotion(DURATION, 1, DURATION));
  });
});
