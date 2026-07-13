// ---------------------------------------------------------------------------
// Platform bridge — isolates every YouTube Playables SDK touchpoint.
// Local dev runs with NO SDK present: LocalBridge no-ops / uses localStorage.
// ---------------------------------------------------------------------------

interface YTGame {
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
    onPause(cb: () => void): void;
    onResume(cb: () => void): void;
  };
  system: {
    isAudioEnabled(): Promise<boolean> | boolean;
    onAudioEnabledChange(cb: (enabled: boolean) => void): void;
  };
  engagement?: {
    sendScore(payload: { value: number }): Promise<void>;
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
    // Mirror platform behavior locally with visibility changes.
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
  constructor(private yt: YTGame) {}

  firstFrameReady(): void {
    if (this.firstFrameFired) return;
    this.firstFrameFired = true;
    try {
      this.yt.game.firstFrameReady();
    } catch (e) {
      console.warn('firstFrameReady failed', e);
    }
  }
  gameReady(): void {
    if (this.gameReadyFired) return;
    this.gameReadyFired = true;
    try {
      this.yt.game.gameReady();
    } catch (e) {
      console.warn('gameReady failed', e);
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
      console.warn('saveData failed', e);
    }
  }
  onPause(cb: () => void): void {
    try {
      this.yt.game.onPause(cb);
    } catch {
      /* SDK variant without pause */
    }
  }
  onResume(cb: () => void): void {
    try {
      this.yt.game.onResume(cb);
    } catch {
      /* SDK variant without resume */
    }
  }
  async isAudioEnabled(): Promise<boolean> {
    try {
      return await this.yt.system.isAudioEnabled();
    } catch {
      return true;
    }
  }
  onAudioEnabledChange(cb: (enabled: boolean) => void): void {
    try {
      this.yt.system.onAudioEnabledChange(cb);
    } catch {
      /* fall through */
    }
  }
  async sendScore(value: number): Promise<void> {
    try {
      await this.yt.engagement?.sendScore({ value });
    } catch (e) {
      console.warn('sendScore failed', e);
    }
  }
}

export function createBridge(): PlatformBridge {
  const yt = window.ytgame;
  if (yt && yt.game) return new YouTubeBridge(yt);
  return new LocalBridge();
}
