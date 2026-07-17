// Verifies the endless distance-based speed ramp: speed is flat through the
// timed phases, then climbs with distance past `endlessFrom`, capped at `max`.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TrackPath } from '../../src/game/track';
import { ObstacleManager, CollectibleManager } from '../../src/game/entities';
import { Director } from '../../src/game/director';
import { TUNING } from '../../src/config/tuning';

function makeDirector() {
  const scene = new THREE.Scene();
  const path = new TrackPath();
  return new Director(path, new ObstacleManager(path, scene), new CollectibleManager(path, scene));
}

/** Advance to a given time+distance, then read targetSpeed at an exact cartDist. */
function speedAt(cartDist: number): number {
  const d = makeDirector();
  d.reset(1, false);
  // Push run time well past the final phase so the endless ramp is active.
  d.update(TUNING.phases[TUNING.phases.length - 1] + 5, cartDist);
  return d.targetSpeed;
}

describe('endless speed ramp', () => {
  it('is flat at the final phase speed before the ramp starts', () => {
    const phase5 = TUNING.speed.phase5;
    expect(speedAt(TUNING.speed.endlessFrom - 100)).toBeCloseTo(phase5, 5);
  });

  it('increases with distance past endlessFrom', () => {
    const near = speedAt(TUNING.speed.endlessFrom + 500);
    const far = speedAt(TUNING.speed.endlessFrom + 3000);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(TUNING.speed.phase5);
  });

  it('never exceeds the hard max cap', () => {
    // The ramp reaches `max` at endlessFrom + (max - phase5)/perMetre metres.
    // Test just past that point (not a pathological distance — update() would
    // otherwise generate that entire track window and hang).
    const reachMax =
      TUNING.speed.endlessFrom +
      (TUNING.speed.max - TUNING.speed.phase5) / TUNING.speed.endlessPerMetre;
    expect(speedAt(reachMax + 500)).toBeCloseTo(TUNING.speed.max, 5);
  });

  it('does NOT ramp during the timed phases (distance ignored early)', () => {
    const d = makeDirector();
    d.reset(1, false);
    d.update(0, 100); // t=0 → phase 0
    expect(d.targetSpeed).toBeCloseTo(TUNING.speed.start, 5);
  });
});
