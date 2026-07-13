// ---------------------------------------------------------------------------
// Procedural asset library. All models are built from cached primitives with
// shared materials — no external files, no licensing surface, tiny bundle.
// Never construct geometries/materials inline elsewhere: use GEO/mat().
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { COLORS } from './palette';

// --- Shared geometry cache ---------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const GEO = {
  box: (w: number, h: number, d: number) =>
    cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 10) =>
    cached(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  sphere: (r: number, seg = 10) =>
    cached(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2))),
  cone: (r: number, h: number, seg = 8) =>
    cached(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  octa: (r: number) => cached(`octa${r}`, () => new THREE.OctahedronGeometry(r)),
  ico: (r: number, detail = 0) =>
    cached(`ico${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)),
  torus: (r: number, t: number) =>
    cached(`torus${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 18)),
  plane: (w: number, h: number) => cached(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
};

// --- Shared material cache ---------------------------------------------------
export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
}
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.8}|${o.metal ?? 0}|${o.emissive ?? 0}|${o.emissiveIntensity ?? 1}|${o.flat ? 1 : 0}|${o.transparent ? o.opacity ?? 1 : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.8,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? false,
    });
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? 1;
    }
    if (o.transparent) {
      m.transparent = true;
      m.opacity = o.opacity ?? 0.5;
      m.depthWrite = false;
    }
    matCache.set(key, m);
  }
  return m;
}

function add(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// --- Blob shadow ---------------------------------------------------------------
let blobTex: THREE.CanvasTexture | null = null;
export function blobShadow(radius: number): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    GEO.plane(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: blobTex,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// --- Hero cart -----------------------------------------------------------------
export interface CartModel {
  root: THREE.Group;
  hull: THREE.Group;
  wheels: THREE.Mesh[];
  lantern: THREE.Mesh;
  shield: THREE.Mesh;
  shadow: THREE.Mesh;
}

export function buildCart(): CartModel {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);

  const steel = mat(COLORS.cartBody, { rough: 0.55, metal: 0.7, flat: true });
  const trim = mat(COLORS.cartTrim, { rough: 0.4, metal: 0.85 });
  const dark = mat(0x30363c, { rough: 0.7, metal: 0.5 });

  // Angled hopper body: wider at top.
  const body = add(hull, GEO.box(1.5, 0.85, 1.9), steel, 0, 0.72, 0);
  (body.geometry as THREE.BoxGeometry).computeBoundingBox();
  body.scale.set(1, 1, 1);
  // Rim + panel details
  add(hull, GEO.box(1.66, 0.14, 2.06), trim, 0, 1.16, 0);
  add(hull, GEO.box(1.56, 0.5, 0.1), dark, 0, 0.62, 0.98);
  add(hull, GEO.box(1.56, 0.5, 0.1), dark, 0, 0.62, -0.98);
  add(hull, GEO.box(0.1, 0.5, 1.96), dark, 0.76, 0.62, 0);
  add(hull, GEO.box(0.1, 0.5, 1.96), dark, -0.76, 0.62, 0);
  // Rivet strips
  for (const sx of [-0.6, 0, 0.6]) add(hull, GEO.box(0.12, 0.66, 0.06), trim, sx, 0.72, 1.0);
  // Chassis
  add(hull, GEO.box(1.2, 0.22, 1.7), dark, 0, 0.26, 0);
  // Sunheart lantern on the prow
  const lantern = add(
    hull,
    GEO.octa(0.19),
    mat(COLORS.sunheart, { emissive: COLORS.sunheart, emissiveIntensity: 2.2, rough: 0.3 }),
    0,
    1.05,
    1.12,
  );
  add(hull, GEO.torus(0.24, 0.035), trim, 0, 1.05, 1.12).rotation.y = 0;

  // Wheels
  const wheels: THREE.Mesh[] = [];
  const wgeo = GEO.cyl(0.3, 0.3, 0.18, 12);
  const wmat = mat(COLORS.cartWheel, { rough: 0.5, metal: 0.8 });
  for (const [x, z] of [
    [-0.62, 0.62],
    [0.62, 0.62],
    [-0.62, -0.62],
    [0.62, -0.62],
  ]) {
    const w = new THREE.Mesh(wgeo, wmat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.3, z);
    root.add(w);
    wheels.push(w);
    const hub = new THREE.Mesh(GEO.cyl(0.09, 0.09, 0.22, 8), trim);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
  }

  // Shield dome (hidden until Aegis Plate active)
  const shield = add(
    root,
    GEO.sphere(1.55, 14),
    mat(COLORS.shield, {
      emissive: COLORS.shield,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.22,
      rough: 0.2,
    }),
    0,
    0.9,
    0,
  );
  shield.scale.set(1, 0.85, 1.25);
  shield.visible = false;

  const shadow = blobShadow(1.5);
  shadow.position.y = 0.02;
  root.add(shadow);

  return { root, hull, wheels, lantern, shield, shadow };
}

// --- Rin (hero character) --------------------------------------------------------
export interface RinModel {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  scarf: THREE.Mesh;
}

export function buildRin(): RinModel {
  const root = new THREE.Group();
  const torso = new THREE.Group();
  root.add(torso);

  const jacket = mat(COLORS.rinJacket, { rough: 0.85 });
  const skin = mat(COLORS.rinSkin, { rough: 0.7 });
  const hair = mat(COLORS.rinHair, { rough: 0.9 });

  add(torso, GEO.cyl(0.24, 0.3, 0.62, 8), jacket, 0, 0.55, 0);
  // Backpack with relic satchel
  add(torso, GEO.box(0.34, 0.4, 0.18), mat(0x6b5232, { rough: 0.9 }), 0, 0.62, -0.28);

  const head = new THREE.Group();
  head.position.set(0, 1.02, 0);
  torso.add(head);
  add(head, GEO.sphere(0.19, 10), skin, 0, 0, 0);
  const hairCap = add(head, GEO.sphere(0.21, 10), hair, 0, 0.05, -0.03);
  hairCap.scale.set(1, 0.85, 1);
  // Ponytail
  add(head, GEO.cyl(0.05, 0.02, 0.3, 6), hair, 0, -0.06, -0.22).rotation.x = 0.7;
  // Goggles band
  add(head, GEO.torus(0.19, 0.025), mat(0x2c2c2c, { rough: 0.6 }), 0, 0.06, 0).rotation.x =
    Math.PI / 2 - 0.25;

  const scarf = add(torso, GEO.box(0.4, 0.12, 0.3), mat(COLORS.rinScarf, { rough: 0.95 }), 0, 0.88, 0.02);

  const armGeo = GEO.cyl(0.06, 0.075, 0.5, 6);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.3, 0.78, 0.12);
  armL.rotation.set(-1.0, 0, -0.35);
  torso.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.3, 0.78, 0.12);
  armR.rotation.set(-1.0, 0, 0.35);
  torso.add(armR);

  return { root, torso, head, armL, armR, scarf };
}

// --- Iron Maw (chase guardian silhouette) ---------------------------------------
export interface MawModel {
  root: THREE.Group;
  eyes: THREE.Mesh[];
  grinders: THREE.Mesh[];
}

export function buildMaw(): MawModel {
  const root = new THREE.Group();
  const body = mat(COLORS.maw, { rough: 0.95, flat: true });
  const glowM = mat(COLORS.mawEye, { emissive: COLORS.mawEye, emissiveIntensity: 3 });

  const hull = add(root, GEO.box(5.4, 4.6, 3.2), body, 0, 2.4, 0);
  hull.rotation.x = 0.08;
  add(root, GEO.box(6.2, 1.4, 2.2), body, 0, 0.8, 0.7);
  // Maw grinder cones
  const grinders: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const g = add(root, GEO.cone(0.55, 1.3, 6), body, -2.2 + i * 1.1, 1.1, 1.9);
    g.rotation.x = Math.PI / 2;
    grinders.push(g);
  }
  // Eyes
  const eyes: THREE.Mesh[] = [];
  for (const x of [-1.5, 1.5]) {
    eyes.push(add(root, GEO.sphere(0.34, 8), glowM, x, 3.6, 1.62));
  }
  // Shoulder arms
  for (const s of [-1, 1]) {
    const arm = add(root, GEO.box(1.0, 3.4, 1.0), body, s * 3.4, 2.2, 0.6);
    arm.rotation.z = s * -0.18;
  }
  return { root, eyes, grinders };
}

// --- Obstacles -------------------------------------------------------------------
// Every obstacle: readable silhouette + a hot-red hazard accent (color language).
const hazardM = () =>
  mat(COLORS.hazard, { emissive: COLORS.hazardLamp, emissiveIntensity: 1.4, rough: 0.5 });

export function buildBlockerCart(): THREE.Group {
  const g = new THREE.Group();
  const rust = mat(0x6e4530, { rough: 0.85, metal: 0.4, flat: true });
  add(g, GEO.box(1.5, 0.9, 1.8), rust, 0, 0.75, 0);
  add(g, GEO.box(1.64, 0.14, 1.94), mat(0x513324, { rough: 0.9 }), 0, 1.2, 0);
  // Ore heap
  add(g, GEO.ico(0.55, 0), mat(0x555a60, { rough: 0.95, flat: true }), 0, 1.35, 0);
  add(g, GEO.box(1.3, 0.25, 0.25), hazardM(), 0, 1.0, 0.95);
  for (const [x, z] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]]) {
    const w = add(g, GEO.cyl(0.26, 0.26, 0.16, 10), mat(0x2b2622, { rough: 0.6 }), x, 0.28, z);
    w.rotation.z = Math.PI / 2;
  }
  return g;
}

export function buildBrokenRail(): THREE.Group {
  // A collapsed gap: splintered ends + warning lamp. The hazard is the GAP —
  // this model marks its leading edge.
  const g = new THREE.Group();
  const wood = mat(0x4a3018, { rough: 0.95, flat: true });
  for (const s of [-1, 1]) {
    const plank = add(g, GEO.box(0.28, 0.14, 1.4), wood, s * 0.5, 0.1, -0.3);
    plank.rotation.set(0.5 * s, s * 0.4, 0.25 * s);
  }
  const post = add(g, GEO.box(0.14, 1.0, 0.14), wood, -0.85, 0.5, 0);
  post.rotation.z = 0.18;
  add(g, GEO.sphere(0.13, 8), hazardM(), -0.9, 1.05, 0);
  return g;
}

export function buildLowBeam(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x5a3d20, { rough: 0.95, flat: true });
  add(g, GEO.box(2.4, 0.45, 0.45), wood, 0, 1.55, 0);
  add(g, GEO.box(0.32, 1.85, 0.32), wood, -1.25, 0.92, 0);
  add(g, GEO.box(0.32, 1.85, 0.32), wood, 1.25, 0.92, 0);
  // Dangling warning chains + red stripe
  add(g, GEO.box(2.2, 0.1, 0.5), hazardM(), 0, 1.32, 0);
  for (const x of [-0.7, 0, 0.7]) add(g, GEO.cyl(0.02, 0.02, 0.4, 5), mat(0x777777, { metal: 0.8, rough: 0.4 }), x, 1.1, 0.12);
  return g;
}

export function buildGate(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x3c4046, { rough: 0.6, metal: 0.75, flat: true });
  add(g, GEO.box(0.3, 2.4, 0.3), iron, -1.15, 1.2, 0);
  add(g, GEO.box(0.3, 2.4, 0.3), iron, 1.15, 1.2, 0);
  // Half-closed portcullis — duck under
  const grid = new THREE.Group();
  grid.position.y = 1.85;
  g.add(grid);
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) add(grid, GEO.box(0.09, 1.4, 0.09), iron, x, 0, 0);
  add(grid, GEO.box(2.1, 0.12, 0.12), hazardM(), 0, -0.68, 0);
  return g;
}

export function buildRockPile(): THREE.Group {
  const g = new THREE.Group();
  const rock = mat(0x5c5852, { rough: 0.95, flat: true });
  add(g, GEO.ico(0.6, 0), rock, 0, 0.5, 0);
  add(g, GEO.ico(0.42, 0), rock, -0.5, 0.32, 0.2).rotation.set(0.5, 1, 0);
  add(g, GEO.ico(0.36, 0), rock, 0.48, 0.3, -0.15).rotation.set(1, 0.4, 0.6);
  add(g, GEO.cone(0.14, 0.5, 5), hazardM(), 0, 1.1, 0);
  return g;
}

export function buildOncomingCart(): THREE.Group {
  const g = buildBlockerCart();
  // Headlamp — the telegraph for an oncoming cart.
  const lamp = new THREE.Mesh(
    GEO.sphere(0.16, 8),
    mat(0xfff2c0, { emissive: 0xffe9a0, emissiveIntensity: 4 }),
  );
  lamp.position.set(0, 1.05, 1.05);
  g.add(lamp);
  return g;
}

export function buildFireJet(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x3a3634, { rough: 0.7, metal: 0.6, flat: true });
  add(g, GEO.cyl(0.35, 0.45, 0.5, 8), iron, 0, 0.25, 0);
  const flame = new THREE.Mesh(
    GEO.cone(0.42, 2.2, 8),
    mat(0xff7a1a, { emissive: 0xff5a00, emissiveIntensity: 2.4, transparent: true, opacity: 0.85 }),
  );
  flame.position.y = 1.6;
  flame.name = 'flame';
  g.add(flame);
  const glow = new THREE.Mesh(GEO.sphere(0.3, 8), mat(0xffa040, { emissive: 0xff8020, emissiveIntensity: 3 }));
  glow.position.y = 0.55;
  glow.name = 'vent';
  g.add(glow);
  return g;
}

export function buildCrystalSpikes(): THREE.Group {
  const g = new THREE.Group();
  const c = mat(0x64f0e8, { emissive: 0x2ec8c0, emissiveIntensity: 0.9, rough: 0.25, flat: true });
  for (const [x, s, r] of [
    [-0.4, 0.9, 0.3],
    [0.15, 1.3, -0.15],
    [0.55, 0.7, 0.4],
  ]) {
    const spike = add(g, GEO.cone(0.28, 1.4, 5), c, x, 0.6 * s, 0);
    spike.scale.setScalar(s);
    spike.rotation.z = r;
  }
  add(g, GEO.box(1.4, 0.14, 0.6), hazardM(), 0, 0.07, 0.5);
  return g;
}

export function buildDebris(): THREE.Group {
  // Minor obstacle — clipping it costs speed + combo, not the run.
  const g = new THREE.Group();
  const wood = mat(0x54401f, { rough: 0.95, flat: true });
  add(g, GEO.box(0.9, 0.25, 0.5), wood, 0, 0.12, 0).rotation.y = 0.5;
  add(g, GEO.box(0.7, 0.2, 0.35), wood, 0.2, 0.35, 0.1).rotation.y = -0.3;
  add(g, GEO.cyl(0.16, 0.16, 0.5, 7), mat(0x6b5232, { rough: 0.9 }), -0.3, 0.25, 0.1).rotation.z = 1.2;
  return g;
}

// --- Power-up pickups --------------------------------------------------------------
export function buildPowerup(kind: string): THREE.Group {
  const g = new THREE.Group();
  const base = mat(COLORS.safe, { emissive: COLORS.safe, emissiveIntensity: 1.1, rough: 0.3 });
  const ring = new THREE.Mesh(GEO.torus(0.55, 0.05), base);
  ring.name = 'ring';
  ring.position.y = 1.0;
  g.add(ring);
  let core: THREE.Mesh;
  switch (kind) {
    case 'magnet':
      core = new THREE.Mesh(GEO.torus(0.24, 0.09), mat(0xff5a5a, { emissive: 0xff3030, emissiveIntensity: 1.4 }));
      break;
    case 'shield':
      core = new THREE.Mesh(GEO.sphere(0.3, 10), mat(COLORS.shield, { emissive: COLORS.shield, emissiveIntensity: 1.5 }));
      break;
    case 'ghost':
      core = new THREE.Mesh(
        GEO.ico(0.32, 0),
        mat(0xbfe8ff, { emissive: 0x9fd8ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.55 }),
      );
      break;
    case 'frenzy':
      core = new THREE.Mesh(GEO.octa(0.34), mat(COLORS.ember, { emissive: COLORS.ember, emissiveIntensity: 2 }));
      break;
    default: // repair
      core = new THREE.Mesh(GEO.box(0.4, 0.4, 0.4), mat(0x8effc0, { emissive: 0x40e080, emissiveIntensity: 1.5 }));
  }
  core.name = 'core';
  core.position.y = 1.0;
  g.add(core);
  return g;
}

// --- Biome props ----------------------------------------------------------------
export function buildTimberFrame(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x5f4224, { rough: 0.95, flat: true });
  add(g, GEO.box(0.45, 5.2, 0.45), wood, -4.6, 2.6, 0);
  add(g, GEO.box(0.45, 5.2, 0.45), wood, 4.6, 2.6, 0);
  add(g, GEO.box(9.8, 0.5, 0.5), wood, 0, 5.1, 0);
  add(g, GEO.box(0.35, 1.6, 0.35), wood, -4.0, 4.6, 0).rotation.z = 0.65;
  add(g, GEO.box(0.35, 1.6, 0.35), wood, 4.0, 4.6, 0).rotation.z = -0.65;
  return g;
}

export function buildTorch(): THREE.Group {
  const g = new THREE.Group();
  add(g, GEO.cyl(0.05, 0.07, 0.7, 6), mat(0x4a3018, { rough: 0.9 }), 0, 0.35, 0);
  const flame = new THREE.Mesh(
    GEO.cone(0.16, 0.45, 7),
    mat(0xffb43c, { emissive: 0xff8c1e, emissiveIntensity: 2.6 }),
  );
  flame.position.y = 0.85;
  flame.name = 'flame';
  g.add(flame);
  return g;
}

export function buildCrystalCluster(big: boolean): THREE.Group {
  const g = new THREE.Group();
  const cyan = mat(0x54e8e0, { emissive: 0x2cb8b0, emissiveIntensity: 1.1, rough: 0.2, flat: true });
  const violet = mat(0xb46cff, { emissive: 0x7a3cc8, emissiveIntensity: 1.0, rough: 0.2, flat: true });
  const s = big ? 2.2 : 1;
  add(g, GEO.cone(0.3 * s, 1.6 * s, 6), cyan, 0, 0.8 * s, 0).rotation.z = 0.1;
  add(g, GEO.cone(0.2 * s, 1.0 * s, 6), violet, 0.35 * s, 0.5 * s, 0.1).rotation.z = -0.4;
  add(g, GEO.cone(0.16 * s, 0.8 * s, 6), cyan, -0.3 * s, 0.4 * s, -0.1).rotation.z = 0.45;
  return g;
}

export function buildRavineTree(): THREE.Group {
  const g = new THREE.Group();
  add(g, GEO.cyl(0.18, 0.28, 2.4, 7), mat(0x4f3a22, { rough: 0.95 }), 0, 1.2, 0);
  const leaf = mat(0x4f7a4a, { rough: 0.9, flat: true });
  add(g, GEO.ico(1.1, 0), leaf, 0, 2.9, 0);
  add(g, GEO.ico(0.7, 0), leaf, 0.7, 2.3, 0.2);
  return g;
}

export function buildForgePipe(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x45403d, { rough: 0.6, metal: 0.7, flat: true });
  add(g, GEO.cyl(0.4, 0.4, 5.0, 9), iron, 0, 2.5, 0);
  add(g, GEO.torus(0.46, 0.07), iron, 0, 3.6, 0).rotation.x = Math.PI / 2;
  const vent = add(g, GEO.sphere(0.2, 8), mat(0xff5a12, { emissive: 0xff3a00, emissiveIntensity: 2.6 }), 0, 1.4, 0.38);
  vent.name = 'flame';
  return g;
}

export function buildGear(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x504a46, { rough: 0.55, metal: 0.8, flat: true });
  const wheel = new THREE.Mesh(GEO.cyl(1.5, 1.5, 0.35, 10), iron);
  wheel.rotation.x = Math.PI / 2;
  wheel.name = 'spin';
  g.add(wheel);
  for (let i = 0; i < 8; i++) {
    const tooth = new THREE.Mesh(GEO.box(0.4, 0.5, 0.35), iron);
    const a = (i / 8) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0);
    tooth.rotation.z = a;
    wheel.add(tooth);
  }
  return g;
}

export function buildWaterfallCard(): THREE.Mesh {
  const m = new THREE.Mesh(
    GEO.plane(3.2, 14),
    mat(0xbfe4ff, { emissive: 0x8fc8f0, emissiveIntensity: 0.5, transparent: true, opacity: 0.4, rough: 0.2 }),
  );
  m.name = 'waterfall';
  return m;
}
