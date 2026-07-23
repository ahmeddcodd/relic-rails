// Regression guard for the reported "Rin's head goes through the ground" bug.
//
// Rin is rigidly parented to the cart's SOCKET_rider, so the cart's authored
// crash clip and Rin's own clip COMPOSE. Playing both drove her head 2.26 m
// below the deck. This test replays the real transform chain against the actual
// GLB animation data and asserts her silhouette stays above the rail plane.
//
// It reads the shipped GLBs and manifests directly, so re-exporting an asset
// with a bigger tumble fails here instead of in someone's face at runtime.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { TUNING } from '../../src/config/tuning';
import { CRASH_CLIPS } from '../../src/game/cart';
import { sampleCrashMotion } from '../../src/game/crashMotion';

const ASSETS = fileURLToPath(new URL('../../READY_TO_USE_ASSETS/', import.meta.url));
const FPS = 30;

interface Track {
  times: Float32Array;
  values: Float32Array;
  size: number;
}

interface Asset {
  nodes: Array<{ name: string; translation?: number[]; children?: number[] }>;
  tracks: Map<string, Track>;
  clips: Map<string, { start: number; end: number }>;
  height: number;
}

function loadAsset(dir: string, file: string): Asset {
  const buf = readFileSync(`${ASSETS}${dir}/${file}.glb`);
  let offset = 12;
  let gltf: Record<string, never> | null = null;
  let bin: Buffer | null = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + len;
  }
  const g = gltf as unknown as {
    nodes: Array<{ name: string; translation?: number[]; children?: number[] }>;
    accessors: Array<{ bufferView: number; byteOffset?: number; count: number; type: string }>;
    bufferViews: Array<{ byteOffset?: number }>;
    animations: Array<{
      channels: Array<{ sampler: number; target: { node: number; path: string } }>;
      samplers: Array<{ input: number; output: number }>;
    }>;
  };
  const data = bin as Buffer;
  const read = (i: number): Float32Array => {
    const a = g.accessors[i];
    const bv = g.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type] ?? 1;
    const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new Float32Array(data.buffer, data.byteOffset + start, size * a.count);
  };

  const tracks = new Map<string, Track>();
  for (const ch of g.animations[0].channels) {
    const s = g.animations[0].samplers[ch.sampler];
    const times = read(s.input);
    const values = read(s.output);
    tracks.set(`${g.nodes[ch.target.node].name}.${ch.target.path}`, {
      times,
      values,
      size: values.length / times.length,
    });
  }

  const manifest = JSON.parse(readFileSync(`${ASSETS}${dir}/asset_manifest.json`, 'utf8')) as {
    animation: { clips: Array<{ name: string; start: number; end: number }> };
    boundsBlenderMetres: { max: number[] };
  };
  const clips = new Map(manifest.animation.clips.map((c) => [c.name, { start: c.start, end: c.end }]));

  return { nodes: g.nodes, tracks, clips, height: manifest.boundsBlenderMetres.max[2] };
}

/** Sample a track at an absolute library time, matching the mixer's interpolation. */
function sample(track: Track | undefined, time: number, out: THREE.Vector3 | THREE.Quaternion): void {
  if (!track) return;
  const { times, values, size } = track;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] < time) i++;
  const j = Math.min(i + 1, times.length - 1);
  const span = times[j] - times[i];
  const t = span > 0 ? Math.min(1, Math.max(0, (time - times[i]) / span)) : 0;
  if (out instanceof THREE.Quaternion) {
    const a = new THREE.Quaternion().fromArray(Array.from(values.slice(i * size, i * size + 4)));
    const b = new THREE.Quaternion().fromArray(Array.from(values.slice(j * size, j * size + 4)));
    out.copy(a).slerp(b, t);
  } else {
    out.set(
      values[i * size] + (values[j * size] - values[i * size]) * t,
      values[i * size + 1] + (values[j * size + 1] - values[i * size + 1]) * t,
      values[i * size + 2] + (values[j * size + 2] - values[i * size + 2]) * t,
    );
  }
}

/**
 * Lowest Y (in the track basis, where 0 IS the deck) reached by the top of
 * Rin's silhouette across the whole crash. Inverted, that point is her lowest.
 */
function lowestRiderPoint(rinClipName: string, rollScale: number): number {
  const cart = loadAsset('minecart_hero', 'minecart_hero');
  const rin = loadAsset('rin_vale', 'rin_vale');

  const socketNode = cart.nodes.find((n) => n.name === 'SOCKET_rider');
  if (!socketNode?.translation) throw new Error('SOCKET_rider is missing its transform');
  const socket = new THREE.Vector3().fromArray(socketNode.translation);
  // The topmost point of Rin's authored silhouette (Blender is Z-up).
  const headTop = new THREE.Vector3(0, rin.height, 0);

  const cartClip = cart.clips.get(CRASH_CLIPS.cart);
  const rinClip = rin.clips.get(rinClipName);
  if (!cartClip || !rinClip) throw new Error(`Missing authored clip ${rinClipName}`);
  // AnimationUtils.subclip(lib, name, start, end + 1, 30) keeps frames
  // [start, end] and shifts them to t = 0, so library time = start/FPS + local.
  const cartDur = (cartClip.end + 1 - cartClip.start) / FPS;
  const rinDur = (rinClip.end + 1 - rinClip.start) / FPS;

  const cartRot = new THREE.Quaternion();
  const cartPos = new THREE.Vector3();
  const rinRot = new THREE.Quaternion();
  const rinPos = new THREE.Vector3();
  const point = new THREE.Vector3();

  let lowest = Infinity;
  const steps = 240;
  for (let s = 0; s <= steps; s++) {
    const elapsed = (s / steps) * TUNING.cart.crashDuration;
    // clampWhenFinished holds the last pose once a clip runs out.
    const cartT = cartClip.start / FPS + Math.min(elapsed * rollScale, cartDur);
    const rinT = rinClip.start / FPS + Math.min(elapsed, rinDur);

    sample(cart.tracks.get('minecart_hero.rotation'), cartT, cartRot);
    sample(cart.tracks.get('minecart_hero.translation'), cartT, cartPos);
    sample(rin.tracks.get('rin_vale.rotation'), rinT, rinRot);
    sample(rin.tracks.get('rin_vale.translation'), rinT, rinPos);

    // model.hull offset -> minecart_hero -> SOCKET_rider -> rin_vale -> head top
    const motion = sampleCrashMotion(elapsed, 1, TUNING.cart.crashDuration);
    point.copy(headTop).applyQuaternion(rinRot).add(rinPos).add(socket);
    point.applyQuaternion(cartRot).add(cartPos);
    lowest = Math.min(lowest, point.y + motion.lift);
  }
  return lowest;
}

describe('crash deck clearance', () => {
  it('does not stack Rin\'s own crash clip onto the cart roll', () => {
    // Both clips animate their own root node, and Rin hangs off SOCKET_rider.
    expect(CRASH_CLIPS.rin).not.toBe('crash');
  });

  it('keeps the rider above the deck for the whole crash', () => {
    const lowest = lowestRiderPoint(CRASH_CLIPS.rin, TUNING.cart.crashRollScale);
    expect(lowest).toBeGreaterThan(0);
  });

  it('proves the guard is live: the old clip pairing sank through the deck', () => {
    // Sensitivity check — if this stops failing, the simulation above has
    // drifted from reality and the passing test means nothing.
    const old = lowestRiderPoint('crash', 1);
    expect(old).toBeLessThan(-1);
  });

  it('scales the cart roll back from a full barrel roll', () => {
    expect(TUNING.cart.crashRollScale).toBeLessThan(1);
    expect(TUNING.cart.crashRollScale).toBeGreaterThan(0.3);
  });
});
