// ---------------------------------------------------------------------------
// ForkVisual — the Temple-Run-style "path splits into two" set piece.
//
// The track path halts at the split (it can't branch until the player commits).
// This renders the tube dividing into a LEFT half-tunnel and a RIGHT half-tunnel
// that meet at the split and peel apart — a clean Y — under an overhead divider
// with glowing ◀ ▶ arrows. The player moves to the left or right lane to pick a
// side; on commit the chosen half is hidden (the real, now-curving track covers
// it) and the unchosen half is left peeling away into the fog.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GEO, mat } from '../render/assets';
import { COLORS } from '../render/palette';
import type { TrackPath } from './track';

// Right-half cross-section (lateral, height): inner wall at the centre divider
// line → floor → outer wall. Mirrored (scale.x = -1) makes the left half, so the
// two halves meet at the centre with a slim gap and never overlap/z-fight.
const HALF: ReadonlyArray<readonly [number, number]> = [
  [0.5, 2.6], [0.95, -0.3], [1.5, -0.5], [4.6, -0.55], [7.2, -0.35], [8.3, 0.8], [9.4, 5.0],
];
const HALF_RAILS = [2.2, 4.6]; // rail centres within the right half
const STUB_LEN = 27;
const RINGS = 15;
const TURN = 1.25; // total heading change of a half-tunnel (radians)

/** Build one right-curving HALF tunnel (floor+walls mesh + rail mesh) in local space. */
function buildHalf(): { env: THREE.Mesh; rails: THREE.Mesh } {
  const step = STUB_LEN / (RINGS - 1);
  const cx: number[] = [];
  const cz: number[] = [];
  const rx: number[] = [];
  const rz: number[] = [];
  let px = 0;
  let pz = 0;
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const h = TURN * Math.pow(t, 1.12); // steady divergence, near-aligned at the mouth
    cx.push(px);
    cz.push(pz);
    rx.push(Math.cos(h));
    rz.push(-Math.sin(h));
    px += Math.sin(h) * step;
    pz += Math.cos(h) * step;
  }

  const nPts = HALF.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < RINGS; i++) {
    for (let p = 0; p < nPts; p++) {
      const [lat, hy] = HALF[p];
      pos.push(cx[i] + rx[i] * lat, hy, cz[i] + rz[i] * lat);
    }
  }
  for (let i = 0; i < RINGS - 1; i++) {
    for (let p = 0; p < nPts - 1; p++) {
      const a = i * nPts + p;
      idx.push(a, a + 1, (i + 1) * nPts + p + 1, a, (i + 1) * nPts + p + 1, (i + 1) * nPts + p);
    }
  }
  const envGeo = new THREE.BufferGeometry();
  envGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  envGeo.setIndex(idx);
  envGeo.computeVertexNormals();
  const env = new THREE.Mesh(
    envGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, flatShading: true }),
  );

  const rpos: number[] = [];
  const ridx: number[] = [];
  let rv = 0;
  const halfW = 0.3;
  const railH = -0.3;
  for (const lane of HALF_RAILS) {
    const base = rv;
    for (let i = 0; i < RINGS; i++) {
      rpos.push(cx[i] + rx[i] * (lane - halfW), railH, cz[i] + rz[i] * (lane - halfW));
      rpos.push(cx[i] + rx[i] * (lane + halfW), railH, cz[i] + rz[i] * (lane + halfW));
      rv += 2;
    }
    for (let i = 0; i < RINGS - 1; i++) {
      const a = base + i * 2;
      ridx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
  railGeo.setIndex(ridx);
  railGeo.computeVertexNormals();
  const rails = new THREE.Mesh(
    railGeo,
    new THREE.MeshStandardMaterial({ color: COLORS.railTop, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }),
  );
  return { env, rails };
}

/** Overhead divider at the split — hangs above the cart (never clips), with ◀ ▶. */
function buildDivider(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2a2a30, { rough: 0.7, metal: 0.55 });
  const glow = new THREE.MeshStandardMaterial({
    color: COLORS.ember,
    emissive: COLORS.ember,
    emissiveIntensity: 2.6,
  });
  // Hanging post (from ceiling down to ~2.6 m — well above the cart).
  g.add(meshAt(GEO.box(0.5, 3.0, 0.5), iron, 0, 4.0, 1.5));
  // Cross bar
  g.add(meshAt(GEO.box(5.4, 0.3, 0.3), iron, 0, 4.4, 1.5));
  // Beacon
  const beacon = new THREE.Mesh(GEO.sphere(0.42, 10), glow);
  beacon.position.set(0, 2.7, 1.5);
  g.add(beacon);
  // Big ◀ ▶ chevrons pointing to each branch
  for (const s of [-1, 1]) {
    const chevron = new THREE.Mesh(GEO.cone(0.75, 1.4, 4), glow);
    chevron.rotation.z = (s * Math.PI) / 2;
    chevron.position.set(s * 2.1, 3.1, 1.5);
    g.add(chevron);
  }
  return g;
}

function meshAt(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

export class ForkVisual {
  private root = new THREE.Group();
  private leftHalf = new THREE.Group();
  private rightHalf = new THREE.Group();
  private divider: THREE.Group;
  private envMats: THREE.MeshStandardMaterial[] = [];
  active = false;
  private forkDist = 0;

  constructor(private path: TrackPath, scene: THREE.Scene) {
    for (const [grp, mirror] of [
      [this.leftHalf, -1],
      [this.rightHalf, 1],
    ] as const) {
      const { env, rails } = buildHalf();
      this.envMats.push(env.material as THREE.MeshStandardMaterial);
      grp.add(env, rails);
      grp.scale.x = mirror;
      this.root.add(grp);
    }
    this.divider = buildDivider();
    this.root.add(this.divider);
    this.root.matrixAutoUpdate = false;
    this.root.visible = false;
    scene.add(this.root);
  }

  reset(): void {
    this.active = false;
    this.root.visible = false;
    this.leftHalf.visible = true;
    this.rightHalf.visible = true;
  }

  /** Reveal both diverging halves at the split. wallColor tints the tunnels. */
  showSplit(forkDist: number, wallColor: number): void {
    this.forkDist = forkDist;
    for (const m of this.envMats) m.color.setHex(wallColor).multiplyScalar(0.8);
    this.path.getBasis(forkDist, 0, this.root.matrix);
    this.root.matrixWorldNeedsUpdate = true;
    this.leftHalf.visible = true;
    this.rightHalf.visible = true;
    this.divider.visible = true;
    this.root.visible = true;
    this.active = true;
  }

  /** Player committed: the real track takes the chosen side; hide its half + arrows. */
  commit(side: -1 | 1): void {
    if (side < 0) this.leftHalf.visible = false;
    else this.rightHalf.visible = false;
    this.divider.visible = false;
  }

  update(cartDist: number): void {
    if (!this.active) return;
    if (cartDist > this.forkDist + 26) {
      this.active = false;
      this.root.visible = false;
    }
  }
}
