// ---------------------------------------------------------------------------
// Renderer, scene, lighting, quality tiers, resize + context-loss handling.
// One key directional light + hemisphere fill. Blob shadows only (no shadow
// maps) — cheap and stable on low-end mobile.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { BIOMES, type BiomePalette } from './palette';

export type QualityTier = 'high' | 'medium' | 'low';

export class Gfx {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly hemi: THREE.HemisphereLight;
  readonly key: THREE.DirectionalLight;
  quality: QualityTier = 'medium';
  private fogColor = new THREE.Color();
  private fogTarget = new THREE.Color();
  private skyColor = new THREE.Color();
  private skyTarget = new THREE.Color();
  private hemiSkyT = new THREE.Color();
  private hemiGroundT = new THREE.Color();
  private keyT = new THREE.Color();
  private keyIntensityT = 1;
  private fogFarT = 110;
  private contextLost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 25, 110);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 2.2);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 1.4);
    this.key.position.set(3, 10, -4);
    this.scene.add(this.key);
    // Soft fill from the camera side so the cart's rear face never goes black.
    const fill = new THREE.DirectionalLight(0xfff0dd, 0.5);
    fill.position.set(-2, 4, -8);
    this.scene.add(fill);

    this.detectQuality();
    this.applyQuality();
    this.setBiome(BIOMES[0], true);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });
  }

  private detectQuality(): void {
    // Non-blocking heuristic probe: device memory, cores, screen size.
    const nav = navigator as Navigator & { deviceMemory?: number };
    const mem = nav.deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const pixels = screen.width * screen.height * (devicePixelRatio || 1);
    if (mem >= 6 && cores >= 8 && pixels < 4_500_000) this.quality = 'high';
    else if (mem <= 2 || cores <= 3) this.quality = 'low';
    else this.quality = 'medium';
  }

  private applyQuality(): void {
    const dprCap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.75 : 1.25;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));
  }

  /** Resize to CSS size of the canvas parent. Never resets game state. */
  resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Switch lighting/fog targets to a biome; blended per-frame in update(). */
  setBiome(b: BiomePalette, instant = false): void {
    this.fogTarget.setHex(b.fog);
    this.skyTarget.setHex(b.sky);
    this.hemiSkyT.setHex(b.hemiSky);
    this.hemiGroundT.setHex(b.hemiGround);
    this.keyT.setHex(b.keyLight);
    this.keyIntensityT = b.keyIntensity;
    this.fogFarT = b.fogFar;
    if (instant) {
      this.fogColor.copy(this.fogTarget);
      this.skyColor.copy(this.skyTarget);
      this.hemi.color.copy(this.hemiSkyT);
      this.hemi.groundColor.copy(this.hemiGroundT);
      this.key.color.copy(this.keyT);
      this.key.intensity = this.keyIntensityT;
      (this.scene.fog as THREE.Fog).far = this.fogFarT;
      this.applyFog();
    }
  }

  private applyFog(): void {
    (this.scene.fog as THREE.Fog).color.copy(this.fogColor);
    this.renderer.setClearColor(this.skyColor);
  }

  update(dt: number): void {
    // Smooth biome ambience blending.
    const k = Math.min(1, dt * 1.4);
    this.fogColor.lerp(this.fogTarget, k);
    this.skyColor.lerp(this.skyTarget, k);
    this.hemi.color.lerp(this.hemiSkyT, k);
    this.hemi.groundColor.lerp(this.hemiGroundT, k);
    this.key.color.lerp(this.keyT, k);
    this.key.intensity += (this.keyIntensityT - this.key.intensity) * k;
    const fog = this.scene.fog as THREE.Fog;
    fog.far += (this.fogFarT - fog.far) * k;
    fog.near = fog.far * 0.18;
    this.applyFog();
  }

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }
}
