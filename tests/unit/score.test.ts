import { describe, expect, it } from 'vitest';
import { ScoreSystem, OverdriveSystem } from '../../src/game/systems';
import { TUNING } from '../../src/config/tuning';

describe('ScoreSystem', () => {
  it('climbs combo tiers with skill events and caps at 5', () => {
    const s = new ScoreSystem();
    for (let i = 0; i < 100; i++) s.perfect();
    expect(s.comboTier).toBe(5);
    expect(s.bestComboTier).toBe(5);
  });

  it('multiplies skill scoring by tier', () => {
    const s = new ScoreSystem();
    const base = s.perfect();
    expect(base).toBe(TUNING.score.perfect);
    while (s.comboTier < 2) s.perfect();
    const boosted = s.perfect();
    expect(boosted).toBe(TUNING.score.perfect * 2);
  });

  it('minor hit drops one tier, major resets to 1', () => {
    const s = new ScoreSystem();
    for (let i = 0; i < 9; i++) s.perfect(); // → tier 4
    expect(s.comboTier).toBe(4);
    s.minorHit();
    expect(s.comboTier).toBe(3);
    s.majorHit();
    expect(s.comboTier).toBe(1);
  });

  it('decays a tier after the idle window', () => {
    const s = new ScoreSystem();
    for (let i = 0; i < 3; i++) s.perfect();
    expect(s.comboTier).toBe(2);
    s.update(TUNING.score.comboDecayTime + 0.1);
    expect(s.comboTier).toBe(1);
  });

  it('distance scoring accumulates whole points', () => {
    const s = new ScoreSystem();
    for (let i = 0; i < 100; i++) s.addDistance(1);
    expect(s.score).toBeGreaterThanOrEqual(100 * TUNING.score.perMetre - 12);
  });

  it('reset clears everything', () => {
    const s = new ScoreSystem();
    s.perfect();
    s.ember();
    s.reset();
    expect(s.score).toBe(0);
    expect(s.comboTier).toBe(1);
    expect(s.emberCount).toBe(0);
  });
});

describe('OverdriveSystem', () => {
  it('fills, activates once ready, then runs out', () => {
    const od = new OverdriveSystem();
    expect(od.tryActivate()).toBe(false);
    for (let i = 0; i < 20; i++) od.fill(0.09);
    expect(od.ready).toBe(true);
    expect(od.tryActivate()).toBe(true);
    expect(od.active).toBe(true);
    expect(od.tryActivate()).toBe(false); // no double-activate
    let expired = false;
    for (let i = 0; i < 200 && !expired; i++) expired = od.update(0.05);
    expect(expired).toBe(true);
    expect(od.active).toBe(false);
  });

  it('does not fill while active', () => {
    const od = new OverdriveSystem();
    od.meter = 1;
    od.tryActivate();
    od.fill(0.5);
    expect(od.meter).toBe(0);
  });
});
