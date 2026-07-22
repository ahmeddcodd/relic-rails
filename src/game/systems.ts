// ---------------------------------------------------------------------------
// Score/combo, Overdrive, power-ups, and the Iron Maw chase-pressure system.
// Pure logic + one visual (the Maw) — unit-testable without a renderer.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import { buildMaw, playAssetClip, updateAssetAnimation, type MawModel } from '../render/assets';
import type { TrackPath } from './track';

export const COMBO_NAMES = ['Warm-up', 'Rolling', 'Blazing', 'Unstoppable', 'Railmaster'] as const;

export class ScoreSystem {
  score = 0;
  emberCount = 0;
  prismCount = 0;
  comboTier = 1; // 1..5
  private tierProgress = 0; // skill events toward next tier
  private decay = 0;
  distanceAccum = 0;
  perfects = 0;
  nearMisses = 0;
  bestComboTier = 1;

  /** external multipliers (overdrive, frenzy) */
  extraMult = 1;

  reset(): void {
    this.score = 0;
    this.emberCount = 0;
    this.prismCount = 0;
    this.comboTier = 1;
    this.tierProgress = 0;
    this.decay = 0;
    this.distanceAccum = 0;
    this.perfects = 0;
    this.nearMisses = 0;
    this.bestComboTier = 1;
    this.extraMult = 1;
  }

  get mult(): number {
    return this.comboTier * this.extraMult;
  }

  addDistance(metres: number): void {
    this.distanceAccum += metres * TUNING.score.perMetre;
    if (this.distanceAccum >= 10) {
      const whole = Math.floor(this.distanceAccum);
      this.score += whole; // distance is NOT combo-multiplied (skill play is)
      this.distanceAccum -= whole;
    }
  }

  private skillEvent(): void {
    this.decay = 0;
    this.tierProgress++;
    if (this.tierProgress >= TUNING.score.comboPerfectsPerTier && this.comboTier < 5) {
      this.comboTier++;
      this.tierProgress = 0;
      this.bestComboTier = Math.max(this.bestComboTier, this.comboTier);
    }
  }

  perfect(): number {
    this.perfects++;
    const pts = TUNING.score.perfect * this.mult;
    this.score += pts;
    this.skillEvent();
    return pts;
  }

  nearMiss(): number {
    this.nearMisses++;
    const pts = TUNING.score.nearMiss * this.mult;
    this.score += pts;
    this.skillEvent();
    return pts;
  }

  ember(): number {
    this.emberCount++;
    const pts = TUNING.score.ember * this.mult;
    this.score += pts;
    this.decay = Math.max(0, this.decay - 0.4);
    return pts;
  }

  prism(): number {
    this.prismCount++;
    const pts = TUNING.score.prism * this.mult;
    this.score += pts;
    this.skillEvent();
    return pts;
  }

  trailComplete(): number {
    const pts = TUNING.score.trailComplete * this.mult;
    this.score += pts;
    this.skillEvent();
    return pts;
  }

  airTime(sec: number): void {
    this.score += Math.round(TUNING.score.airTimePerSec * sec * this.mult);
  }

  minorHit(): void {
    this.comboTier = Math.max(1, this.comboTier - 1);
    this.tierProgress = 0;
  }

  majorHit(): void {
    this.comboTier = 1;
    this.tierProgress = 0;
  }

  update(dt: number): void {
    this.decay += dt;
    if (this.decay > TUNING.score.comboDecayTime) {
      this.decay = 0;
      if (this.comboTier > 1) this.comboTier--;
      this.tierProgress = 0;
    }
  }
}

// --- Overdrive -----------------------------------------------------------------
export class OverdriveSystem {
  meter = 0; // 0..1
  active = false;
  timeLeft = 0;

  reset(): void {
    this.meter = 0;
    this.active = false;
    this.timeLeft = 0;
  }

  fill(amount: number): void {
    if (this.active) return;
    this.meter = Math.min(1, this.meter + amount);
  }

  get ready(): boolean {
    return !this.active && this.meter >= 1;
  }

  tryActivate(): boolean {
    if (!this.ready) return false;
    this.active = true;
    this.timeLeft = TUNING.overdrive.duration;
    this.meter = 0;
    return true;
  }

  update(dt: number): boolean {
    // returns true on the frame overdrive expires
    if (!this.active) return false;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.active = false;
      this.timeLeft = 0;
      return true;
    }
    return false;
  }
}

// --- Power-ups -------------------------------------------------------------------
export class PowerUpSystem {
  magnetT = 0;
  ghostT = 0;
  frenzyT = 0;
  shield = false;

  reset(): void {
    this.magnetT = 0;
    this.ghostT = 0;
    this.frenzyT = 0;
    this.shield = false;
  }

  get magnet(): boolean {
    return this.magnetT > 0;
  }
  get ghost(): boolean {
    return this.ghostT > 0;
  }
  get frenzy(): boolean {
    return this.frenzyT > 0;
  }

  update(dt: number): void {
    if (this.magnetT > 0) this.magnetT -= dt;
    if (this.ghostT > 0) this.ghostT -= dt;
    if (this.frenzyT > 0) this.frenzyT -= dt;
  }
}

// --- Iron Maw chase ----------------------------------------------------------------
const tmpM = new THREE.Matrix4();
const tmpBehind = new THREE.Matrix4();

export class ChaseSystem {
  pressure: number = TUNING.chase.startPressure;
  maw: MawModel;
  private grindSpin = 0;

  constructor(private path: TrackPath, scene: THREE.Scene) {
    this.maw = buildMaw();
    this.maw.root.visible = false;
    scene.add(this.maw.root);
  }

  reset(): void {
    this.pressure = TUNING.chase.startPressure;
    this.maw.root.visible = false;
    playAssetClip(this.maw.root, 'chase_loop', true);
  }

  addPressure(x: number): void {
    this.pressure = Math.min(TUNING.chase.catchThreshold, this.pressure + x);
  }

  relievePressure(x: number): void {
    this.pressure = Math.max(0, this.pressure - x);
  }

  get caught(): boolean {
    return this.pressure >= TUNING.chase.catchThreshold;
  }

  /** 0..1 how loud/close the Maw feels (for audio + vignette). */
  get intensity(): number {
    return this.pressure;
  }

  update(dt: number, cartDist: number, crashing: boolean): void {
    if (!crashing) {
      this.pressure = Math.max(0, this.pressure - TUNING.chase.decayPerSec * dt);
    }
    const c = TUNING.chase;
    const show = this.pressure > c.visibleFrom || crashing;
    this.maw.root.visible = show;
    if (!show) return;

    // Keep the full-scale guardian behind the dedicated crash camera. At the
    // old 8 m offset it could intersect a camera sitting 7.2 m behind the cart.
    const behind = crashing ? 13.5 : 26 - this.pressure * 21;
    const d = cartDist - behind;
    if (d >= 0) {
      this.path.getBasis(d, 0, tmpM);
    } else {
      // Extrapolate behind the first track basis instead of clamping the full
      // scale guardian beside the opening camera.
      this.path.getBasis(0, 0, tmpM);
      tmpM.multiply(tmpBehind.makeTranslation(0, 0, d));
    }
    this.maw.root.matrixAutoUpdate = false;
    this.maw.root.matrix.copy(tmpM);

    this.grindSpin += dt * (4 + this.pressure * 9);
    playAssetClip(this.maw.root, crashing ? 'catch' : 'chase_loop', false, 1 + this.pressure * 0.8);
    updateAssetAnimation(this.maw.root, dt);
    const eyeGlow = 2.2 + Math.sin(this.grindSpin * 2) * 0.8 + this.pressure * 2;
    for (const e of this.maw.eyes) {
      const material = Array.isArray(e.material) ? e.material[0] : e.material;
      if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = eyeGlow;
    }
  }
}
