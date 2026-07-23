// ---------------------------------------------------------------------------
// CartController — kinematic spline-follower with lane switching, authored
// jump arc, buffered inputs, minor-stumble and crash states, plus all
// procedural cart/Rin animation. No physics engine; the track is the truth.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING, type LaneIndex } from '../config/tuning';
import {
  buildCart,
  buildRin,
  playAssetClip,
  updateAssetAnimation,
  type CartModel,
  type RinModel,
} from '../render/assets';
import type { TrackPath } from './track';
import { sampleCrashMotion, type CrashDirection } from './crashMotion';

export interface CartEvents {
  onSwitch(dir: -1 | 1): void;
  onJump(): void;
  onLand(): void;
  onDuck(): void;
}

const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// Deck-penetration clamp scratch (crash path only — never allocated per frame).
const rigBox = new THREE.Box3();
const partBox = new THREE.Box3();
const tmpInv = new THREE.Matrix4();
const tmpRel = new THREE.Matrix4();

type BufferedAction = 'left' | 'right' | 'jump' | 'duck' | null;

/**
 * Authored clips played on impact. Rin deliberately does NOT use her own
 * 'crash' clip — see startCrash(). Exported so the crash test asserts the
 * contract rather than trusting a comment.
 */
export const CRASH_CLIPS = { cart: 'crash', rin: 'stumble' } as const;

export class CartController {
  root = new THREE.Group();
  model: CartModel;
  rin: RinModel;

  dist = 0;
  speed = 0;
  targetSpeed: number = TUNING.speed.start;
  speedMult = 1; // overdrive / crash multiplier

  laneIdx: LaneIndex = 1;
  private laneFrom = 0; // lateral offsets
  private laneTo = 0;
  private laneT = 1;
  private switchCooldown = 0;
  lateral = 0;

  y = 0; // height above rails
  private jumpT = -1; // -1 = grounded, else 0..1
  private duckT = 0;
  airborne = false;
  ducking = false;

  /** Physical top of the authored cart+rider silhouette above the rail plane. */
  get riderTop(): number {
    return this.ducking ? TUNING.cart.duckRiderTop : TUNING.cart.standingRiderTop;
  }

  crashed = false;
  private crashT = 0;
  private crashSide: CrashDirection = 1;
  stumbleT = 0; // >0 during minor-hit recovery (also brief invulnerability)

  get crashProgress(): number {
    return Math.min(1, this.crashT / TUNING.cart.crashDuration);
  }

  get crashDirection(): CrashDirection {
    return this.crashSide;
  }

  private buffered: BufferedAction = null;
  private bufferAge = 0;

  private leanVel = 0;
  private lean = 0;
  private rinActionT = 0;

  constructor(private path: TrackPath, scene: THREE.Scene, private events: CartEvents) {
    this.model = buildCart();
    this.rin = buildRin();
    // Both files use metres, +Y up, +Z forward. The authored rider socket is
    // therefore the only placement offset Rin needs.
    this.model.riderSocket.add(this.rin.root);
    this.root.add(this.model.root);
    // Parented to the track basis, not the cart body, so it stays pinned to the
    // deck through jumps and leans (applyTransform cancels the jump height).
    this.root.add(this.model.shadow);
    scene.add(this.root);
    playAssetClip(this.model.animationRoot, 'idle_loop', true);
    playAssetClip(this.rin.root, 'idle_cart', true);
  }

  reset(): void {
    this.dist = 0;
    this.speed = 0;
    this.targetSpeed = TUNING.speed.start;
    this.speedMult = 1;
    this.laneIdx = 1;
    this.laneFrom = this.laneTo = 0;
    this.laneT = 1;
    this.lateral = 0;
    this.y = 0;
    this.jumpT = -1;
    this.duckT = 0;
    this.airborne = false;
    this.ducking = false;
    this.crashed = false;
    this.crashT = 0;
    this.crashSide = 1;
    this.stumbleT = 0;
    this.buffered = null;
    this.lean = 0;
    this.leanVel = 0;
    this.rinActionT = 0;
    this.model.hull.position.set(0, 0, 0);
    this.model.hull.rotation.set(0, 0, 0);
    this.model.hull.scale.set(1, 1, 1);
    this.model.root.rotation.set(0, 0, 0);
    this.model.root.position.set(0, 0, 0);
    this.model.shield.visible = false;
    playAssetClip(this.model.animationRoot, 'idle_loop', true);
    playAssetClip(this.rin.root, 'idle_cart', true);
  }

  /** Queue a gameplay action (with input buffering). */
  act(a: 'left' | 'right' | 'jump' | 'duck'): void {
    if (this.crashed) return;
    if (!this.tryAct(a)) {
      this.buffered = a;
      this.bufferAge = 0;
    }
  }

  private tryAct(a: BufferedAction): boolean {
    if (!a) return false;
    const c = TUNING.cart;
    switch (a) {
      case 'left':
      case 'right': {
        if (this.switchCooldown > 0 || this.laneT < 0.72) return false;
        const dir = a === 'left' ? -1 : 1;
        const next = this.laneIdx + dir;
        if (next < 0 || next > 2) {
          // bump against tunnel edge — small wobble, not an error state
          this.leanVel += dir * 2.4;
          return true;
        }
        this.laneIdx = next as LaneIndex;
        this.laneFrom = this.lateral;
        this.laneTo = TUNING.track.laneOffsets[next as LaneIndex];
        this.laneT = 0;
        this.switchCooldown = c.laneSwitchCooldown;
        this.leanVel += dir * 5;
        this.playRinAction(dir < 0 ? 'lean_left' : 'lean_right', 0.42, 1.6);
        this.events.onSwitch(dir as -1 | 1);
        return true;
      }
      case 'jump':
        if (this.airborne) return false;
        this.jumpT = 0;
        this.airborne = true;
        this.ducking = false;
        this.duckT = 0;
        this.playRinAction('jump', c.jumpTime, 2.2);
        this.events.onJump();
        return true;
      case 'duck':
        if (this.airborne) {
          // fast-fall: cut the jump short
          this.jumpT = Math.max(this.jumpT, 0.72);
          return true;
        }
        this.duckT = TUNING.cart.duckTime;
        if (!this.ducking) this.events.onDuck();
        this.ducking = true;
        this.playRinAction('duck', c.duckTime, 1.5);
        return true;
    }
    return false;
  }

  startCrash(): void {
    if (this.crashed) return;
    this.crashed = true;
    this.crashT = 0;
    // Outer lanes always fall toward the track centre. Centre-lane impacts use
    // a stable direction so replays and screenshots remain deterministic.
    this.crashSide =
      this.laneIdx === 0 ? 1 : this.laneIdx === 2 ? -1 : Math.floor(this.dist / 12) % 2 === 0 ? 1 : -1;
    this.airborne = false;
    this.ducking = false;
    this.jumpT = -1;
    this.duckT = 0;
    this.y = 0;
    this.buffered = null;
    this.lean = 0;
    this.leanVel = 0;
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.model.hull.position.set(0, 0, 0);
    this.model.hull.rotation.set(0, 0, 0);
    this.model.hull.scale.set(1, 1, 1);
    this.model.shield.visible = false;
    playAssetClip(this.model.animationRoot, CRASH_CLIPS.cart, true, TUNING.cart.crashRollScale);
    // NOT Rin's 'crash' clip. Rin is parented to the cart's SOCKET_rider, so her
    // clip's own 93.7-degree root rotation and -0.38 m root drop COMPOUND with
    // the cart's roll — together they drove her head 2.26 m below the deck.
    // 'stumble' is a real balance-loss performance whose root barely moves.
    playAssetClip(this.rin.root, CRASH_CLIPS.rin, true, 1);
  }

  stumble(): void {
    this.stumbleT = TUNING.speed.recoverTime;
    this.speed *= 1 - TUNING.speed.minorHitLoss;
    this.leanVel += (Math.random() > 0.5 ? 1 : -1) * 6;
    this.playRinAction('stumble', Math.min(0.85, TUNING.speed.recoverTime), 1.2);
  }

  get invulnerable(): boolean {
    return this.stumbleT > TUNING.speed.recoverTime - TUNING.speed.mercyTime;
  }

  /** Advance authored idle clips without advancing gameplay kinematics. */
  animateIdle(dt: number): void {
    playAssetClip(this.model.animationRoot, 'idle_loop');
    playAssetClip(this.rin.root, 'idle_cart');
    updateAssetAnimation(this.model.animationRoot, dt);
    updateAssetAnimation(this.rin.root, dt);
  }

  update(dt: number): void {
    const c = TUNING.cart;

    if (this.crashed) {
      this.crashT = Math.min(TUNING.cart.crashDuration, this.crashT + dt);
      this.speed = Math.max(0, this.speed - dt * TUNING.cart.crashDeceleration);
      this.dist += this.speed * dt * TUNING.cart.crashTravelScale;
      const motion = sampleCrashMotion(this.crashT, this.crashSide, TUNING.cart.crashDuration);
      this.model.root.position.set(0, 0, 0);
      this.model.root.rotation.set(0, 0, 0);
      this.model.hull.position.set(motion.drift, motion.lift, motion.recoil);
      this.model.hull.rotation.set(0, 0, 0);
      this.model.hull.scale.set(
        1 + motion.squash * 0.055,
        1 - motion.squash * 0.11,
        1 + motion.squash * 0.035,
      );
      this.applyTransform(dt);
      this.clampToDeck();
      return;
    }

    // Speed
    if (this.stumbleT > 0) this.stumbleT -= dt;
    const accel = this.stumbleT > 0 ? 3.5 : 6.5;
    const goal = this.targetSpeed * this.speedMult;
    this.speed += Math.max(-accel, Math.min(accel, goal - this.speed)) * dt * 2;
    this.dist += this.speed * dt;

    // Buffered input
    if (this.buffered) {
      this.bufferAge += dt;
      if (this.bufferAge > c.inputBufferTime) this.buffered = null;
      else if (this.tryAct(this.buffered)) this.buffered = null;
    }

    // Lane transition
    if (this.switchCooldown > 0) this.switchCooldown -= dt;
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / c.laneSwitchTime);
      const e = this.laneT < 0.5 ? 2 * this.laneT * this.laneT : 1 - Math.pow(-2 * this.laneT + 2, 2) / 2;
      this.lateral = this.laneFrom + (this.laneTo - this.laneFrom) * e;
    } else {
      this.lateral = TUNING.track.laneOffsets[this.laneIdx];
    }

    // Jump arc
    if (this.jumpT >= 0) {
      this.jumpT += dt / c.jumpTime;
      if (this.jumpT >= 1) {
        this.jumpT = -1;
        this.airborne = false;
        this.y = 0;
        this.events.onLand();
      } else {
        this.y = c.jumpHeight * 4 * this.jumpT * (1 - this.jumpT);
      }
    }

    // Duck
    if (this.duckT > 0) {
      this.duckT -= dt;
      if (this.duckT <= 0) this.ducking = false;
    }

    this.applyTransform(dt);
  }

  /**
   * Hard guarantee that no part of the cart or rider ever enters the deck.
   *
   * Measured in the track basis (this.root's local space) where y = 0 IS the
   * rail plane, so it stays correct through curves and grades. Authored clips
   * are free to tumble however they like; this lifts the rig by exactly the
   * penetration depth, making ground clipping structurally impossible.
   *
   * Crash-only: during normal play this.root already rides at jump height, so
   * local y = 0 is the cart, not the deck.
   */
  private clampToDeck(): void {
    const clearance = TUNING.cart.crashGroundClearance;
    // Measure from a neutral lift so the correction never accumulates.
    this.model.root.position.y = 0;
    this.root.updateMatrixWorld(true);
    tmpInv.copy(this.root.matrixWorld).invert();

    rigBox.makeEmpty();
    let measured = false;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      // The blob shadow IS the deck plane and the shield is a transient bubble.
      if (mesh === this.model.shadow || mesh === this.model.shield) return;
      const geo = mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      partBox.copy(geo.boundingBox!);
      tmpRel.multiplyMatrices(tmpInv, mesh.matrixWorld);
      partBox.applyMatrix4(tmpRel);
      rigBox.union(partBox);
      measured = true;
    });

    // Headless unit tests construct the cart without the authored GLB meshes.
    if (!measured) return;
    if (rigBox.min.y < clearance) {
      this.model.root.position.y = clearance - rigBox.min.y;
    }
  }

  private applyTransform(dt: number): void {
    const grade = this.path.getGrade(this.dist);
    this.path.getPoint(this.dist, this.lateral, tmpP);
    this.path.getDir(this.dist, tmpF);
    tmpF.y = grade;
    tmpF.normalize();
    tmpR.crossVectors(tmpF, UP).normalize();
    tmpU.crossVectors(tmpR, tmpF).normalize();
    this.root.matrixAutoUpdate = false;
    this.root.matrix.makeBasis(tmpR, tmpU, tmpF);
    tmpP.y += this.y;
    this.root.matrix.setPosition(tmpP);

    // Blob shadow: cancel the jump lift so it stays welded to the deck, then
    // shrink and fade with height so airborne state reads at a glance.
    const airT = Math.min(1, this.y / TUNING.cart.jumpHeight);
    const shadow = this.model.shadow;
    shadow.position.y = 0.02 - this.y;
    shadow.scale.set(1 - airT * 0.4, 1 - airT * 0.4, 1);
    shadow.material.opacity = 0.4 * (1 - airT * 0.55);

    // Lean spring
    this.leanVel += (-this.lean * 60 - this.leanVel * 9) * dt;
    this.lean += this.leanVel * dt;
    const leanClamped = Math.max(-TUNING.cart.leanMax, Math.min(TUNING.cart.leanMax, this.lean));

    if (!this.crashed) {
      this.model.root.rotation.z = -leanClamped;
      // landing / jump compression
      const squash = this.airborne
        ? 1 + Math.sin(Math.min(1, Math.max(0, this.jumpT)) * Math.PI) * 0.06
        : 1;
      this.model.hull.scale.set(1, squash, 1);
      // speed rattle
      const rattle = Math.min(1, this.speed / TUNING.speed.max) * 0.012;
      this.model.hull.position.y = Math.sin(this.dist * 7) * rattle;
    }

    if (!this.crashed) {
      if (this.speed > 0.2) {
        // The Blender wheel clip contains one revolution per second. Scale it
        // from linear velocity using the authored 0.3 m wheel radius.
        const turnsPerSecond = this.speed / (Math.PI * 0.6);
        playAssetClip(this.model.animationRoot, 'wheel_spin_loop', false, turnsPerSecond);
      } else {
        playAssetClip(this.model.animationRoot, 'idle_loop');
      }
      if (this.rinActionT > 0) this.rinActionT = Math.max(0, this.rinActionT - dt);
      else playAssetClip(this.rin.root, 'idle_cart');
    }
    updateAssetAnimation(this.model.animationRoot, dt);
    updateAssetAnimation(this.rin.root, dt);

    // Sunheart lantern pulse
    const lm = this.model.lantern.material;
    const lanternMaterial = Array.isArray(lm) ? lm[0] : lm;
    if (lanternMaterial instanceof THREE.MeshStandardMaterial) {
      lanternMaterial.emissiveIntensity = 2.0 + Math.sin(this.dist * 0.5) * 0.5;
    }
  }

  private playRinAction(name: string, duration: number, speed: number): void {
    this.rinActionT = duration;
    playAssetClip(this.rin.root, name, true, speed);
  }
}
