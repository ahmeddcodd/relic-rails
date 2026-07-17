// ---------------------------------------------------------------------------
// Track path + visuals.
//
// TrackPath: uniform arc-length samples (1 m) in a ring buffer. Modules
// (length / total curve / slope delta) are pushed by the DifficultyDirector
// and consumed by the generator walk. Evaluation is O(1) by index.
//
// TrackView: pooled visual chunks (32 m each). Per chunk: eight instanced,
// four-metre Blender platform modules (track + walls + mountains), one
// instanced glow mesh, plus pooled authored GLB biome props.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import { Rand } from '../core/rand';
import { BIOMES } from '../render/palette';
import {
  GEO,
  buildEnvironmentAsset,
  buildInstancedAsset,
  updateAssetAnimation,
  type AssetId,
  type EnvironmentAssetId,
  type InstancedAsset,
} from '../render/assets';

const STEP = TUNING.track.sampleStep;
const CAP = TUNING.track.sampleCap;
const CHUNK = TUNING.track.chunkLen;

export interface TrackModule {
  len: number; // metres
  curve: number; // total heading change over the module (radians)
  slope: number; // total grade change over the module (dy per metre delta)
}

export class TrackPath {
  private px = new Float32Array(CAP);
  private py = new Float32Array(CAP);
  private pz = new Float32Array(CAP);
  private dx = new Float32Array(CAP);
  private dz = new Float32Array(CAP);
  private head = 0; // number of samples generated so far
  private queue: TrackModule[] = [];
  // generator walk state
  private gx = 0;
  private gy = 0;
  private gz = 0;
  private heading = 0;
  private grade = 0;
  private moduleLeft = 0;
  private curvePerM = 0;
  private slopePerM = 0;

  constructor() {
    this.writeSample(); // sample 0 at origin, heading +Z
  }

  /** Full reset for a new run — reuses all buffers. */
  reset(): void {
    this.head = 0;
    this.queue.length = 0;
    this.gx = 0;
    this.gy = 0;
    this.gz = 0;
    this.heading = 0;
    this.grade = 0;
    this.moduleLeft = 0;
    this.curvePerM = 0;
    this.slopePerM = 0;
    this.writeSample();
  }

  get headDist(): number {
    return (this.head - 1) * STEP;
  }

  queuedLength(): number {
    let q = this.moduleLeft;
    for (const m of this.queue) q += m.len;
    return q;
  }

  pushModule(m: TrackModule): void {
    this.queue.push(m);
  }

  private writeSample(): void {
    const i = this.head % CAP;
    this.px[i] = this.gx;
    this.py[i] = this.gy;
    this.pz[i] = this.gz;
    this.dx[i] = Math.sin(this.heading);
    this.dz[i] = Math.cos(this.heading);
    this.head++;
  }

  /** Generate samples until dist is covered (or module queue runs dry). */
  ensure(dist: number): void {
    while (this.headDist < dist) {
      if (this.moduleLeft <= 0) {
        const m = this.queue.shift();
        if (!m) return; // director must top up
        this.moduleLeft = m.len;
        this.curvePerM = m.curve / m.len;
        this.slopePerM = m.slope / m.len;
      }
      this.heading += this.curvePerM * STEP;
      this.grade = Math.max(-0.14, Math.min(0.14, this.grade + this.slopePerM * STEP));
      this.gx += Math.sin(this.heading) * STEP;
      this.gz += Math.cos(this.heading) * STEP;
      this.gy += this.grade * STEP;
      this.moduleLeft -= STEP;
      this.writeSample();
    }
  }

  /** World position at distance + lateral offset (right = positive). */
  getPoint(dist: number, lateral: number, out: THREE.Vector3): THREE.Vector3 {
    const f = Math.max(0, Math.min(dist / STEP, this.head - 1.001));
    const i0 = Math.floor(f);
    const t = f - i0;
    const a = i0 % CAP;
    const b = (i0 + 1) % CAP;
    const dxv = this.dx[a] + (this.dx[b] - this.dx[a]) * t;
    const dzv = this.dz[a] + (this.dz[b] - this.dz[a]) * t;
    out.set(
      this.px[a] + (this.px[b] - this.px[a]) * t - dzv * lateral,
      this.py[a] + (this.py[b] - this.py[a]) * t,
      this.pz[a] + (this.pz[b] - this.pz[a]) * t + dxv * lateral,
    );
    return out;
  }

  /** Horizontal forward direction at distance. */
  getDir(dist: number, out: THREE.Vector3): THREE.Vector3 {
    const f = Math.max(0, Math.min(dist / STEP, this.head - 1.001));
    const i0 = Math.floor(f);
    const t = f - i0;
    const a = i0 % CAP;
    const b = (i0 + 1) % CAP;
    out.set(this.dx[a] + (this.dx[b] - this.dx[a]) * t, 0, this.dz[a] + (this.dz[b] - this.dz[a]) * t);
    return out.normalize();
  }

  /** Grade (slope) at distance, dy per metre. */
  getGrade(dist: number): number {
    const f = Math.max(1, Math.min(dist / STEP, this.head - 1.001));
    const i0 = Math.floor(f);
    const a = (i0 - 1) % CAP;
    const b = i0 % CAP;
    return (this.py[b] - this.py[a]) / STEP;
  }

  /** Grade-aware basis matrix (right/up/forward) at dist, position included. */
  getBasis(dist: number, lateral: number, outM: THREE.Matrix4, v = tmpV1, d = tmpV2): void {
    this.getPoint(dist, lateral, v);
    this.getDir(dist, d);
    d.y = this.getGrade(dist);
    d.normalize();
    tmpR.crossVectors(d, UP).normalize(); // right = forward x world-up
    tmpU.crossVectors(tmpR, d).normalize();
    outM.makeBasis(tmpR, tmpU, d);
    outM.setPosition(v);
  }
}

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

// --- Blender platform module contract ----------------------------------------
const PLATFORM_MODULE_LENGTH = 4;

// Ring cross-sections (lateral, height) — tunnel vs open gorge.
interface GlowSlot {
  x: number; y: number; z: number; s: number; color: number;
}

type PlatformAssetId = Extract<
  AssetId,
  | 'crystal_cavern_platform'
  | 'timber_mine_platform'
  | 'flooded_ravine_platform'
  | 'ember_forge_platform'
>;

const MODULES_PER_CHUNK = CHUNK / PLATFORM_MODULE_LENGTH;
const PLATFORM_BY_BIOME: readonly PlatformAssetId[] = [
  'crystal_cavern_platform',
  'timber_mine_platform',
  'flooded_ravine_platform',
  'ember_forge_platform',
];

// --- Visual chunk --------------------------------------------------------------
class Chunk {
  group = new THREE.Group();
  platforms = new Map<PlatformAssetId, InstancedAsset>();
  glows: THREE.InstancedMesh;
  props: PlacedProp[] = [];
  index = -1;

  constructor() {
    for (const id of PLATFORM_BY_BIOME) {
      const platform = buildInstancedAsset(id, MODULES_PER_CHUNK);
      platform.root.visible = false;
      this.platforms.set(id, platform);
      this.group.add(platform.root);
    }
    this.glows = new THREE.InstancedMesh(GEO.octa(1), glowMaterial(), 14);
    // Instances live in world space far from the mesh origin — the default
    // origin-centred bounding sphere would cull them once the run moves on.
    this.glows.frustumCulled = false;

    this.group.add(this.glows);
    this.group.visible = false;
  }
}

interface PlacedProp {
  id: EnvironmentAssetId;
  object: THREE.Group;
}

let _glowMat: THREE.MeshBasicMaterial | null = null;
function glowMaterial(): THREE.MeshBasicMaterial {
  if (!_glowMat) _glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  return _glowMat;
}

export class TrackView {
  private chunks: Chunk[] = [];
  private built = new Map<number, Chunk>();
  private propPools = new Map<EnvironmentAssetId, THREE.Group[]>();

  constructor(
    private path: TrackPath,
    scene: THREE.Scene,
    private biomeAt: (dist: number) => number,
    private quality: 'high' | 'medium' | 'low',
  ) {
    const n = TUNING.track.drawAheadChunks + TUNING.track.drawBehindChunks + 2;
    for (let i = 0; i < n; i++) {
      const c = new Chunk();
      this.chunks.push(c);
      scene.add(c.group);
    }
  }

  /** Reset all chunks (new run). */
  reset(): void {
    this.built.clear();
    for (const c of this.chunks) {
      this.releaseProps(c);
      c.index = -1;
      c.group.visible = false;
    }
  }

  update(cartDist: number, dt = 0): void {
    const cur = Math.floor(cartDist / CHUNK);
    const lo = cur - TUNING.track.drawBehindChunks;
    const hi = cur + TUNING.track.drawAheadChunks;
    // Release chunks out of window
    for (const [idx, c] of this.built) {
      if (idx < lo || idx > hi) {
        this.built.delete(idx);
        this.releaseProps(c);
        c.index = -1;
        c.group.visible = false;
      }
    }
    // Build missing
    for (let idx = Math.max(0, lo); idx <= hi; idx++) {
      if (this.built.has(idx)) continue;
      if ((idx + 1) * CHUNK > this.path.headDist) break; // not generated yet
      const c = this.chunks.find((k) => k.index === -1);
      if (!c) break;
      this.buildChunk(c, idx);
      this.built.set(idx, c);
    }
    if (dt > 0) {
      for (const c of this.built.values()) {
        for (const prop of c.props) updateAssetAnimation(prop.object, dt);
      }
    }
  }

  private buildChunk(c: Chunk, idx: number): void {
    c.index = idx;
    const start = idx * CHUNK;
    const biomeIndex = this.biomeAt(start + CHUNK / 2);
    const biome = BIOMES[biomeIndex];
    const rand = new Rand(idx * 7919 + 13);

    // The complete visible platform is authored in Blender. Each four-metre
    // module is instanced onto a grade-aware track basis, so track, bed, walls,
    // mountains, and ceiling remain aligned through curves and slopes.
    for (const platform of c.platforms.values()) platform.root.visible = false;
    const platform = c.platforms.get(PLATFORM_BY_BIOME[biomeIndex]);
    if (!platform) throw new Error(`Missing Blender platform for biome ${biomeIndex}`);
    platform.root.visible = true;
    for (let moduleIndex = 0; moduleIndex < MODULES_PER_CHUNK; moduleIndex++) {
      const dist = start + (moduleIndex + 0.5) * PLATFORM_MODULE_LENGTH;
      this.path.getBasis(dist, 0, tmpM);
      tmpPlatformM.copy(tmpM);
      if ((idx * MODULES_PER_CHUNK + moduleIndex) % 2 === 1) {
        tmpPlatformM.multiply(tmpHalfTurn);
      }
      for (let partIndex = 0; partIndex < platform.meshes.length; partIndex++) {
        tmpInstanceM.multiplyMatrices(tmpPlatformM, platform.relativeMatrices[partIndex]);
        platform.meshes[partIndex].setMatrixAt(moduleIndex, tmpInstanceM);
      }
    }
    for (const mesh of platform.meshes) mesh.instanceMatrix.needsUpdate = true;

    // Biome props + glows. On tight curves, skip wide cross-track props —
    // a straight beam through curved space pokes through the walls.
    this.path.getDir(start, tmpV1);
    this.path.getDir(start + CHUNK, tmpV2);
    const curvy = tmpV1.dot(tmpV2) < 0.965;
    const glows: GlowSlot[] = [];
    this.addProps(c, glows, start, biome.name, rand, curvy);

    let gi = 0;
    const maxGlow = this.quality === 'low' ? 8 : 14;
    for (const g of glows) {
      if (gi >= Math.min(c.glows.count, maxGlow)) break;
      tmpM2.makeScale(g.s, g.s * 1.4, g.s);
      tmpM2.setPosition(g.x, g.y, g.z);
      c.glows.setMatrixAt(gi, tmpM2);
      c.glows.setColorAt(gi, tmpC.setHex(g.color));
      gi++;
    }
    for (let k = gi; k < c.glows.count; k++) c.glows.setMatrixAt(k, tmpM2.makeScale(0, 0, 0));
    c.glows.instanceMatrix.needsUpdate = true;
    if (c.glows.instanceColor) c.glows.instanceColor.needsUpdate = true;

    c.group.visible = true;
  }

  private addProps(
    chunk: Chunk,
    glows: GlowSlot[],
    start: number,
    biomeName: string,
    rand: Rand,
    curvy: boolean,
  ): void {
    const dense = this.quality !== 'low';
    const glowAt = (d: number, lat: number, h: number, s: number, color: number): void => {
      this.path.getPoint(d, lat, tmpV1);
      glows.push({ x: tmpV1.x, y: tmpV1.y + h, z: tmpV1.z, s, color });
    };

    if (biomeName === 'Timber Maw Mine') {
      const arches: EnvironmentAssetId[] = [
        'timber_support_arch',
        'timber_support_arch_b',
        'timber_support_arch_c',
      ];
      for (const [i, off] of [8, 24].entries()) {
        const variant = curvy ? arches[i] : arches[Math.floor(rand.next() * arches.length)];
        this.placeProp(chunk, variant, start + off, 0, 0, variant === 'timber_support_arch_c' ? 0.82 : 1);
      }
      for (const off of [4, 20]) {
        const side = rand.chance(0.5) ? -1 : 1;
        this.placeProp(chunk, 'torch_sconce', start + off, side * 7.15, 1.3, 1, side * Math.PI * 0.5);
        glowAt(start + off, side * 7.0, 2.25, 0.24, 0xffa030);
      }
      if (dense && rand.chance(0.65)) {
        const side = rand.chance(0.5) ? -1 : 1;
        this.placeProp(chunk, 'rock_wall_cluster', start + rand.range(6, 26), side * 7.2, 0, 0.72, rand.range(-0.5, 0.5));
      }
    } else if (biomeName === 'Flooded Ravine') {
      // Cliff rocks + trees on the banks
      for (let k = 0; k < (dense ? 3 : 2); k++) {
        const d = start + rand.range(2, 30);
        const side = rand.chance(0.5) ? -1 : 1;
        const lat = side * rand.range(8.5, 12);
        this.placeProp(chunk, 'rock_wall_cluster', d, lat, 0, rand.range(0.75, 1.15), rand.range(-0.8, 0.8));
        if (rand.chance(0.55)) {
          this.placeProp(chunk, 'ravine_tree', d + rand.range(-1.2, 1.2), lat - side * 1.2, 0, rand.range(0.85, 1.2));
        }
      }
      if (dense && rand.chance(0.45)) {
        const side = rand.chance(0.5) ? -1 : 1;
        this.placeProp(chunk, 'waterfall_frame', start + rand.range(8, 25), side * 9.5, 0, 1.25);
      }
      // (No floating sky motes here — a glowing octahedron over the track reads
      // as an unreachable shard. Atmosphere comes from the cliffs/trees instead.)
    } else if (biomeName === 'Crystal Hollow') {
      // Crystal clusters — the glow instances ARE the crystals
      const n = dense ? 7 : 5;
      for (let k = 0; k < n; k++) {
        const d = start + rand.range(1, 31);
        const side = rand.chance(0.5) ? -1 : 1;
        const lat = side * rand.range(5.8, 7.2);
        const large = k < 2 && dense;
        this.placeProp(
          chunk,
          large ? 'crystal_cluster_large' : 'crystal_cluster_small',
          d,
          lat,
          0,
          rand.range(0.8, 1.15),
          rand.range(-Math.PI, Math.PI),
        );
        glowAt(d, lat, large ? 1.35 : 0.8, large ? 0.85 : 0.5, rand.chance(0.6) ? 0x2cd8d0 : 0x9a54e8);
      }
      const side = rand.chance(0.5) ? -1 : 1;
      this.placeProp(chunk, 'rock_wall_cluster', start + rand.range(4, 28), side * 7.7, 0, 0.8);
      // (No over-track floating motes — same shard-lookalike confusion; the
      // wall crystals above provide the cavern glow.)
    } else {
      // Ember Forge: pipes, ducts, vents, warning lamps
      for (const off of [6, 22]) {
        const side = rand.chance(0.5) ? -1 : 1;
        this.placeProp(chunk, 'forge_pipe', start + off, side * 7.1, 0, rand.range(0.9, 1.15), side * Math.PI * 0.5);
        glowAt(start + off, side * 7.2, 1.0, 0.3, 0xff4a10);
      }
      if (dense) {
        const side = rand.chance(0.5) ? -1 : 1;
        this.placeProp(chunk, 'forge_gear', start + 14, side * 7.2, 0.4, rand.range(0.9, 1.2));
      }
      // Warning lamps
      glowAt(start + rand.range(2, 30), rand.chance(0.5) ? -6.9 : 6.9, 3.2, 0.14, 0xff2418);
      // Magma pools at ground edges
      if (rand.chance(0.7)) {
        const d = start + rand.range(4, 28);
        const side = rand.chance(0.5) ? -1 : 1;
        glowAt(d, side * rand.range(5.2, 6.3), -0.4, 0.8, 0xff6a14);
      }
    }

    const ballastCount = dense ? 2 : 1;
    for (let i = 0; i < ballastCount; i++) {
      const side = rand.chance(0.5) ? -1 : 1;
      this.placeProp(
        chunk,
        'rail_ballast_cluster',
        start + rand.range(2, 30),
        side * rand.range(3.7, 4.7),
        -0.25,
        rand.range(0.75, 1.05),
        rand.range(-Math.PI, Math.PI),
      );
    }
  }

  private placeProp(
    chunk: Chunk,
    id: EnvironmentAssetId,
    dist: number,
    lateral: number,
    height: number,
    scale = 1,
    yaw = 0,
  ): void {
    const pool = this.propPools.get(id) ?? [];
    this.propPools.set(id, pool);
    const object = pool.pop() ?? buildEnvironmentAsset(id);
    if (object.parent !== chunk.group) chunk.group.add(object);
    object.visible = true;
    object.matrixAutoUpdate = false;
    this.path.getBasis(dist, lateral, tmpM);
    tmpPropQ.setFromEuler(tmpPropEuler.set(0, yaw, 0));
    tmpPropLocal.compose(tmpPropPos.set(0, height, 0), tmpPropQ, tmpPropScale.setScalar(scale));
    object.matrix.multiplyMatrices(tmpM, tmpPropLocal);
    object.matrixWorldNeedsUpdate = true;
    chunk.props.push({ id, object });
  }

  private releaseProps(chunk: Chunk): void {
    for (const prop of chunk.props) {
      prop.object.visible = false;
      const pool = this.propPools.get(prop.id) ?? [];
      this.propPools.set(prop.id, pool);
      pool.push(prop.object);
    }
    chunk.props.length = 0;
  }
}

const tmpM2 = new THREE.Matrix4();
const tmpHalfTurn = new THREE.Matrix4().makeRotationY(Math.PI);
const tmpPlatformM = new THREE.Matrix4();
const tmpInstanceM = new THREE.Matrix4();
const tmpPropLocal = new THREE.Matrix4();
const tmpPropPos = new THREE.Vector3();
const tmpPropScale = new THREE.Vector3();
const tmpPropQ = new THREE.Quaternion();
const tmpPropEuler = new THREE.Euler();
