// ---------------------------------------------------------------------------
// InputManager — single owner of all listeners. Swipes classified by distance
// AND velocity; taps kept separate; keyboard mirrors touch. Actions are queued
// and drained by the game each frame (input buffering happens in CartController).
// ---------------------------------------------------------------------------
import { TUNING } from '../config/tuning';

export type GameAction = 'left' | 'right' | 'jump' | 'duck' | 'overdrive' | 'tap' | 'pause';

export class InputManager {
  private queue: GameAction[] = [];
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private tracking = false;
  private swiped = false;
  /** When false, gameplay gestures are ignored (menus/results). */
  gameplayEnabled = false;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp, { passive: false });
    el.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', this.onKey);
    // Kill page scroll / selection during play
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    // Ignore pointers that start on UI buttons.
    if ((e.target as HTMLElement).closest('button, .ui-block')) return;
    this.tracking = true;
    this.swiped = false;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downT = performance.now();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.tracking || this.swiped || !this.gameplayEnabled) return;
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(1, performance.now() - this.downT);
    const vel = dist / dt;
    const g = TUNING.gesture;
    if (dist >= g.minSwipeDist && vel >= g.minSwipeVel) {
      this.swiped = true;
      if (Math.abs(dx) > Math.abs(dy)) this.push(dx > 0 ? 'right' : 'left');
      else this.push(dy < 0 ? 'jump' : 'duck');
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.tracking) return;
    this.tracking = false;
    if (this.swiped) return;
    const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    const dt = performance.now() - this.downT;
    const g = TUNING.gesture;
    if (dist <= g.maxTapDist && dt <= g.maxTapTime) this.push('tap');
  };

  private onCancel = (): void => {
    this.tracking = false;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.push('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.push('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        this.push('jump');
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.push('duck');
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyE':
        this.push('overdrive');
        break;
      case 'Escape':
        this.push('pause');
        break;
      case 'Enter':
        this.push('tap');
        break;
    }
  };

  private push(a: GameAction): void {
    if (!this.gameplayEnabled && a !== 'tap' && a !== 'pause') return;
    if (this.queue.length < 4) this.queue.push(a);
  }

  drain(): GameAction[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
