// ---------------------------------------------------------------------------
// Pooled particle system: one InstancedMesh, zero allocation after startup.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GEO } from './assets';

const MAX = 320;

interface P {
  life: number;
  maxLife: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  gravity: number;
  drag: number;
}

const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

export class Particles {
  mesh: THREE.InstancedMesh;
  private pool: P[] = [];
  private colors = new Float32Array(MAX * 3);
  private count = 0;

  constructor(scene: THREE.Scene, private cap = MAX) {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.InstancedMesh(GEO.octa(0.5), m, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < this.cap; i++) {
      this.pool.push({ life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, gravity: 0, drag: 0 });
      this.mesh.setColorAt(i, tmpC.setHex(0xffffff));
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  spawn(
    pos: THREE.Vector3,
    color: number,
    n: number,
    opts: { speed?: number; up?: number; size?: number; life?: number; gravity?: number; spread?: number } = {},
  ): void {
    const speed = opts.speed ?? 4;
    const up = opts.up ?? 2.5;
    const size = opts.size ?? 0.14;
    const life = opts.life ?? 0.6;
    const gravity = opts.gravity ?? 9;
    const spread = opts.spread ?? 1;
    tmpC.setHex(color);
    for (let k = 0; k < n; k++) {
      const p = this.pool[this.count % this.cap];
      const i = this.count % this.cap;
      this.count++;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      p.life = p.maxLife = life * (0.6 + Math.random() * 0.7);
      p.x = pos.x + (Math.random() - 0.5) * spread;
      p.y = pos.y + (Math.random() - 0.5) * spread * 0.5;
      p.z = pos.z + (Math.random() - 0.5) * spread;
      p.vx = Math.cos(a) * r;
      p.vz = Math.sin(a) * r;
      p.vy = up * (0.4 + Math.random());
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
      p.drag = 1.5;
      this.colors[i * 3] = tmpC.r;
      this.colors[i * 3 + 1] = tmpC.g;
      this.colors[i * 3 + 2] = tmpC.b;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      const p = this.pool[i];
      if (p.life <= 0) {
        tmpM.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, tmpM);
        continue;
      }
      p.life -= dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.size * Math.max(0.05, p.life / p.maxLife);
      tmpM.makeScale(s, s, s);
      tmpM.setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, tmpM);
      tmpC.setRGB(this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]);
      this.mesh.setColorAt(i, tmpC);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    for (const p of this.pool) p.life = 0;
  }
}
