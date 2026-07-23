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
  buildInstancedAsset,
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
  /** Per-slot phase so lights do not pulse in lockstep. 0 = steady. */
  flicker: number;
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

/**
 * Every environment prop is drawn through the shared instancer, with the most
 * any single chunk may place (see addProps). Over-budget props are dropped
 * rather than corrupting a neighbouring chunk's slots.
 *
 * Animated props are instanced too, which trades their authored node loops for
 * the draw-call budget. The ratio made that an easy call: forge_pipe is 10 mesh
 * primitives and forge_gear 12, so at 14 and 7 per screen they alone cost 224
 * draw calls — for a valve wiggle and a gear spin on tunnel-wall dressing that
 * passes through fog at 30 m/s. Torch flicker is preserved as a light pulse on
 * the glow instances instead, which reads better anyway and is free.
 */
const PROP_BUDGET: ReadonlyArray<readonly [EnvironmentAssetId, number]> = [
  ['crystal_cluster_small', 7],
  ['crystal_cluster_large', 2],
  ['rail_ballast_cluster', 2],
  ['rock_wall_cluster', 3],
  ['timber_support_arch', 2],
  ['timber_support_arch_b', 2],
  ['timber_support_arch_c', 2],
  ['torch_sconce', 2],
  ['forge_pipe', 2],
  ['forge_gear', 1],
  ['ravine_tree', 3],
  ['waterfall_frame', 1],
];

/**
 * One shared InstancedMesh set per asset, carved into a fixed block of slots
 * per chunk. Visual chunks are pooled and never move, so a chunk's block is
 * stable and no allocator is needed.
 *
 * This is what keeps draw calls flat as the world scrolls. Previously every
 * prop was an individual GLB clone: the crystal clusters alone cost 135 draw
 * calls for 5,400 triangles, and the per-chunk platform instancers another 81.
 */
interface PoolEntry {
  asset: InstancedAsset;
  perChunk: number;
  /** Which block each chunk slot currently owns, or -1. */
  blockOfChunk: Int16Array;
  /** Instances written into each block; -1 marks the block as unowned. */
  usedInBlock: Int16Array;
}

class InstancedPool {
  private entries = new Map<AssetId, PoolEntry>();

  constructor(private scene: THREE.Scene, private chunkCount: number) {}

  register(id: AssetId, perChunk: number): void {
    if (this.entries.has(id)) return;
    const asset = buildInstancedAsset(id, perChunk * this.chunkCount);
    for (const mesh of asset.meshes) mesh.count = 0;
    this.scene.add(asset.root);
    this.entries.set(id, {
      asset,
      perChunk,
      blockOfChunk: new Int16Array(this.chunkCount).fill(-1),
      usedInBlock: new Int16Array(this.chunkCount).fill(-1),
    });
  }

  /**
   * Blocks are allocated per ASSET, always taking the lowest free one, rather
   * than being pinned to the chunk's pool index. The draw count has to span the
   * highest live block, so pinned blocks left degenerate gaps underneath — at a
   * biome boundary, where two platforms are live at once, that inflated the
   * frame from ~138k to ~249k triangles right as the player crosses over.
   * Lowest-first keeps every asset's live blocks packed against zero.
   */
  private blockFor(entry: PoolEntry, chunkSlot: number): number {
    const existing = entry.blockOfChunk[chunkSlot];
    if (existing >= 0) return existing;
    let block = -1;
    for (let b = 0; b < this.chunkCount; b++) {
      if (entry.usedInBlock[b] < 0) {
        block = b;
        break;
      }
    }
    if (block < 0) return -1; // every block taken — cannot happen, one per chunk
    entry.blockOfChunk[chunkSlot] = block;
    entry.usedInBlock[block] = 0;
    return block;
  }

  /** Release a chunk's blocks. Stale matrices would otherwise keep drawing. */
  clearChunk(chunkSlot: number): void {
    tmpZeroM.makeScale(0, 0, 0);
    for (const entry of this.entries.values()) {
      const block = entry.blockOfChunk[chunkSlot];
      if (block < 0) continue;
      const base = block * entry.perChunk;
      for (let i = 0; i < entry.perChunk; i++) {
        for (const mesh of entry.asset.meshes) mesh.setMatrixAt(base + i, tmpZeroM);
      }
      entry.blockOfChunk[chunkSlot] = -1;
      entry.usedInBlock[block] = -1;
    }
  }

  /** Add one instance for a chunk. False when its budget is exhausted. */
  place(id: AssetId, chunkSlot: number, matrix: THREE.Matrix4): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const block = this.blockFor(entry, chunkSlot);
    if (block < 0) return false;
    const local = entry.usedInBlock[block];
    if (local >= entry.perChunk) return false;
    const index = block * entry.perChunk + local;
    for (let part = 0; part < entry.asset.meshes.length; part++) {
      tmpInstanceM.multiplyMatrices(matrix, entry.asset.relativeMatrices[part]);
      entry.asset.meshes[part].setMatrixAt(index, tmpInstanceM);
    }
    entry.usedInBlock[block] = local + 1;
    return true;
  }

  /** Re-derive draw counts and upload. Call once per chunk-set change. */
  flush(): void {
    for (const entry of this.entries.values()) {
      let count = 0;
      for (let b = 0; b < this.chunkCount; b++) {
        const used = entry.usedInBlock[b];
        if (used > 0) count = Math.max(count, b * entry.perChunk + used);
      }
      for (const mesh of entry.asset.meshes) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

// --- Visual chunk --------------------------------------------------------------
class Chunk {
  group = new THREE.Group();
  glows: THREE.InstancedMesh;
  /** Authored glow placements, replayed each frame so they can flicker. */
  glowSlots: GlowSlot[] = [];
  index = -1;

  /** Stable index into the pooled chunk array — also this chunk's slot block. */
  constructor(readonly slot: number) {
    this.glows = new THREE.InstancedMesh(GEO.octa(1), glowMaterial(), 14);
    // Instances live in world space far from the mesh origin — the default
    // origin-centred bounding sphere would cull them once the run moves on.
    this.glows.frustumCulled = false;

    this.group.add(this.glows);
    this.group.visible = false;
  }
}

let _glowMat: THREE.MeshBasicMaterial | null = null;
function glowMaterial(): THREE.MeshBasicMaterial {
  if (!_glowMat) _glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  return _glowMat;
}

export class TrackView {
  private chunks: Chunk[] = [];
  private built = new Map<number, Chunk>();
  private pool: InstancedPool;
  private glowTime = 0;

  constructor(
    private path: TrackPath,
    scene: THREE.Scene,
    private biomeAt: (dist: number) => number,
    private quality: 'high' | 'medium' | 'low',
  ) {
    const n = TUNING.track.drawAheadChunks + TUNING.track.drawBehindChunks + 2;
    this.pool = new InstancedPool(scene, n);
    for (const id of PLATFORM_BY_BIOME) this.pool.register(id, MODULES_PER_CHUNK);
    for (const [id, budget] of PROP_BUDGET) this.pool.register(id, budget);
    for (let i = 0; i < n; i++) {
      const c = new Chunk(i);
      this.chunks.push(c);
      scene.add(c.group);
    }
  }

  /** Reset all chunks (new run). */
  reset(): void {
    this.built.clear();
    for (const c of this.chunks) {
      this.pool.clearChunk(c.slot);
      c.glowSlots.length = 0;
      c.index = -1;
      c.group.visible = false;
    }
    this.pool.flush();
  }

  update(cartDist: number, dt = 0): void {
    const cur = Math.floor(cartDist / CHUNK);
    const lo = cur - TUNING.track.drawBehindChunks;
    const hi = cur + TUNING.track.drawAheadChunks;
    let changed = false;
    // Release chunks out of window
    for (const [idx, c] of this.built) {
      if (idx < lo || idx > hi) {
        this.built.delete(idx);
        this.pool.clearChunk(c.slot);
        c.glowSlots.length = 0;
        c.index = -1;
        c.group.visible = false;
        changed = true;
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
      changed = true;
    }
    // Draw counts span every live block, so they must be re-derived whenever
    // the set of live chunks moves.
    if (changed) this.pool.flush();
    if (dt > 0) this.animateGlows(dt);
  }

  /**
   * Torch flame and magma light pulse. This replaces the authored flicker clip
   * that used to require an individual GLB clone per torch: a pulsing LIGHT
   * reads more like fire than a wobbling mesh does, and this costs ~100 matrix
   * writes a frame instead of 42 draw calls.
   */
  private animateGlows(dt: number): void {
    this.glowTime += dt;
    for (const c of this.built.values()) {
      let dirty = false;
      for (let i = 0; i < c.glowSlots.length; i++) {
        const g = c.glowSlots[i];
        if (g.flicker === 0) continue;
        const pulse = 1 + Math.sin(this.glowTime * 9 + g.flicker) * 0.14
                        + Math.sin(this.glowTime * 23 + g.flicker * 2) * 0.06;
        const s = g.s * pulse;
        tmpM2.makeScale(s, s * 1.4, s);
        tmpM2.setPosition(g.x, g.y, g.z);
        c.glows.setMatrixAt(i, tmpM2);
        dirty = true;
      }
      if (dirty) c.glows.instanceMatrix.needsUpdate = true;
    }
  }

  private buildChunk(c: Chunk, idx: number): void {
    c.index = idx;
    const start = idx * CHUNK;
    const biomeIndex = this.biomeAt(start + CHUNK / 2);
    const biome = BIOMES[biomeIndex];
    const rand = new Rand(idx * 7919 + 13);

    // Blank this chunk's slot block first — it may have held another biome's
    // platform or a different prop mix on its previous build.
    this.pool.clearChunk(c.slot);

    // The complete visible platform is authored in Blender. Each four-metre
    // module is instanced onto a grade-aware track basis, so track, bed, walls,
    // mountains, and ceiling remain aligned through curves and slopes.
    const platformId = PLATFORM_BY_BIOME[biomeIndex];
    for (let moduleIndex = 0; moduleIndex < MODULES_PER_CHUNK; moduleIndex++) {
      const dist = start + (moduleIndex + 0.5) * PLATFORM_MODULE_LENGTH;
      this.path.getBasis(dist, 0, tmpM);
      tmpPlatformM.copy(tmpM);
      if ((idx * MODULES_PER_CHUNK + moduleIndex) % 2 === 1) {
        tmpPlatformM.multiply(tmpHalfTurn);
      }
      this.pool.place(platformId, c.slot, tmpPlatformM);
    }

    // Biome props + glows. On tight curves, skip wide cross-track props —
    // a straight beam through curved space pokes through the walls.
    this.path.getDir(start, tmpV1);
    this.path.getDir(start + CHUNK, tmpV2);
    const curvy = tmpV1.dot(tmpV2) < 0.965;
    const glows: GlowSlot[] = [];
    this.addProps(c, glows, start, biome.name, rand, curvy);

    let gi = 0;
    const maxGlow = this.quality === 'low' ? 8 : 14;
    c.glowSlots.length = 0;
    for (const g of glows) {
      if (gi >= Math.min(c.glows.count, maxGlow)) break;
      tmpM2.makeScale(g.s, g.s * 1.4, g.s);
      tmpM2.setPosition(g.x, g.y, g.z);
      c.glows.setMatrixAt(gi, tmpM2);
      c.glows.setColorAt(gi, tmpC.setHex(g.color));
      c.glowSlots.push(g);
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
    /** `flicker` > 0 gives the light a per-slot phase; 0 leaves it steady. */
    const glowAt = (
      d: number,
      lat: number,
      h: number,
      s: number,
      color: number,
      flicker = 0,
    ): void => {
      this.path.getPoint(d, lat, tmpV1);
      glows.push({ x: tmpV1.x, y: tmpV1.y + h, z: tmpV1.z, s, color, flicker });
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
        // Flame flicker now lives on the light, not on a per-torch GLB clone.
        glowAt(start + off, side * 7.0, 2.25, 0.24, 0xffa030, rand.range(0.5, 6.2));
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
        glowAt(start + off, side * 7.2, 1.0, 0.3, 0xff4a10, rand.range(0.5, 6.2));
      }
      if (dense) {
        const side = rand.chance(0.5) ? -1 : 1;
        this.placeProp(chunk, 'forge_gear', start + 14, side * 7.2, 0.4, rand.range(0.9, 1.2));
      }
      // Warning lamps
      glowAt(start + rand.range(2, 30), rand.chance(0.5) ? -6.9 : 6.9, 3.2, 0.14, 0xff2418);
      // Magma pools at ground edges — slow molten breathing.
      if (rand.chance(0.7)) {
        const d = start + rand.range(4, 28);
        const side = rand.chance(0.5) ? -1 : 1;
        glowAt(d, side * rand.range(5.2, 6.3), -0.4, 0.8, 0xff6a14, rand.range(0.5, 6.2));
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
    this.path.getBasis(dist, lateral, tmpM);
    tmpPropQ.setFromEuler(tmpPropEuler.set(0, yaw, 0));
    tmpPropLocal.compose(tmpPropPos.set(0, height, 0), tmpPropQ, tmpPropScale.setScalar(scale));
    tmpPropWorld.multiplyMatrices(tmpM, tmpPropLocal);
    this.pool.place(id, chunk.slot, tmpPropWorld);
  }
}

const tmpM2 = new THREE.Matrix4();
const tmpHalfTurn = new THREE.Matrix4().makeRotationY(Math.PI);
const tmpPlatformM = new THREE.Matrix4();
const tmpInstanceM = new THREE.Matrix4();
const tmpZeroM = new THREE.Matrix4();
const tmpPropWorld = new THREE.Matrix4();
const tmpPropLocal = new THREE.Matrix4();
const tmpPropPos = new THREE.Vector3();
const tmpPropScale = new THREE.Vector3();
const tmpPropQ = new THREE.Quaternion();
const tmpPropEuler = new THREE.Euler();
