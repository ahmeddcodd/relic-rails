// ---------------------------------------------------------------------------
// Obstacles + collectibles + power-up pickups. Meshes are pooled; shards are
// two InstancedMeshes. All world transforms derive from the TrackPath.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING, type LaneIndex } from '../config/tuning';
import { COLORS } from '../render/palette';
import {
  GEO,
  mat,
  buildBlockerCart,
  buildBrokenRail,
  buildLowBeam,
  buildGate,
  buildRockPile,
  buildOncomingCart,
  buildFireJet,
  buildCrystalSpikes,
  buildDebris,
  buildPowerup,
} from '../render/assets';
import type { TrackPath } from './track';

export type ObstacleType =
  | 'blocker'
  | 'gap'
  | 'beam'
  | 'gate'
  | 'rocks'
  | 'oncoming'
  | 'fire'
  | 'spikes'
  | 'debris';

export type RequiredAction = 'switch' | 'jump' | 'duck' | 'none';

export interface ObstacleSpec {
  action: RequiredAction;
  major: boolean;
  halfLen: number;
  /** Cart must be at least this high to clear (jump obstacles). */
  clearHeight: number;
  build: () => THREE.Group;
}

// clearHeight = cart height (m) needed to pass a jump obstacle. Kept generous
// so a slightly-early or slightly-late swipe still clears — jumps feel reliable.
export const OBSTACLE_SPECS: Record<ObstacleType, ObstacleSpec> = {
  blocker: { action: 'switch', major: true, halfLen: 1.1, clearHeight: 99, build: buildBlockerCart },
  gap: { action: 'jump', major: true, halfLen: 1.6, clearHeight: 0.55, build: buildBrokenRail },
  beam: { action: 'duck', major: true, halfLen: 0.5, clearHeight: 99, build: buildLowBeam },
  gate: { action: 'duck', major: true, halfLen: 0.5, clearHeight: 99, build: buildGate },
  rocks: { action: 'jump', major: true, halfLen: 0.9, clearHeight: 0.9, build: buildRockPile },
  oncoming: { action: 'switch', major: true, halfLen: 1.2, clearHeight: 99, build: buildOncomingCart },
  fire: { action: 'switch', major: true, halfLen: 0.8, clearHeight: 99, build: buildFireJet },
  spikes: { action: 'jump', major: true, halfLen: 0.9, clearHeight: 1.0, build: buildCrystalSpikes },
  debris: { action: 'none', major: false, halfLen: 0.6, clearHeight: 0.55, build: buildDebris },
};

export interface Obstacle {
  type: ObstacleType;
  dist: number;
  lane: LaneIndex;
  mesh: THREE.Group | null;
  resolved: boolean; // hit or passed (scored)
  warned: boolean; // telegraph (horn etc.) already fired
  moveSpeed: number; // oncoming carts move toward the player
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const FLIP_Y = new THREE.Matrix4().makeRotationY(Math.PI);

const ACTIVATE_AHEAD = 170;
const RELEASE_BEHIND = 14;

export class ObstacleManager {
  list: Obstacle[] = [];
  private pools = new Map<ObstacleType, THREE.Group[]>();
  private root = new THREE.Group();
  private animT = 0;

  constructor(private path: TrackPath, scene: THREE.Scene) {
    scene.add(this.root);
  }

  add(type: ObstacleType, dist: number, lane: LaneIndex): void {
    this.list.push({
      type,
      dist,
      lane,
      mesh: null,
      resolved: false,
      warned: false,
      moveSpeed: type === 'oncoming' ? 7 : 0,
    });
  }

  reset(): void {
    for (const o of this.list) this.release(o);
    this.list.length = 0;
  }

  private acquire(type: ObstacleType): THREE.Group {
    const pool = this.pools.get(type) ?? [];
    this.pools.set(type, pool);
    let g = pool.pop();
    if (!g) {
      g = OBSTACLE_SPECS[type].build();
      this.root.add(g);
    }
    g.visible = true;
    return g;
  }

  private release(o: Obstacle): void {
    if (!o.mesh) return;
    o.mesh.visible = false;
    this.pools.get(o.type)!.push(o.mesh);
    o.mesh = null;
  }

  update(dt: number, cartDist: number): void {
    this.animT += dt;
    const flamePulse = 1 + Math.sin(this.animT * 11) * 0.18;
    let w = 0;
    for (let r = 0; r < this.list.length; r++) {
      const o = this.list[r];
      // Oncoming carts advance toward the player.
      if (o.moveSpeed > 0 && o.dist - cartDist < 120) o.dist -= o.moveSpeed * dt;

      if (o.dist < cartDist - RELEASE_BEHIND) {
        this.release(o);
        continue; // drop from list
      }
      this.list[w++] = o;

      const shouldShow = o.dist < cartDist + ACTIVATE_AHEAD;
      if (shouldShow && !o.mesh) {
        o.mesh = this.acquire(o.type);
        this.place(o);
      } else if (o.mesh && (o.moveSpeed > 0 || o.type === 'fire')) {
        if (o.moveSpeed > 0) this.place(o);
        const flame = o.mesh.getObjectByName('flame');
        if (flame) flame.scale.setScalar(flamePulse);
      }
    }
    this.list.length = w;
  }

  private place(o: Obstacle): void {
    if (!o.mesh) return;
    this.path.getBasis(o.dist, TUNING.track.laneOffsets[o.lane], tmpM);
    o.mesh.matrixAutoUpdate = false;
    o.mesh.matrix.copy(tmpM);
    if (o.type === 'oncoming') o.mesh.matrix.multiply(FLIP_Y); // face the player
  }
}

// --- Collectibles ------------------------------------------------------------------
const EMBER_CAP = 400;
const PRISM_CAP = 48;

interface ShardStore {
  dist: Float32Array;
  lane: Float32Array; // lateral offset (metres), not index — allows curved trails
  y: Float32Array;
  state: Uint8Array; // 0 empty, 1 active, 2 collected
  trail: Int16Array;
  head: number;
  tail: number;
}

function makeStore(cap: number): ShardStore {
  return {
    dist: new Float32Array(cap),
    lane: new Float32Array(cap),
    y: new Float32Array(cap),
    state: new Uint8Array(cap),
    trail: new Int16Array(cap),
    head: 0,
    tail: 0,
  };
}

export type PowerupKind = 'magnet' | 'shield' | 'ghost' | 'frenzy' | 'repair';

function hideAllInstances(mesh: THREE.InstancedMesh): void {
  tmpM.makeScale(0, 0, 0);
  for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, tmpM);
  mesh.instanceMatrix.needsUpdate = true;
}

interface PowerupPickup {
  kind: PowerupKind;
  dist: number;
  lane: LaneIndex;
  mesh: THREE.Group | null;
  taken: boolean;
}

export interface CollectCallbacks {
  onEmber(pos: THREE.Vector3, trailDone: boolean): void;
  onPrism(pos: THREE.Vector3): void;
  onPowerup(kind: PowerupKind, pos: THREE.Vector3): void;
}

export class CollectibleManager {
  private embers = makeStore(EMBER_CAP);
  private prisms = makeStore(PRISM_CAP);
  private emberMesh: THREE.InstancedMesh;
  private prismMesh: THREE.InstancedMesh;
  private powerups: PowerupPickup[] = [];
  private puPool = new Map<PowerupKind, THREE.Group[]>();
  private root = new THREE.Group();
  private trailTotals = new Map<number, number>();
  private trailLeft = new Map<number, number>();
  private nextTrailId = 1;
  private spin = 0;

  constructor(private path: TrackPath, scene: THREE.Scene) {
    scene.add(this.root);
    this.emberMesh = new THREE.InstancedMesh(
      GEO.octa(0.3),
      mat(COLORS.ember, { emissive: 0xd97810, emissiveIntensity: 0.85, rough: 0.3, metal: 0.2 }),
      EMBER_CAP,
    );
    this.prismMesh = new THREE.InstancedMesh(
      GEO.ico(0.5, 0),
      mat(COLORS.prism, { emissive: 0x8a34d8, emissiveIntensity: 1.0, rough: 0.2 }),
      PRISM_CAP,
    );
    this.emberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.prismMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.emberMesh.frustumCulled = false;
    this.prismMesh.frustumCulled = false;
    hideAllInstances(this.emberMesh);
    hideAllInstances(this.prismMesh);
    this.root.add(this.emberMesh, this.prismMesh);
  }

  reset(): void {
    this.embers.state.fill(0);
    this.prisms.state.fill(0);
    this.embers.head = this.embers.tail = 0;
    this.prisms.head = this.prisms.tail = 0;
    this.trailTotals.clear();
    this.trailLeft.clear();
    for (const p of this.powerups) this.releasePu(p);
    this.powerups.length = 0;
    hideAllInstances(this.emberMesh);
    hideAllInstances(this.prismMesh);
  }

  newTrailId(): number {
    return this.nextTrailId++;
  }

  addEmber(dist: number, lateral: number, y: number, trailId: number): void {
    const s = this.embers;
    const i = s.head % EMBER_CAP;
    if (s.state[i] === 1) return; // ring full — skip (never happens in practice)
    s.dist[i] = dist;
    s.lane[i] = lateral;
    s.y[i] = y;
    s.state[i] = 1;
    s.trail[i] = trailId;
    s.head++;
    this.trailTotals.set(trailId, (this.trailTotals.get(trailId) ?? 0) + 1);
    this.trailLeft.set(trailId, (this.trailLeft.get(trailId) ?? 0) + 1);
  }

  addPrism(dist: number, lateral: number, y: number): void {
    const s = this.prisms;
    const i = s.head % PRISM_CAP;
    if (s.state[i] === 1) return;
    s.dist[i] = dist;
    s.lane[i] = lateral;
    s.y[i] = y;
    s.state[i] = 1;
    s.head++;
  }

  addPowerup(kind: PowerupKind, dist: number, lane: LaneIndex): void {
    this.powerups.push({ kind, dist, lane, mesh: null, taken: false });
  }

  private releasePu(p: PowerupPickup): void {
    if (!p.mesh) return;
    p.mesh.visible = false;
    const pool = this.puPool.get(p.kind) ?? [];
    this.puPool.set(p.kind, pool);
    pool.push(p.mesh);
    p.mesh = null;
  }

  update(
    dt: number,
    cartDist: number,
    cartLateral: number,
    cartY: number,
    magnetActive: boolean,
    cb: CollectCallbacks,
  ): void {
    this.spin += dt * 2.6;
    this.updateStore(this.embers, this.emberMesh, EMBER_CAP, cartDist, cartLateral, cartY, magnetActive, cb, true);
    this.updateStore(this.prisms, this.prismMesh, PRISM_CAP, cartDist, cartLateral, cartY, magnetActive, cb, false);

    // Power-ups
    let w = 0;
    for (let r = 0; r < this.powerups.length; r++) {
      const p = this.powerups[r];
      if (p.taken || p.dist < cartDist - RELEASE_BEHIND) {
        this.releasePu(p);
        continue;
      }
      this.powerups[w++] = p;
      if (!p.mesh && p.dist < cartDist + ACTIVATE_AHEAD) {
        const pool = this.puPool.get(p.kind) ?? [];
        this.puPool.set(p.kind, pool);
        p.mesh = pool.pop() ?? buildPowerup(p.kind);
        if (!p.mesh.parent) this.root.add(p.mesh);
        p.mesh.visible = true;
        this.path.getBasis(p.dist, TUNING.track.laneOffsets[p.lane], tmpM);
        p.mesh.matrixAutoUpdate = false;
        p.mesh.matrix.copy(tmpM);
      }
      if (p.mesh) {
        const ring = p.mesh.getObjectByName('ring');
        const core = p.mesh.getObjectByName('core');
        if (ring) {
          ring.rotation.y = this.spin;
          ring.updateMatrix();
        }
        if (core) {
          core.rotation.y = -this.spin * 1.4;
          core.position.y = 1.0 + Math.sin(this.spin * 1.7) * 0.12;
          core.updateMatrix();
        }
        // pickup check
        const dd = Math.abs(p.dist - cartDist);
        if (dd < TUNING.collision.pickupRadius && Math.abs(TUNING.track.laneOffsets[p.lane] - cartLateral) < 1.3 && cartY < 1.6) {
          p.taken = true;
          this.path.getPoint(p.dist, TUNING.track.laneOffsets[p.lane], tmpV);
          tmpV.y += 1;
          cb.onPowerup(p.kind, tmpV);
        }
      }
    }
    this.powerups.length = w;
  }

  private updateStore(
    s: ShardStore,
    mesh: THREE.InstancedMesh,
    cap: number,
    cartDist: number,
    cartLateral: number,
    cartY: number,
    magnet: boolean,
    cb: CollectCallbacks,
    isEmber: boolean,
  ): void {
    const pickR = TUNING.collision.pickupRadius;
    const magR = TUNING.collision.magnetRadius;
    for (let i = 0; i < cap; i++) {
      if (s.state[i] !== 1) {
        tmpM.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, tmpM);
        continue;
      }
      const d = s.dist[i];
      if (d < cartDist - RELEASE_BEHIND) {
        s.state[i] = 0;
        tmpM.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, tmpM);
        continue;
      }
      if (d > cartDist + ACTIVATE_AHEAD) {
        tmpM.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, tmpM);
        continue;
      }
      let lat = s.lane[i];
      let y = s.y[i] + 0.9 + Math.sin(this.spin * 1.4 + d * 0.7) * 0.09;
      const dd = d - cartDist;
      // Magnet pull: slide shards toward the cart when close
      if (magnet && Math.abs(dd) < magR) {
        const pull = 1 - Math.abs(dd) / magR;
        lat += (cartLateral - lat) * pull * 0.85;
        y += (cartY + 0.9 - y) * pull * 0.6;
      }
      // Collect?
      if (Math.abs(dd) < pickR && Math.abs(lat - cartLateral) < (magnet ? 2.2 : 1.15) && Math.abs(y - (cartY + 0.9)) < TUNING.collision.pickupYRadius) {
        s.state[i] = 2;
        this.path.getPoint(d, lat, tmpV);
        tmpV.y += y;
        if (isEmber) {
          const t = s.trail[i];
          const left = (this.trailLeft.get(t) ?? 1) - 1;
          this.trailLeft.set(t, left);
          cb.onEmber(tmpV, left === 0 && (this.trailTotals.get(t) ?? 0) >= 5);
        } else {
          cb.onPrism(tmpV);
        }
        tmpM.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, tmpM);
        continue;
      }
      this.path.getPoint(d, lat, tmpV);
      this.path.getDir(d, tmpV2);
      tmpM.makeRotationY(Math.atan2(tmpV2.x, tmpV2.z) + this.spin);
      const sc = isEmber ? 1 : 1 + Math.sin(this.spin * 2 + d) * 0.12;
      if (sc !== 1) tmpM.scale(tmpV2.set(sc, sc, sc));
      tmpM.setPosition(tmpV.x, tmpV.y + y, tmpV.z);
      mesh.setMatrixAt(i, tmpM);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
