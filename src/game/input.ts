// ---------------------------------------------------------------------------
// InputManager — single owner of all listeners. Mobile-first: this is a touch
// game that also happens to run with a keyboard.
//
// Gesture contract (tuned against real thumbs, not mouse drags):
//   • A swipe commits on DISTANCE alone; a fast flick commits earlier, at a
//     shorter distance. Requiring distance AND velocity together silently ate
//     ordinary deliberate swipes.
//   • The gesture RE-ARMS while the finger stays down, so held-thumb flicking
//     (left, left, jump) works without lifting between actions.
//   • Exactly one pointer drives gameplay; extra touches (resting palm, second
//     thumb) are ignored rather than corrupting the in-flight gesture.
// Actions are queued and drained by the game each frame (input buffering
// happens in CartController).
// ---------------------------------------------------------------------------
import { TUNING } from '../config/tuning';

export type GameAction = 'left' | 'right' | 'jump' | 'duck' | 'overdrive' | 'tap' | 'pause';
export type SwipeAction = 'left' | 'right' | 'jump' | 'duck';

/**
 * Has this drag committed to a swipe, and which way?
 *
 * Two rules, both learned the hard way:
 *
 * 1. Distance ALONE commits. The old rule required distance AND velocity
 *    together (22 px within ~90 ms), which quietly rejected ordinary
 *    deliberate thumb swipes — the player swiped and nothing happened. A fast
 *    flick still commits early, at a shorter distance, so flicking stays snappy.
 *
 * 2. A finger that stays down can only fire again in a DIFFERENT direction.
 *    Re-arming on distance alone made one ordinary 100 px drag fire two lane
 *    changes (measured in-game), which would kill players who did nothing
 *    wrong. Chaining left-then-up without lifting still works; repeating the
 *    same direction needs a fresh touch, which is the natural motion anyway.
 *
 * `lastAction` is the action already fired by this touch, or null for a fresh
 * one. Pure, so the mobile-critical thresholds are testable without a DOM.
 */
export function classifySwipe(
  dx: number,
  dy: number,
  elapsedMs: number,
  lastAction: SwipeAction | null,
): SwipeAction | null {
  const g = TUNING.gesture;
  const dist = Math.hypot(dx, dy);
  // A finger already mid-gesture needs less fresh travel to change direction.
  const minDist = lastAction ? g.reArmDist : g.minSwipeDist;
  const vel = dist / Math.max(1, elapsedMs);
  const flicked = dist >= g.flickDist && vel >= g.minSwipeVel;
  if (dist < minDist && !flicked) return null;
  const action: SwipeAction =
    Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'jump' : 'duck';
  // Rule 2: same direction on a held finger is follow-through, not a new swipe.
  return action === lastAction ? null : action;
}

export class InputManager {
  private queue: GameAction[] = [];
  /** Pointer currently driving gameplay; null when idle. */
  private activeId: number | null = null;
  /** Gesture origin — reset after each recognised swipe so the finger re-arms. */
  private originX = 0;
  private originY = 0;
  private originT = 0;
  /** Where the pointer first went down, for tap classification. */
  private downX = 0;
  private downY = 0;
  private downT = 0;
  /** Action already fired by the active touch, or null if it has fired none. */
  private lastAction: SwipeAction | null = null;
  private onButton = false;
  /** When false, gameplay gestures are ignored (menus/results). */
  gameplayEnabled = false;
  /**
   * Master switch, independent of `gameplayEnabled`. False while the platform
   * has the game paused: every listener goes inert in EVERY state, so no tap,
   * swipe or key can reach the game — not even the menu and results buttons.
   */
  enabled = true;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    // Release on WINDOW, not the element: a finger lifted outside the viewport
    // would otherwise leave the gesture latched and deadlock all later input.
    // Deliberately NOT setPointerCapture — capturing on #app retargets `click`
    // away from the Overdrive and menu buttons nested inside it.
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', this.onKey);
    // Kill page scroll / selection during play
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    // One pointer owns the gesture; ignore additional touches until it lifts.
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    // Track gestures that START on a button too — the Overdrive button sits in
    // the bottom-right corner, exactly where a right-handed player swipes. The
    // button still receives its own click if the gesture ends as a tap.
    this.onButton = !!(e.target as HTMLElement).closest('button, .ui-block');
    this.lastAction = null;
    this.downX = this.originX = e.clientX;
    this.downY = this.originY = e.clientY;
    this.downT = this.originT = performance.now();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled || e.pointerId !== this.activeId || !this.gameplayEnabled) return;
    const now = performance.now();
    const action = classifySwipe(
      e.clientX - this.originX,
      e.clientY - this.originY,
      now - this.originT,
      this.lastAction,
    );
    if (!action) return;

    this.lastAction = action;
    this.push(action);
    // Re-arm from the current point: the finger may stay down and swipe again,
    // which is how players actually chain left-left or left-then-jump.
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.originT = now;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    const swiped = this.lastAction !== null;
    const onButton = this.onButton;
    this.release();
    if (swiped) return;
    const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    const dt = performance.now() - this.downT;
    const g = TUNING.gesture;
    // A tap that began on a button belongs to that button's own click handler.
    if (!onButton && dist <= g.maxTapDist && dt <= g.maxTapTime) this.push('tap');
  };

  private onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    this.release();
  };

  private release(): void {
    this.activeId = null;
    this.lastAction = null;
    this.onButton = false;
  }

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
    // Covers every source at once, including the keyboard.
    if (!this.enabled) return;
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
    this.release();
  }
}
