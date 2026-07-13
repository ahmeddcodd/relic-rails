// ---------------------------------------------------------------------------
// Spring third-person chase camera. Cart sits in the lower third; the track
// curve is telegraphed because the camera looks ahead along the path.
// Frame-rate independent smoothing; portrait aspect compensation.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import type { TrackPath } from './track';
import type { CartController } from './cart';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class CameraRig {
  private pos = new THREE.Vector3(0, 5, -8);
  private look = new THREE.Vector3(0, 0, 10);
  private lateral = 0;
  private shake = 0;
  private fovCur = TUNING.camera.baseFov;
  fovBonus = 0; // overdrive kick
  reducedShake = false;

  constructor(private cam: THREE.PerspectiveCamera, private path: TrackPath) {}

  snap(cart: CartController): void {
    const c = TUNING.camera;
    this.lateral = cart.lateral * 0.5;
    this.path.getPoint(Math.max(0, cart.dist - c.back), this.lateral, this.pos);
    this.pos.y += c.height;
    this.path.getPoint(cart.dist + c.lookAhead, cart.lateral * 0.4, this.look);
    this.apply(0);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + (this.reducedShake ? amount * 0.35 : amount));
  }

  update(dt: number, cart: CartController, chasePressure: number): void {
    const c = TUNING.camera;
    const k = 1 - Math.exp(-c.posLerp * dt);
    const kl = 1 - Math.exp(-c.lateralLag * dt);

    this.lateral += (cart.lateral * 0.55 - this.lateral) * kl;
    this.path.getPoint(Math.max(0, cart.dist - c.back), this.lateral, tmpA);
    tmpA.y += c.height + cart.y * 0.35;
    this.pos.lerp(tmpA, k);

    this.path.getPoint(cart.dist + c.lookAhead, cart.lateral * 0.4, tmpB);
    tmpB.y += 1.2 + cart.y * 0.5;
    this.look.lerp(tmpB, 1 - Math.exp(-9 * dt));

    // FOV: speed + overdrive
    const fovT =
      c.baseFov + Math.max(0, cart.speed - TUNING.speed.start) * c.fovPerSpeed + this.fovBonus;
    this.fovCur += (fovT - this.fovCur) * Math.min(1, dt * 4);

    // Chase rumble
    if (chasePressure > 0.55 && !this.reducedShake) {
      this.shake = Math.max(this.shake, (chasePressure - 0.55) * 0.18);
    }
    this.shake = Math.max(0, this.shake - dt * TUNING.camera.shakeDecay * this.shake - dt * 0.02);

    this.apply(dt);
  }

  private apply(_dt: number): void {
    this.cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    this.cam.lookAt(this.look);
    // Portrait compensation: keep horizontal view usable when tall+narrow.
    const aspect = this.cam.aspect;
    const fov = aspect < 0.9 ? this.fovCur + (0.9 - aspect) * 34 : this.fovCur;
    if (Math.abs(this.cam.fov - fov) > 0.1) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
