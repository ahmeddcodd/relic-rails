// Fairness soak: generate several kilometres of content across many seeds and
// assert the validator finds no impossible rows or unfair reaction windows.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TrackPath } from '../../src/game/track';
import { ObstacleManager, CollectibleManager } from '../../src/game/entities';
import { Director, parseBiomeOverride, validatePlan } from '../../src/game/director';
import { TUNING } from '../../src/config/tuning';

function generate(seed: number, metres: number) {
  const scene = new THREE.Scene();
  const path = new TrackPath();
  const obstacles = new ObstacleManager(path, scene);
  const collectibles = new CollectibleManager(path, scene);
  const director = new Director(path, obstacles, collectibles);
  director.reset(seed, false);
  // Simulate a run advancing through the content without rendering.
  let dist = 0;
  let time = 0;
  while (dist < metres) {
    director.update(0.5, dist);
    dist += director.targetSpeed * 0.5;
    time += 0.5;
  }
  return { director, obstacles, time };
}

describe('DifficultyDirector fairness', () => {
  it('rotates biomes normally when no dev override is supplied', () => {
    expect(Number.isNaN(parseBiomeOverride(null))).toBe(true);
    expect(Number.isNaN(parseBiomeOverride(''))).toBe(true);
    expect(Number.isNaN(parseBiomeOverride('4'))).toBe(true);
    expect(parseBiomeOverride('2')).toBe(2);

    const { director } = generate(1, 10);
    expect(director.biomeAt(0)).toBe(0);
    expect(director.biomeAt(TUNING.biome.length + 1)).toBe(1);
    expect(director.biomeAt(TUNING.biome.length * 2 + 1)).toBe(2);
    expect(director.biomeAt(TUNING.biome.length * 3 + 1)).toBe(3);
  });

  it('produces a valid plan across seeds', () => {
    for (const seed of [1, 42, 777, 123456, 987654321]) {
      const { director, obstacles } = generate(seed, 3000);
      const minGap = TUNING.speed.start * TUNING.fairness.reactionTime;
      const issues = validatePlan(
        director.plan,
        obstacles.list.map((o) => ({ dist: o.dist, lane: o.lane, type: o.type })),
        minGap,
      );
      expect(issues, `seed ${seed}: ${JSON.stringify(issues.slice(0, 3))}`).toEqual([]);
    }
  });

  it('places content and reaches later phases', () => {
    const { director } = generate(7, 3000);
    expect(director.plan.length).toBeGreaterThan(30);
    expect(director.phase).toBeGreaterThanOrEqual(3);
  });

  it('track path stays generated ahead', () => {
    const scene = new THREE.Scene();
    const path = new TrackPath();
    const director = new Director(path, new ObstacleManager(path, scene), new CollectibleManager(path, scene));
    director.reset(3, false);
    director.update(0.1, 0);
    expect(path.headDist).toBeGreaterThanOrEqual(TUNING.track.aheadDist);
  });

  it('is deterministic per seed', () => {
    const a = generate(99, 1500).director.plan;
    const b = generate(99, 1500).director.plan;
    expect(a).toEqual(b);
  });
});
