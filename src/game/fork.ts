// ---------------------------------------------------------------------------
// ForkVisual — the Temple-Run-style "path splits into two" set piece.
//
// The track path itself halts at the split (it cannot branch until the player
// commits a side). This renders the two diverging tunnel mouths + an overhead
// signal so the player SEES two roads ahead and picks one. On commit the chosen
// side is hidden (the real, now-curving track tube covers it) and the unchosen
// branch is left peeling away into the fog.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GEO, mat } from '../render/assets';
import { COLORS } from '../render/palette';
import type { TrackPath } from './track';

// Curved tunnel-mouth cross-section (lateral, height): floor + two walls.
const SECTION: ReadonlyArray<readonly [number, number]> = [
  [-9, 4.6], [-7.2, 0.2], [-6.5, -0.4], [0, -0.55], [6.5, -0.4], [7.2, 0.2], [9, 4.6],
];
const LANES = [-2.2, 0, 2.2];
const STUB_LEN = 24;
const RINGS = 13;
const TURN = 1.05; // total heading change of a stub (radians), eased-in

/** Build one right-curving stub (floor+walls mesh + rail mesh) in local space. */
function buildStub(): { env: THREE.Mesh; rails: THREE.Mesh } {
  const step = STUB_LEN / (RINGS - 1);
  // Centerline samples: quadratic ease so the mouth starts aligned with the tube.
  const cx: number[] = [];
  const cz: number[] = [];
  const rx: number[] = [];
  const rz: number[] = [];
  let px = 0;
  let pz = 0;
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const h = TURN * t * t;
    cx.push(px);
    cz.push(pz);
    rx.push(Math.cos(h));
    rz.push(-Math.sin(h));
    px += Math.sin(h) * step;
    pz += Math.cos(h) * step;
  }

  // --- floor + walls ---
  const nPts = SECTION.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < RINGS; i++) {
    for (let p = 0; p < nPts; p++) {
      const [lat, hy] = SECTION[p];
      pos.push(cx[i] + rx[i] * lat, hy, cz[i] + rz[i] * lat);
    }
  }
  for (let i = 0; i < RINGS - 1; i++) {
    for (let p = 0; p < nPts - 1; p++) {
      const a = i * nPts + p;
      const b = a + 1;
      const c = (i + 1) * nPts + p + 1;
      const d = (i + 1) * nPts + p;
      idx.push(a, b, c, a, c, d);
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

  // --- lane rails ---
  const rpos: number[] = [];
  const ridx: number[] = [];
  let rv = 0;
  const halfW = 0.32;
  const railH = -0.32;
  for (const lane of LANES) {
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
    new THREE.MeshStandardMaterial({ color: COLORS.railSide, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }),
  );
  return { env, rails };
}

function buildSign(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2a2a30, { rough: 0.7, metal: 0.5 });
  // Two glowing chevrons pointing to each branch.
  const glow = new THREE.MeshStandardMaterial({
    color: COLORS.ember,
    emissive: COLORS.ember,
    emissiveIntensity: 2.4,
  });
  for (const s of [-1, 1]) {
    const chevron = new THREE.Mesh(GEO.cone(0.5, 0.9, 4), glow);
    chevron.rotation.z = s * Math.PI / 2;
    chevron.position.set(s * 2.4, 0, 0);
    g.add(chevron);
  }
  // Hanging bar
  g.add(meshAt(GEO.box(5.2, 0.22, 0.22), iron, 0, 0.6, 0));
  return g;
}

function meshAt(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

export class ForkVisual {
  private root = new THREE.Group();
  private leftStub = new THREE.Group();
  private rightStub = new THREE.Group();
  private sign: THREE.Group;
  private envMats: THREE.MeshStandardMaterial[] = [];
  active = false;
  private forkDist = 0;

  constructor(private path: TrackPath, scene: THREE.Scene) {
    for (const [grp, mirror] of [
      [this.leftStub, -1],
      [this.rightStub, 1],
    ] as const) {
      const { env, rails } = buildStub();
      this.envMats.push(env.material as THREE.MeshStandardMaterial);
      grp.add(env, rails);
      grp.scale.x = mirror;
      this.root.add(grp);
    }
    this.sign = buildSign();
    this.sign.position.set(0, 5.6, 4);
    this.root.add(this.sign);
    this.root.matrixAutoUpdate = false;
    this.root.visible = false;
    scene.add(this.root);
  }

  reset(): void {
    this.active = false;
    this.root.visible = false;
    this.leftStub.visible = true;
    this.rightStub.visible = true;
  }

  /** Reveal both diverging branches at the split. wallColor tints the tunnels. */
  showSplit(forkDist: number, wallColor: number): void {
    this.forkDist = forkDist;
    for (const m of this.envMats) m.color.setHex(wallColor).multiplyScalar(0.75);
    this.path.getBasis(forkDist, 0, this.root.matrix);
    this.root.matrixWorldNeedsUpdate = true;
    this.leftStub.visible = true;
    this.rightStub.visible = true;
    this.sign.visible = true;
    this.root.visible = true;
    this.active = true;
  }

  /** Player committed: the real track tube takes the chosen side; hide its stub. */
  commit(side: -1 | 1): void {
    if (side < 0) this.leftStub.visible = false;
    else this.rightStub.visible = false;
    this.sign.visible = false;
  }

  update(cartDist: number): void {
    if (!this.active) return;
    if (cartDist > this.forkDist + 26) {
      this.active = false;
      this.root.visible = false;
    }
  }
}
