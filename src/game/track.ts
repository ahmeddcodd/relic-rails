// ---------------------------------------------------------------------------
// Track path + visuals.
//
// TrackPath: uniform arc-length samples (1 m) in a ring buffer. Modules
// (length / total curve / slope delta) are pushed by the DifficultyDirector
// and consumed by the generator walk. Evaluation is O(1) by index.
//
// TrackView: pooled visual chunks (32 m each). Per chunk: one merged
// vertex-colored environment geometry (ground/walls/ceiling + biome props),
// one rail-strip geometry, one instanced tie mesh, one instanced glow mesh
// (torch flames, crystals, magma vents). ~4 draw calls per chunk.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import { Rand } from '../core/rand';
import { BIOMES, COLORS } from '../render/palette';
import { GEO, mat } from '../render/assets';

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

  /** Basis matrix (right/up/forward) at dist, position included. */
  getBasis(dist: number, lateral: number, outM: THREE.Matrix4, v = tmpV1, d = tmpV2): void {
    this.getPoint(dist, lateral, v);
    this.getDir(dist, d);
    tmpR.set(-d.z, 0, d.x); // right = forward x up
    outM.makeBasis(tmpR, UP, d);
    outM.setPosition(v);
  }
}

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

// --- Geometry writer ---------------------------------------------------------
const MAX_VERTS = 1600;
const MAX_IDX = 9000;

class GeoWriter {
  pos = new Float32Array(MAX_VERTS * 3);
  col = new Float32Array(MAX_VERTS * 3);
  idx = new Uint16Array(MAX_IDX);
  v = 0;
  i = 0;

  reset(): void {
    this.v = 0;
    this.i = 0;
  }

  vert(x: number, y: number, z: number, c: THREE.Color): number {
    const p = this.v * 3;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.col[p] = c.r;
    this.col[p + 1] = c.g;
    this.col[p + 2] = c.b;
    return this.v++;
  }

  quad(a: number, b: number, c: number, d: number): void {
    if (this.i + 6 > MAX_IDX || this.v > MAX_VERTS) return;
    this.idx[this.i++] = a;
    this.idx[this.i++] = b;
    this.idx[this.i++] = c;
    this.idx[this.i++] = a;
    this.idx[this.i++] = c;
    this.idx[this.i++] = d;
  }

  /** Axis-aligned-in-local-frame box appended via a track basis matrix. */
  box(m: THREE.Matrix4, cx: number, cy: number, cz: number, w: number, h: number, d: number, color: THREE.Color): void {
    if (this.v + 8 > MAX_VERTS || this.i + 36 > MAX_IDX) return;
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;
    const base = this.v;
    for (let k = 0; k < 8; k++) {
      tmpV1.set(cx + (k & 1 ? hw : -hw), cy + (k & 2 ? hh : -hh), cz + (k & 4 ? hd : -hd));
      tmpV1.applyMatrix4(m);
      this.vert(tmpV1.x, tmpV1.y, tmpV1.z, color);
    }
    // 6 faces (winding chosen for outward normals)
    this.quad(base + 0, base + 2, base + 3, base + 1); // -z? (normals fixed by computeVertexNormals; winding consistent)
    this.quad(base + 4, base + 5, base + 7, base + 6);
    this.quad(base + 0, base + 1, base + 5, base + 4);
    this.quad(base + 2, base + 6, base + 7, base + 3);
    this.quad(base + 0, base + 4, base + 6, base + 2);
    this.quad(base + 1, base + 3, base + 7, base + 5);
  }
}

// Ring cross-sections (lateral, height) — tunnel vs open gorge.
const RING_TUNNEL: ReadonlyArray<readonly [number, number]> = [
  [-11, 10.5], [-9.2, 4.0], [-7.6, 0.1], [-6.5, -0.35], [0, -0.55],
  [6.5, -0.35], [7.6, 0.1], [9.2, 4.0], [11, 10.5],
  [5.5, 11.5], [-5.5, 11.5], // ceiling, closes loop back to 0
];
const RING_OPEN: ReadonlyArray<readonly [number, number]> = [
  [-19, 14], [-13, 5.5], [-8.6, 0.3], [-6.5, -0.35], [0, -0.55],
  [6.5, -0.35], [8.6, 0.3], [13, 5.5], [19, 14],
];

interface GlowSlot {
  x: number; y: number; z: number; s: number; color: number;
}

// --- Visual chunk --------------------------------------------------------------
class Chunk {
  group = new THREE.Group();
  env: THREE.Mesh;
  rails: THREE.Mesh;
  ties: THREE.InstancedMesh;
  glows: THREE.InstancedMesh;
  envGeo = new THREE.BufferGeometry();
  railGeo = new THREE.BufferGeometry();
  writer = new GeoWriter();
  railWriter = new GeoWriter();
  index = -1;

  constructor() {
    this.envGeo.setAttribute('position', new THREE.BufferAttribute(this.writer.pos, 3));
    this.envGeo.setAttribute('color', new THREE.BufferAttribute(this.writer.col, 3));
    this.envGeo.setIndex(new THREE.BufferAttribute(this.writer.idx, 1));
    this.env = new THREE.Mesh(this.envGeo, envMaterial());
    this.railGeo.setAttribute('position', new THREE.BufferAttribute(this.railWriter.pos, 3));
    this.railGeo.setAttribute('color', new THREE.BufferAttribute(this.railWriter.col, 3));
    this.railGeo.setIndex(new THREE.BufferAttribute(this.railWriter.idx, 1));
    this.rails = new THREE.Mesh(this.railGeo, railMaterial());

    this.ties = new THREE.InstancedMesh(GEO.box(7.8, 0.12, 0.55), mat(COLORS.tie, { rough: 0.95 }), 22);
    this.glows = new THREE.InstancedMesh(GEO.octa(1), glowMaterial(), 14);
    // Instances live in world space far from the mesh origin — the default
    // origin-centred bounding sphere would cull them once the run moves on.
    this.ties.frustumCulled = false;
    this.glows.frustumCulled = false;

    this.group.add(this.env, this.rails, this.ties, this.glows);
    this.group.visible = false;
  }
}

let _envMat: THREE.MeshStandardMaterial | null = null;
function envMaterial(): THREE.MeshStandardMaterial {
  if (!_envMat)
    _envMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      side: THREE.DoubleSide, // tube seen from inside + prop boxes from outside
    });
  return _envMat;
}
let _railMat: THREE.MeshStandardMaterial | null = null;
function railMaterial(): THREE.MeshStandardMaterial {
  if (!_railMat)
    _railMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.85,
      side: THREE.DoubleSide,
    });
  return _railMat;
}
let _glowMat: THREE.MeshBasicMaterial | null = null;
function glowMaterial(): THREE.MeshBasicMaterial {
  if (!_glowMat) _glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  return _glowMat;
}

export class TrackView {
  private chunks: Chunk[] = [];
  private built = new Map<number, Chunk>();

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
      c.index = -1;
      c.group.visible = false;
    }
  }

  update(cartDist: number): void {
    const cur = Math.floor(cartDist / CHUNK);
    const lo = cur - TUNING.track.drawBehindChunks;
    const hi = cur + TUNING.track.drawAheadChunks;
    // Release chunks out of window
    for (const [idx, c] of this.built) {
      if (idx < lo || idx > hi) {
        this.built.delete(idx);
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
  }

  private buildChunk(c: Chunk, idx: number): void {
    c.index = idx;
    const start = idx * CHUNK;
    const biome = BIOMES[this.biomeAt(start + CHUNK / 2)];
    const rand = new Rand(idx * 7919 + 13);
    const w = c.writer;
    const rw = c.railWriter;
    w.reset();
    rw.reset();

    const ring = biome.hasCeiling ? RING_TUNNEL : RING_OPEN;
    const closed = biome.hasCeiling;
    const rings = Math.floor(CHUNK / 2) + 1; // every 2 m
    const nPts = ring.length;

    const ground = tmpC.setHex(biome.ground).clone();
    const groundAlt = new THREE.Color(biome.groundAlt);
    const wall = new THREE.Color(biome.wall);
    const wallAlt = new THREE.Color(biome.wallAlt);
    const ceil = new THREE.Color(biome.ceiling || biome.wall);

    // Environment ribbon
    let prevBase = -1;
    for (let r = 0; r < rings; r++) {
      const d = start + r * 2;
      this.path.getBasis(d, 0, tmpM);
      const base = w.v;
      for (let p = 0; p < nPts; p++) {
        const [lat, h] = ring[p];
        tmpV1.set(lat, h, 0).applyMatrix4(tmpM);
        let col: THREE.Color;
        if (p >= 3 && p <= 5) col = rand.chance(0.5) ? ground : groundAlt;
        else if (p > 8) col = ceil;
        else col = rand.chance(0.5) ? wall : wallAlt;
        // subtle per-vertex shade variation
        const shade = 0.85 + rand.next() * 0.3;
        tmpC.copy(col).multiplyScalar(shade);
        w.vert(tmpV1.x, tmpV1.y, tmpV1.z, tmpC);
      }
      if (prevBase >= 0) {
        const segs = closed ? nPts : nPts - 1;
        for (let p = 0; p < segs; p++) {
          const q = (p + 1) % nPts;
          w.quad(prevBase + p, base + p, base + q, prevBase + q);
        }
      }
      prevBase = base;
    }

    // Rails: 6 strips (3 lanes x 2 rails)
    const railTop = new THREE.Color(COLORS.railTop);
    const railSide = new THREE.Color(COLORS.railSide);
    const gauge = TUNING.track.railGauge / 2;
    for (const lane of TUNING.track.laneOffsets) {
      for (const side of [-gauge, gauge]) {
        const lat = lane + side;
        let prev = -1;
        for (let r = 0; r < rings; r++) {
          const d = start + r * 2;
          this.path.getBasis(d, 0, tmpM);
          const base = rw.v;
          tmpV1.set(lat - 0.06, 0.14, 0).applyMatrix4(tmpM);
          rw.vert(tmpV1.x, tmpV1.y, tmpV1.z, railTop);
          tmpV1.set(lat + 0.06, 0.14, 0).applyMatrix4(tmpM);
          rw.vert(tmpV1.x, tmpV1.y, tmpV1.z, railTop);
          tmpV1.set(lat + 0.06, -0.04, 0).applyMatrix4(tmpM);
          rw.vert(tmpV1.x, tmpV1.y, tmpV1.z, railSide);
          if (prev >= 0) {
            rw.quad(prev, prev + 1, base + 1, base);
            rw.quad(prev + 1, prev + 2, base + 2, base + 1);
          }
          prev = base;
        }
      }
    }

    // Ties
    let tie = 0;
    for (let d = start + 0.8; d < start + CHUNK && tie < c.ties.count; d += 1.6) {
      this.path.getBasis(d, 0, tmpM);
      tmpM.multiply(tmpM2.makeTranslation(0, 0.02, 0));
      c.ties.setMatrixAt(tie++, tmpM);
    }
    for (let k = tie; k < c.ties.count; k++) {
      c.ties.setMatrixAt(k, tmpM2.makeScale(0, 0, 0));
    }
    c.ties.instanceMatrix.needsUpdate = true;

    // Biome props + glows. On tight curves, skip wide cross-track props —
    // a straight beam through curved space pokes through the walls.
    this.path.getDir(start, tmpV1);
    this.path.getDir(start + CHUNK, tmpV2);
    const curvy = tmpV1.dot(tmpV2) < 0.965;
    const glows: GlowSlot[] = [];
    this.addProps(w, glows, start, biome.name, rand, curvy);

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

    // Commit geometry
    commitGeo(c.envGeo, w);
    commitGeo(c.railGeo, rw);
    // Bounding sphere: centre of chunk, generous radius
    this.path.getPoint(start + CHUNK / 2, 0, tmpV1);
    c.envGeo.boundingSphere = c.envGeo.boundingSphere ?? new THREE.Sphere();
    c.envGeo.boundingSphere.center.copy(tmpV1);
    c.envGeo.boundingSphere.radius = CHUNK + 26;
    c.railGeo.boundingSphere = c.railGeo.boundingSphere ?? new THREE.Sphere();
    c.railGeo.boundingSphere.center.copy(tmpV1);
    c.railGeo.boundingSphere.radius = CHUNK + 8;

    c.group.visible = true;
  }

  private addProps(
    w: GeoWriter,
    glows: GlowSlot[],
    start: number,
    biomeName: string,
    rand: Rand,
    curvy: boolean,
  ): void {
    const dense = this.quality !== 'low';
    const wood = new THREE.Color(0x5f4224);
    const woodDark = new THREE.Color(0x46301a);
    const rock = new THREE.Color(0x59544d);
    const iron = new THREE.Color(0x45403d);
    const green = new THREE.Color(0x4f7a4a);

    const basisAt = (d: number): THREE.Matrix4 => {
      this.path.getBasis(d, 0, tmpM);
      return tmpM;
    };
    const glowAt = (d: number, lat: number, h: number, s: number, color: number): void => {
      this.path.getPoint(d, lat, tmpV1);
      glows.push({ x: tmpV1.x, y: tmpV1.y + h, z: tmpV1.z, s, color });
    };

    if (biomeName === 'Timber Maw Mine') {
      // Support frames every 16 m (posts always; crossbeam only on straights)
      for (const off of [8, 24]) {
        const m = basisAt(start + off);
        w.box(m, -7.2, 3.2, 0, 0.5, 6.4, 0.5, wood);
        w.box(m, 7.2, 3.2, 0, 0.5, 6.4, 0.5, wood);
        if (!curvy) {
          w.box(m, 0, 6.6, 0, 15.4, 0.55, 0.55, woodDark);
          if (dense) {
            w.box(m, -6.2, 5.8, 0, 0.4, 1.8, 0.4, woodDark);
            w.box(m, 6.2, 5.8, 0, 0.4, 1.8, 0.4, woodDark);
          }
        }
      }
      // Torches on alternating walls + ore piles
      for (const off of [4, 20]) {
        const side = rand.chance(0.5) ? -1 : 1;
        const m = basisAt(start + off);
        w.box(m, side * 7.0, 1.6, 0, 0.14, 0.9, 0.14, woodDark);
        glowAt(start + off, side * 7.0, 2.25, 0.24, 0xffa030);
      }
      if (dense && rand.chance(0.6)) {
        const m = basisAt(start + rand.range(6, 26));
        const side = rand.chance(0.5) ? -1 : 1;
        w.box(m, side * 5.6, 0.3, 0, 1.4, 0.9, 1.2, rock);
      }
    } else if (biomeName === 'Flooded Ravine') {
      // Cliff rocks + trees on the banks
      for (let k = 0; k < (dense ? 3 : 2); k++) {
        const d = start + rand.range(2, 30);
        const side = rand.chance(0.5) ? -1 : 1;
        const m = basisAt(d);
        const lat = side * rand.range(8.5, 12);
        w.box(m, lat, 1.2, 0, rand.range(1.5, 2.6), rand.range(1.6, 3.4), 2, rock);
        if (rand.chance(0.55)) {
          w.box(m, lat, 3.4, 0, 0.4, 2.2, 0.4, woodDark);
          w.box(m, lat, 5.0, 0, 1.9, 1.7, 1.9, green);
        }
      }
      // (No floating sky motes here — a glowing octahedron over the track reads
      // as an unreachable shard. Atmosphere comes from the cliffs/trees instead.)
    } else if (biomeName === 'Crystal Hollow') {
      // Crystal clusters — the glow instances ARE the crystals
      const n = dense ? 7 : 5;
      for (let k = 0; k < n; k++) {
        const d = start + rand.range(1, 31);
        const side = rand.chance(0.5) ? -1 : 1;
        const lat = side * rand.range(5.6, 7.2); // inside the cavern walls
        glowAt(d, lat, 0.6, rand.range(0.5, 1.8), rand.chance(0.6) ? 0x2cd8d0 : 0x9a54e8);
      }
      // Dark mineral boulders
      for (let k = 0; k < 2; k++) {
        const m = basisAt(start + rand.range(3, 29));
        const side = rand.chance(0.5) ? -1 : 1;
        w.box(m, side * rand.range(6.6, 8.4), 0.5, 0, 1.6, rand.range(1, 2.2), 1.6, new THREE.Color(0x241e3a));
      }
      // (No over-track floating motes — same shard-lookalike confusion; the
      // wall crystals above provide the cavern glow.)
    } else {
      // Ember Forge: pipes, ducts, vents, warning lamps
      for (const off of [6, 22]) {
        const side = rand.chance(0.5) ? -1 : 1;
        const m = basisAt(start + off);
        w.box(m, side * 7.6, 3, 0, 0.9, 6, 0.9, iron);
        w.box(m, side * 7.6, 5.4, 0, 0.9, 0.3, 0.9, new THREE.Color(0x2e2927));
        glowAt(start + off, side * 7.2, 1.0, 0.3, 0xff4a10);
      }
      if (dense && !curvy) {
        const m = basisAt(start + 14);
        w.box(m, 0, 9.6, 0, 14, 0.8, 0.8, iron); // overhead duct
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
  }
}

const tmpM2 = new THREE.Matrix4();

function commitGeo(geo: THREE.BufferGeometry, w: GeoWriter): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  pos.needsUpdate = true;
  col.needsUpdate = true;
  idx.needsUpdate = true;
  geo.setDrawRange(0, w.i);
  // Zero normals beyond use is fine — compute over the full buffer
  geo.computeVertexNormals();
}
