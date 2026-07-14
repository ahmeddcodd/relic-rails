// ---------------------------------------------------------------------------
// CartController — kinematic spline-follower with lane switching, authored
// jump arc, buffered inputs, minor-stumble and crash states, plus all
// procedural cart/Rin animation. No physics engine; the track is the truth.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING, type LaneIndex } from '../config/tuning';
import { buildCart, buildRin, type CartModel, type RinModel } from '../render/assets';
import type { TrackPath } from './track';

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

type BufferedAction = 'left' | 'right' | 'jump' | 'duck' | null;

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

  crashed = false;
  private crashT = 0;
  stumbleT = 0; // >0 during minor-hit recovery (also brief invulnerability)

  private buffered: BufferedAction = null;
  private bufferAge = 0;

  private wheelSpin = 0;
  private leanVel = 0;
  private lean = 0;

  constructor(private path: TrackPath, scene: THREE.Scene, private events: CartEvents) {
    this.model = buildCart();
    this.rin = buildRin();
    this.rin.root.position.set(0, 0.62, -0.25);
    this.root.add(this.model.root, this.rin.root);
    scene.add(this.root);
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
    this.stumbleT = 0;
    this.buffered = null;
    this.lean = 0;
    this.leanVel = 0;
    this.model.hull.rotation.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.model.root.position.set(0, 0, 0);
    this.model.shield.visible = false;
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
        this.events.onSwitch(dir as -1 | 1);
        return true;
      }
      case 'jump':
        if (this.airborne) return false;
        this.jumpT = 0;
        this.airborne = true;
        this.ducking = false;
        this.duckT = 0;
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
        return true;
    }
    return false;
  }

  startCrash(): void {
    this.crashed = true;
    this.crashT = 0;
  }

  stumble(): void {
    this.stumbleT = TUNING.speed.recoverTime;
    this.speed *= 1 - TUNING.speed.minorHitLoss;
    this.leanVel += (Math.random() > 0.5 ? 1 : -1) * 6;
  }

  get invulnerable(): boolean {
    return this.stumbleT > TUNING.speed.recoverTime - TUNING.speed.mercyTime;
  }

  update(dt: number): void {
    const c = TUNING.cart;

    if (this.crashed) {
      this.crashT += dt;
      this.speed = Math.max(0, this.speed - dt * 22);
      this.dist += this.speed * dt * 0.4;
      // spin + tip the hull
      this.model.root.rotation.z += dt * 7;
      this.model.root.rotation.x += dt * 3.5;
      this.model.root.position.y = Math.max(0, Math.sin(Math.min(1, this.crashT * 2.2) * Math.PI) * 1.1);
      this.applyTransform(dt);
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

    // Wheels
    this.wheelSpin += (this.speed / 0.3) * dt;
    for (const w of this.model.wheels) w.rotation.x = this.wheelSpin;

    // Sunheart lantern pulse
    const lm = this.model.lantern.material as THREE.MeshStandardMaterial;
    lm.emissiveIntensity = 2.0 + Math.sin(this.dist * 0.5) * 0.5;

    // Rin procedural animation
    const rin = this.rin;
    const duckCrouch = this.ducking ? 0.5 : 1;
    rin.torso.scale.y += (duckCrouch - rin.torso.scale.y) * Math.min(1, dt * 14);
    rin.torso.rotation.z = -leanClamped * 1.6;
    rin.torso.rotation.x = this.airborne ? -0.28 : Math.min(0.2, this.speed * 0.006);
    rin.head.rotation.x = this.airborne ? 0.2 : -0.05;
    const armLift = this.airborne ? -2.1 : -1.0;
    rin.armL.rotation.x += (armLift - rin.armL.rotation.x) * Math.min(1, dt * 10);
    rin.armR.rotation.x += (armLift - rin.armR.rotation.x) * Math.min(1, dt * 10);
    // scarf flutter
    rin.scarf.rotation.x = Math.sin(this.dist * 1.7) * 0.2 - this.speed * 0.012;
  }
}
