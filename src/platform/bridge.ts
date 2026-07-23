// ---------------------------------------------------------------------------
// Platform bridge — isolates every YouTube Playables SDK touchpoint.
// Local dev runs with NO SDK present: LocalBridge no-ops / uses localStorage.
// ---------------------------------------------------------------------------

// Mirrors the official YouTube Playables SDK surface
// (https://developers.google.com/youtube/gaming/playables/reference/sdk).
// Only the parts the game uses are declared. Note the exact namespaces:
// pause/resume + audio live under `system` (NOT `game`), isAudioEnabled is
// synchronous, and the on* subscriptions return an unsubscribe function.
type Unsubscribe = () => void;
interface YTGame {
  /** True only inside the real Playables environment; false/absent locally. */
  readonly IN_PLAYABLES_ENV: boolean;
  readonly SDK_VERSION: string;
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  system: {
    onPause(cb: () => void): Unsubscribe;
    onResume(cb: () => void): Unsubscribe;
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (enabled: boolean) => void): Unsubscribe;
  };
  engagement?: {
    sendScore(payload: { value: number }): Promise<void>;
  };
  /** Best-effort, rate-limited telemetry. Optional across SDK builds. */
  health?: {
    logError(): void;
    logWarning(): void;
  };
}

declare global {
  interface Window {
    ytgame?: YTGame;
  }
}

export interface PlatformBridge {
  readonly isYouTube: boolean;
  firstFrameReady(): void;
  gameReady(): void;
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  isAudioEnabled(): Promise<boolean>;
  onAudioEnabledChange(cb: (enabled: boolean) => void): void;
  sendScore(value: number): Promise<void>;
}

const LS_KEY = 'relic-rails-save-v1';

class LocalBridge implements PlatformBridge {
  readonly isYouTube = false;
  private firstFrameFired = false;
  private gameReadyFired = false;

  firstFrameReady(): void {
    if (this.firstFrameFired) return;
    this.firstFrameFired = true;
  }
  gameReady(): void {
    if (this.gameReadyFired) return;
    this.gameReadyFired = true;
  }
  async loadData(): Promise<string> {
    try {
      return localStorage.getItem(LS_KEY) ?? '';
    } catch {
      return '';
    }
  }
  async saveData(data: string): Promise<void> {
    try {
      localStorage.setItem(LS_KEY, data);
    } catch {
      /* storage unavailable — play session-only */
    }
  }
  onPause(cb: () => void): void {
    // DEV-ONLY emulation. The real Playables contract forbids using the Page
    // Visibility API for pause/resume — YouTubeBridge relies solely on the SDK's
    // system.onPause/onResume callbacks, which always take priority.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cb();
    });
  }
  onResume(cb: () => void): void {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) cb();
    });
  }
  async isAudioEnabled(): Promise<boolean> {
    return true;
  }
  onAudioEnabledChange(_cb: (enabled: boolean) => void): void {
    /* no-op locally */
  }
  async sendScore(_value: number): Promise<void> {
    /* no-op locally */
  }
}

class YouTubeBridge implements PlatformBridge {
  readonly isYouTube = true;
  private firstFrameFired = false;
  private gameReadyFired = false;
  // The SDK's on* subscriptions return an unsubscribe fn. Playables games are
  // single-lifetime so we never call these, but we retain them rather than
  // discard — keeps teardown possible and documents the contract.
  private unsubs: Unsubscribe[] = [];
  constructor(private yt: YTGame) {}

  /** Report a caught SDK error to both the console and SDK health telemetry. */
  private warn(where: string, e: unknown): void {
    console.warn(`${where} failed`, e);
    try {
      this.yt.health?.logError();
    } catch {
      /* health telemetry is best-effort — never let it throw */
    }
  }

  firstFrameReady(): void {
    if (this.firstFrameFired) return;
    this.firstFrameFired = true;
    try {
      this.yt.game.firstFrameReady();
    } catch (e) {
      this.warn('firstFrameReady', e);
    }
  }
  gameReady(): void {
    if (this.gameReadyFired) return;
    this.gameReadyFired = true;
    try {
      this.yt.game.gameReady();
    } catch (e) {
      this.warn('gameReady', e);
    }
  }
  async loadData(): Promise<string> {
    try {
      return await this.yt.game.loadData();
    } catch {
      return '';
    }
  }
  async saveData(data: string): Promise<void> {
    try {
      await this.yt.game.saveData(data);
    } catch (e) {
      this.warn('saveData', e);
    }
  }
  // Pause/resume + audio state live on `ytgame.system` (NOT `ytgame.game`).
  // The game MUST pause on onPause and resume only on onResume — so these must
  // reach the SDK. We rely exclusively on these callbacks (never the Page
  // Visibility API) per certification requirements.
  onPause(cb: () => void): void {
    try {
      this.unsubs.push(this.yt.system.onPause(cb));
    } catch {
      /* SDK variant without pause */
    }
  }
  onResume(cb: () => void): void {
    try {
      this.unsubs.push(this.yt.system.onResume(cb));
    } catch {
      /* SDK variant without resume */
    }
  }
  async isAudioEnabled(): Promise<boolean> {
    // The SDK method is synchronous (returns a boolean). The bridge contract is
    // Promise-based so callers stay uniform across local/YouTube — adapt here.
    try {
      return this.yt.system.isAudioEnabled();
    } catch {
      return true;
    }
  }
  onAudioEnabledChange(cb: (enabled: boolean) => void): void {
    try {
      this.unsubs.push(this.yt.system.onAudioEnabledChange(cb));
    } catch {
      /* fall through */
    }
  }
  async sendScore(value: number): Promise<void> {
    try {
      await this.yt.engagement?.sendScore({ value });
    } catch (e) {
      this.warn('sendScore', e);
    }
  }
}

export function createBridge(): PlatformBridge {
  // Official env-detection guidance: use the real bridge only when the SDK
  // global exists AND reports it's running inside Playables. This guards against
  // a stray/partial `ytgame` global on a non-Playables page and lets local dev
  // (where the SDK is absent or a no-op) fall through to LocalBridge.
  const yt = window.ytgame;
  if (yt && yt.game && yt.IN_PLAYABLES_ENV) return new YouTubeBridge(yt);
  return new LocalBridge();
}

let shared: PlatformBridge | null = null;

/**
 * Process-wide bridge. The boot sequence needs to signal `firstFrameReady()`
 * from main.ts (as soon as the loading screen paints, before the model pack
 * downloads) while Game owns the rest of the lifecycle — both must talk to the
 * SAME instance so the idempotence flags actually hold.
 */
export function getBridge(): PlatformBridge {
  shared ??= createBridge();
  return shared;
}
