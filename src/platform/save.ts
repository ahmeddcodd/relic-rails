// ---------------------------------------------------------------------------
// Versioned, migration-safe save system. Save stays tiny (<1 KiB).
// loadData() is always awaited before the first saveData() (enforced by Game).
// ---------------------------------------------------------------------------
import type { PlatformBridge } from './bridge';

export interface SaveData {
  version: number;
  bestScore: number;
  bestDistance: number;
  totalEmber: number;
  totalPrism: number;
  totalRuns: number;
  lifetimeDistance: number;
  tutorialDone: boolean;
  settings: {
    music: boolean;
    sfx: boolean;
    haptics: boolean;
    reducedFx: boolean;
  };
}

export const SAVE_VERSION = 1;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    bestScore: 0,
    bestDistance: 0,
    totalEmber: 0,
    totalPrism: 0,
    totalRuns: 0,
    lifetimeDistance: 0,
    tutorialDone: false,
    settings: { music: true, sfx: true, haptics: true, reducedFx: false },
  };
}

/** Validate + migrate arbitrary parsed JSON into a current SaveData. */
export function migrateSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  // v1 (and forward-compatible unknown versions): copy known numeric/bool fields.
  const num = (k: keyof SaveData & string): number =>
    typeof r[k] === 'number' && isFinite(r[k] as number) ? Math.max(0, r[k] as number) : (d[k] as number);
  d.bestScore = num('bestScore');
  d.bestDistance = num('bestDistance');
  d.totalEmber = num('totalEmber');
  d.totalPrism = num('totalPrism');
  d.totalRuns = num('totalRuns');
  d.lifetimeDistance = num('lifetimeDistance');
  if (typeof r.tutorialDone === 'boolean') d.tutorialDone = r.tutorialDone;
  const s = r.settings as Record<string, unknown> | undefined;
  if (s && typeof s === 'object') {
    for (const k of ['music', 'sfx', 'haptics', 'reducedFx'] as const) {
      if (typeof s[k] === 'boolean') d.settings[k] = s[k] as boolean;
    }
  }
  return d;
}

// YouTube Playables caps a single saveData payload at 3 MiB of UTF-16. Our save
// is <1 KiB by design, so this is a defensive ceiling: if serialization ever
// balloons past it (a bug), skip the write rather than let the SDK reject it.
const SAVE_BYTE_LIMIT = 3 * 1024 * 1024;

export class SaveManager {
  data: SaveData = defaultSave();
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private bridge: PlatformBridge) {}

  /** Serialize the save, or null if it exceeds the platform's 3 MiB limit. */
  private serialize(): string | null {
    const str = JSON.stringify(this.data);
    // UTF-16: each string code unit is 2 bytes.
    if (str.length * 2 > SAVE_BYTE_LIMIT) {
      console.warn(`save skipped: ${str.length * 2} bytes exceeds 3 MiB limit`);
      return null;
    }
    return str;
  }

  async load(): Promise<SaveData> {
    let raw: unknown = null;
    try {
      const str = await this.bridge.loadData();
      if (str) raw = JSON.parse(str);
    } catch {
      raw = null; // corrupted save → defaults
    }
    this.data = migrateSave(raw);
    this.loaded = true;
    return this.data;
  }

  /** Debounced save — batches rapid updates into one platform write. */
  save(): void {
    if (!this.loaded) return; // never write before load resolves
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const str = this.serialize();
      if (str !== null) void this.bridge.saveData(str);
    }, 400);
  }

  /** Immediate flush (used on run end / pause). */
  flush(): void {
    if (!this.loaded) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const str = this.serialize();
    if (str !== null) void this.bridge.saveData(str);
  }
}
