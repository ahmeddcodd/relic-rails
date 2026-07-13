import { describe, expect, it } from 'vitest';
import { defaultSave, migrateSave, SAVE_VERSION } from '../../src/platform/save';

describe('save migration', () => {
  it('returns defaults for null/garbage', () => {
    expect(migrateSave(null)).toEqual(defaultSave());
    expect(migrateSave('nonsense')).toEqual(defaultSave());
    expect(migrateSave(42)).toEqual(defaultSave());
  });

  it('keeps known fields and drops unknown ones', () => {
    const d = migrateSave({ version: SAVE_VERSION, bestScore: 1234, alien: true });
    expect(d.bestScore).toBe(1234);
    expect((d as unknown as Record<string, unknown>).alien).toBeUndefined();
  });

  it('sanitises invalid numbers', () => {
    const d = migrateSave({ bestScore: -50, bestDistance: NaN, totalEmber: 'x' });
    expect(d.bestScore).toBe(0);
    expect(d.bestDistance).toBe(0);
    expect(d.totalEmber).toBe(0);
  });

  it('merges partial settings', () => {
    const d = migrateSave({ settings: { music: false } });
    expect(d.settings.music).toBe(false);
    expect(d.settings.sfx).toBe(true);
  });

  it('is forward compatible with future versions', () => {
    const d = migrateSave({ version: 99, bestScore: 7, futureField: [1, 2, 3] });
    expect(d.bestScore).toBe(7);
    expect(d.version).toBe(SAVE_VERSION);
  });

  it('save stays tiny', () => {
    expect(JSON.stringify(defaultSave()).length).toBeLessThan(500);
  });
});
