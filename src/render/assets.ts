// ---------------------------------------------------------------------------
// Authored GLB asset library.
//
// Every visible game model is loaded once from READY_TO_USE_ASSETS, then
// cloned (shared geometries/materials) or instanced. Generic runtime geometry
// remains here only for transient shadows, shields, glows, and particles.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLORS } from './palette';

import blockerCartUrl from '../../READY_TO_USE_ASSETS/blocker_cart/blocker_cart.glb?url';
import brokenRailUrl from '../../READY_TO_USE_ASSETS/broken_rail/broken_rail.glb?url';
import crystalLargeUrl from '../../READY_TO_USE_ASSETS/crystal_cluster_large/crystal_cluster_large.glb?url';
import crystalSmallUrl from '../../READY_TO_USE_ASSETS/crystal_cluster_small/crystal_cluster_small.glb?url';
import crystalSpikesUrl from '../../READY_TO_USE_ASSETS/crystal_spikes/crystal_spikes.glb?url';
import crystalPlatformUrl from '../../READY_TO_USE_ASSETS/crystal_cavern_platform/crystal_cavern_platform.glb?url';
import debrisUrl from '../../READY_TO_USE_ASSETS/debris_cluster/debris_cluster.glb?url';
import emberShardUrl from '../../READY_TO_USE_ASSETS/ember_shard/ember_shard.glb?url';
import fireJetUrl from '../../READY_TO_USE_ASSETS/fire_jet/fire_jet.glb?url';
import forgeGearUrl from '../../READY_TO_USE_ASSETS/forge_gear/forge_gear.glb?url';
import forgePipeUrl from '../../READY_TO_USE_ASSETS/forge_pipe/forge_pipe.glb?url';
import ironMawUrl from '../../READY_TO_USE_ASSETS/iron_maw/iron_maw.glb?url';
import lowBeamUrl from '../../READY_TO_USE_ASSETS/low_beam/low_beam.glb?url';
import minecartUrl from '../../READY_TO_USE_ASSETS/minecart_hero/minecart_hero.glb?url';
import oncomingCartUrl from '../../READY_TO_USE_ASSETS/oncoming_cart/oncoming_cart.glb?url';
import gateUrl from '../../READY_TO_USE_ASSETS/portcullis_gate/portcullis_gate.glb?url';
import frenzyUrl from '../../READY_TO_USE_ASSETS/powerup_frenzy/powerup_frenzy.glb?url';
import ravinePlatformUrl from '../../READY_TO_USE_ASSETS/flooded_ravine_platform/flooded_ravine_platform.glb?url';
import ghostUrl from '../../READY_TO_USE_ASSETS/powerup_ghost/powerup_ghost.glb?url';
import magnetUrl from '../../READY_TO_USE_ASSETS/powerup_magnet/powerup_magnet.glb?url';
import repairUrl from '../../READY_TO_USE_ASSETS/powerup_repair/powerup_repair.glb?url';
import shieldUrl from '../../READY_TO_USE_ASSETS/powerup_shield/powerup_shield.glb?url';
import prismUrl from '../../READY_TO_USE_ASSETS/prism/prism.glb?url';
import ballastUrl from '../../READY_TO_USE_ASSETS/rail_ballast_cluster/rail_ballast_cluster.glb?url';
import ravineTreeUrl from '../../READY_TO_USE_ASSETS/ravine_tree/ravine_tree.glb?url';
import rinUrl from '../../READY_TO_USE_ASSETS/rin_vale/rin_vale.glb?url';
import rockPileUrl from '../../READY_TO_USE_ASSETS/rock_pile/rock_pile.glb?url';
import rockWallUrl from '../../READY_TO_USE_ASSETS/rock_wall_cluster/rock_wall_cluster.glb?url';
import timberArchUrl from '../../READY_TO_USE_ASSETS/timber_support_arch/timber_support_arch.glb?url';
import timberArchBUrl from '../../READY_TO_USE_ASSETS/timber_support_arch_b/timber_support_arch_b.glb?url';
import timberArchCUrl from '../../READY_TO_USE_ASSETS/timber_support_arch_c/timber_support_arch_c.glb?url';
import timberPlatformUrl from '../../READY_TO_USE_ASSETS/timber_mine_platform/timber_mine_platform.glb?url';
import torchUrl from '../../READY_TO_USE_ASSETS/torch_sconce/torch_sconce.glb?url';
import waterfallUrl from '../../READY_TO_USE_ASSETS/waterfall_frame/waterfall_frame.glb?url';
import forgePlatformUrl from '../../READY_TO_USE_ASSETS/ember_forge_platform/ember_forge_platform.glb?url';

export type AssetId =
  | 'blocker_cart'
  | 'broken_rail'
  | 'crystal_cluster_large'
  | 'crystal_cluster_small'
  | 'crystal_spikes'
  | 'crystal_cavern_platform'
  | 'debris_cluster'
  | 'ember_shard'
  | 'fire_jet'
  | 'forge_gear'
  | 'forge_pipe'
  | 'iron_maw'
  | 'low_beam'
  | 'minecart_hero'
  | 'oncoming_cart'
  | 'portcullis_gate'
  | 'powerup_frenzy'
  | 'flooded_ravine_platform'
  | 'powerup_ghost'
  | 'powerup_magnet'
  | 'powerup_repair'
  | 'powerup_shield'
  | 'prism'
  | 'rail_ballast_cluster'
  | 'ravine_tree'
  | 'rin_vale'
  | 'rock_pile'
  | 'rock_wall_cluster'
  | 'timber_support_arch'
  | 'timber_support_arch_b'
  | 'timber_support_arch_c'
  | 'timber_mine_platform'
  | 'torch_sconce'
  | 'waterfall_frame'
  | 'ember_forge_platform';

interface ClipRange {
  start: number;
  end: number;
  loop: boolean;
}

interface AssetDef {
  url: string;
  clips?: Record<string, ClipRange>;
}

const loop = (start: number, end: number): ClipRange => ({ start, end, loop: true });
const once = (start: number, end: number): ClipRange => ({ start, end, loop: false });

const ASSET_DEFS: Record<AssetId, AssetDef> = {
  blocker_cart: { url: blockerCartUrl },
  broken_rail: { url: brokenRailUrl },
  crystal_cluster_large: { url: crystalLargeUrl },
  crystal_cluster_small: { url: crystalSmallUrl },
  crystal_spikes: { url: crystalSpikesUrl },
  crystal_cavern_platform: { url: crystalPlatformUrl },
  debris_cluster: { url: debrisUrl },
  ember_shard: { url: emberShardUrl, clips: { collectible_loop: loop(1, 60) } },
  fire_jet: { url: fireJetUrl, clips: { flame_loop: loop(1, 30), burst: once(45, 80) } },
  forge_gear: { url: forgeGearUrl, clips: { gear_spin_loop: loop(1, 60) } },
  forge_pipe: { url: forgePipeUrl, clips: { valve_vent_loop: loop(1, 60) } },
  iron_maw: {
    url: ironMawUrl,
    clips: { chase_loop: loop(1, 60), lunge: once(70, 105), catch: once(120, 160) },
  },
  low_beam: { url: lowBeamUrl, clips: { chain_sway_loop: loop(1, 60) } },
  minecart_hero: {
    url: minecartUrl,
    clips: {
      idle_loop: loop(1, 60),
      wheel_spin_loop: loop(70, 100),
      suspension_hit: once(110, 145),
      crash: once(160, 210),
    },
  },
  oncoming_cart: { url: oncomingCartUrl, clips: { approach_loop: loop(1, 30) } },
  portcullis_gate: {
    url: gateUrl,
    clips: { warning_shudder: once(1, 32), lift_cycle: once(45, 90) },
  },
  powerup_frenzy: { url: frenzyUrl, clips: { pickup_loop: loop(1, 60) } },
  flooded_ravine_platform: { url: ravinePlatformUrl },
  powerup_ghost: { url: ghostUrl, clips: { pickup_loop: loop(1, 60) } },
  powerup_magnet: { url: magnetUrl, clips: { pickup_loop: loop(1, 60) } },
  powerup_repair: { url: repairUrl, clips: { pickup_loop: loop(1, 60) } },
  powerup_shield: { url: shieldUrl, clips: { pickup_loop: loop(1, 60) } },
  prism: { url: prismUrl, clips: { collectible_loop: loop(1, 60) } },
  rail_ballast_cluster: { url: ballastUrl },
  ravine_tree: { url: ravineTreeUrl, clips: { wind_sway_loop: loop(1, 90) } },
  rin_vale: {
    url: rinUrl,
    clips: {
      idle_cart: loop(1, 60),
      lean_left: once(70, 90),
      lean_right: once(100, 120),
      jump: once(130, 170),
      duck: once(180, 210),
      stumble: once(220, 250),
      crash: once(260, 310),
      celebrate: once(320, 360),
    },
  },
  rock_pile: { url: rockPileUrl },
  rock_wall_cluster: { url: rockWallUrl },
  timber_support_arch: { url: timberArchUrl },
  timber_support_arch_b: { url: timberArchBUrl },
  timber_support_arch_c: { url: timberArchCUrl },
  timber_mine_platform: { url: timberPlatformUrl },
  torch_sconce: { url: torchUrl, clips: { flame_flicker_loop: loop(1, 45) } },
  waterfall_frame: { url: waterfallUrl, clips: { water_flow_loop: loop(1, 60) } },
  ember_forge_platform: { url: forgePlatformUrl },
};

interface LoadedAsset {
  scene: THREE.Group;
  clips: Map<string, { clip: THREE.AnimationClip; loop: boolean }>;
}

interface AnimationRuntime {
  id: AssetId;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  clipName: string | null;
}

const loadedAssets = new Map<AssetId, LoadedAsset>();
const animationRuntimes = new WeakMap<THREE.Object3D, AnimationRuntime>();
let loadPromise: Promise<void> | null = null;

/** Load the complete authored model pack exactly once. */
export function loadGameAssets(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  if (loadPromise) return loadPromise;
  const entries = Object.entries(ASSET_DEFS) as [AssetId, AssetDef][];
  const loader = new GLTFLoader();
  let completed = 0;
  loadPromise = Promise.all(
    entries.map(async ([id, def]) => {
      const gltf = await loader.loadAsync(def.url);
      loadedAssets.set(id, prepareLoadedAsset(gltf, def));
      completed++;
      onProgress?.(completed, entries.length);
    }),
  ).then(() => undefined);
  return loadPromise;
}

function prepareLoadedAsset(gltf: GLTF, def: AssetDef): LoadedAsset {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  const clips = new Map<string, { clip: THREE.AnimationClip; loop: boolean }>();
  const library = gltf.animations[0];
  if (library && def.clips) {
    for (const [name, range] of Object.entries(def.clips)) {
      // Blender frame ranges are inclusive; AnimationUtils uses an exclusive end.
      const clip = THREE.AnimationUtils.subclip(library, name, range.start, range.end + 1, 30);
      clips.set(name, { clip, loop: range.loop });
    }
  }
  return { scene, clips };
}

/** Clone one cached authored asset. Geometry and materials remain shared. */
export function cloneAsset(id: AssetId, clipName?: string): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.name = `GLB_${id}`;
  const loaded = loadedAssets.get(id);
  if (!loaded) {
    // Unit tests construct visual managers without running the browser preload.
    // The shipped game always preloads before creating Game.
    animationRuntimes.set(wrapper, { id, mixer: null, action: null, clipName: null });
    return wrapper;
  }
  wrapper.add(loaded.scene.clone(true));
  animationRuntimes.set(wrapper, { id, mixer: null, action: null, clipName: null });
  if (clipName) playAssetClip(wrapper, clipName, true);
  return wrapper;
}

export function playAssetClip(root: THREE.Object3D, clipName: string, restart = false, speed = 1): void {
  const runtime = animationRuntimes.get(root);
  if (!runtime) return;
  if (runtime.clipName === clipName && runtime.action && !restart) {
    runtime.action.timeScale = speed;
    return;
  }
  const spec = loadedAssets.get(runtime.id)?.clips.get(clipName);
  if (!spec) return;
  runtime.action?.stop();
  runtime.mixer ??= new THREE.AnimationMixer(root);
  const action = runtime.mixer.clipAction(spec.clip);
  action.reset();
  action.enabled = true;
  action.timeScale = speed;
  action.clampWhenFinished = !spec.loop;
  action.setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec.loop ? Infinity : 1);
  action.play();
  runtime.action = action;
  runtime.clipName = clipName;
}

export function updateAssetAnimation(root: THREE.Object3D, dt: number): void {
  animationRuntimes.get(root)?.mixer?.update(dt);
}

export function stopAssetAnimation(root: THREE.Object3D): void {
  const runtime = animationRuntimes.get(root);
  runtime?.mixer?.stopAllAction();
  if (runtime) {
    runtime.action = null;
    runtime.clipName = null;
  }
}

// --- Shared geometry/material cache for dynamic geometry and VFX ------------
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
  sphere: (r: number, seg = 10) =>
    cached(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2))),
  octa: (r: number) => cached(`octa${r}`, () => new THREE.OctahedronGeometry(r)),
  plane: (w: number, h: number) => cached(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
};

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

// --- Blob shadow -------------------------------------------------------------
export type BlobShadow = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

let blobTex: THREE.CanvasTexture | null = null;
export function blobShadow(radius: number): BlobShadow {
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

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Authored asset is missing required node ${name}`);
  return object as T;
}

// --- Hero cart ---------------------------------------------------------------
export interface CartModel {
  root: THREE.Group;
  hull: THREE.Group;
  wheels: THREE.Object3D[];
  lantern: THREE.Mesh;
  riderSocket: THREE.Object3D;
  animationRoot: THREE.Group;
  shield: THREE.Mesh;
  shadow: BlobShadow;
}

export function buildCart(): CartModel {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  const animationRoot = cloneAsset('minecart_hero');
  hull.add(animationRoot);
  root.add(hull);
  // The authored wheel_spin_loop clip drives these by name, so nothing reads
  // the handles at runtime. They are resolved anyway as an ASSET CONTRACT
  // CHECK: a re-export that drops or renames a node fails loudly here at boot
  // instead of silently shipping a cart with dead wheels.
  const wheels = ['ANIM_wheel_FL', 'ANIM_wheel_FR', 'ANIM_wheel_RL', 'ANIM_wheel_RR'].map((n) =>
    named<THREE.Object3D>(animationRoot, n),
  );
  const lantern = named<THREE.Mesh>(animationRoot, 'ANIM_sunheart_lantern');
  const riderSocket = named<THREE.Object3D>(animationRoot, 'SOCKET_rider');

  // A shield is a transient gameplay VFX rather than an authored world model.
  const shield = new THREE.Mesh(
    GEO.sphere(1.55, 14),
    mat(COLORS.shield, {
      emissive: COLORS.shield,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.22,
      rough: 0.2,
    }),
  );
  shield.position.y = 0.9;
  shield.scale.set(1, 0.85, 1.25);
  shield.visible = false;
  root.add(shield);

  // The shadow is deliberately NOT parented here: `root` is lifted by the jump
  // arc and rolled by the lean spring, which would carry the shadow off the
  // ground with it. CartController parents it to the track basis instead.
  const shadow = blobShadow(1.5);
  return { root, hull, wheels, lantern, riderSocket, animationRoot, shield, shadow };
}

// --- Rin ---------------------------------------------------------------------
export interface RinModel {
  root: THREE.Group;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  scarf: THREE.Object3D;
}

export function buildRin(): RinModel {
  const root = cloneAsset('rin_vale');
  // As with the cart wheels, these handles exist to assert the authored rig is
  // intact at boot — the embedded clips animate the nodes by name.
  return {
    root,
    torso: named(root, 'ANIM_torso'),
    head: named(root, 'ANIM_head'),
    armL: named(root, 'ANIM_arm_L'),
    armR: named(root, 'ANIM_arm_R'),
    scarf: named(root, 'ANIM_scarf'),
  };
}

// --- Iron Maw ----------------------------------------------------------------
export interface MawModel {
  root: THREE.Group;
  eyes: THREE.Mesh[];
  grinders: THREE.Object3D[];
}

export function buildMaw(): MawModel {
  const root = cloneAsset('iron_maw', 'chase_loop');
  return {
    root,
    eyes: [named(root, 'ANIM_eye_L'), named(root, 'ANIM_eye_R')],
    grinders: [0, 1, 2, 3, 4].map((i) => named(root, `ANIM_grinder_${i}`)),
  };
}

// --- Obstacles and power-ups -------------------------------------------------
export const buildBlockerCart = (): THREE.Group => cloneAsset('blocker_cart');
export const buildBrokenRail = (): THREE.Group => cloneAsset('broken_rail');
export const buildLowBeam = (): THREE.Group => cloneAsset('low_beam', 'chain_sway_loop');
export const buildGate = (): THREE.Group => cloneAsset('portcullis_gate', 'warning_shudder');
export const buildRockPile = (): THREE.Group => cloneAsset('rock_pile');
export const buildOncomingCart = (): THREE.Group => cloneAsset('oncoming_cart', 'approach_loop');
export const buildFireJet = (): THREE.Group => cloneAsset('fire_jet', 'flame_loop');
export const buildCrystalSpikes = (): THREE.Group => cloneAsset('crystal_spikes');
export const buildDebris = (): THREE.Group => cloneAsset('debris_cluster');

const POWERUP_IDS: Record<string, AssetId> = {
  magnet: 'powerup_magnet',
  shield: 'powerup_shield',
  ghost: 'powerup_ghost',
  frenzy: 'powerup_frenzy',
  repair: 'powerup_repair',
};

export function buildPowerup(kind: string): THREE.Group {
  return cloneAsset(POWERUP_IDS[kind] ?? 'powerup_repair', 'pickup_loop');
}

export type EnvironmentAssetId =
  | 'crystal_cluster_large'
  | 'crystal_cluster_small'
  | 'forge_gear'
  | 'forge_pipe'
  | 'rail_ballast_cluster'
  | 'ravine_tree'
  | 'rock_wall_cluster'
  | 'timber_support_arch'
  | 'timber_support_arch_b'
  | 'timber_support_arch_c'
  | 'torch_sconce'
  | 'waterfall_frame';

// Environment props are drawn exclusively through shared InstancedMeshes (see
// TrackView), which is what keeps the draw-call count flat as the world
// scrolls. They therefore have no AnimationMixer: their authored loop clips
// stay in ASSET_DEFS (so the models remain animatable) but are not played, and
// torch/magma motion is carried by the pulsing glow instances instead.

// --- Instanced authored assets ----------------------------------------------
export interface InstancedAsset {
  root: THREE.Group;
  meshes: THREE.InstancedMesh[];
  relativeMatrices: THREE.Matrix4[];
  count: number;
}

export function buildInstancedAsset(id: AssetId, count: number): InstancedAsset {
  const root = new THREE.Group();
  const meshes: THREE.InstancedMesh[] = [];
  const relativeMatrices: THREE.Matrix4[] = [];
  const source = loadedAssets.get(id)?.scene;
  if (source) {
    source.updateMatrixWorld(true);
    source.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const part = o as THREE.Mesh;
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
      mesh.name = `${id}_${part.name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      root.add(mesh);
      meshes.push(mesh);
      relativeMatrices.push(part.matrixWorld.clone());
    });
  }
  if (meshes.length === 0) {
    // Headless unit-test placeholder; runtime always has the preloaded GLB.
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), count);
    mesh.frustumCulled = false;
    root.add(mesh);
    meshes.push(mesh);
    relativeMatrices.push(new THREE.Matrix4());
  }
  return { root, meshes, relativeMatrices, count };
}
