// ---------------------------------------------------------------------------
// Renderer, scene, lighting, quality tiers, resize + context-loss handling.
// One key directional light + hemisphere fill. Blob shadows only (no shadow
// maps) — cheap and stable on low-end mobile.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { BIOMES, type BiomePalette } from './palette';

export type QualityTier = 'high' | 'medium' | 'low';

/** Camera-centred atmospheric sphere: one draw call, no textures, no seams. */
class SkyBackdrop {
  private topT = new THREE.Color();
  private horizonT = new THREE.Color();
  private bottomT = new THREE.Color();
  private accentT = new THREE.Color();
  private sunT = new THREE.Color();
  private sunStrengthT = 0;
  private starStrengthT = 0;
  private cloudStrengthT = 0;
  private uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(-0.36, 0.24, 0.90).normalize() },
    uSunStrength: { value: 0 },
    uStars: { value: 0 },
    uClouds: { value: 0 },
    uTime: { value: 0 },
  };
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        uniform vec3 uAccent;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uSunStrength;
        uniform float uStars;
        uniform float uClouds;
        uniform float uTime;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 color = mix(uBottom, uHorizon, smoothstep(-0.58, 0.06, h));
          color = mix(color, uTop, smoothstep(0.02, 0.86, h));

          float waves = sin(dir.x * 9.0 + dir.z * 13.0 + uTime * 0.025)
                      + sin(dir.z * 21.0 - dir.x * 5.0 - uTime * 0.018);
          float cloudBand = smoothstep(1.05, 1.70, waves)
                          * smoothstep(-0.08, 0.16, h)
                          * (1.0 - smoothstep(0.46, 0.76, h));
          color = mix(color, uAccent, cloudBand * uClouds * 0.24);

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float sunGlow = pow(sunDot, 18.0) * uSunStrength * 0.48;
          float sunDisc = smoothstep(0.9975, 0.9993, sunDot) * uSunStrength;
          color += uSunColor * sunGlow;
          color = mix(color, uSunColor, clamp(sunDisc, 0.0, 1.0));

          vec2 starCell = floor((dir.xz + dir.y * 0.37) * 190.0);
          float star = step(0.986, hash21(starCell))
                     * smoothstep(0.00, 0.28, h) * uStars;
          float twinkle = 0.72 + 0.28 * sin(uTime * 1.8 + hash21(starCell) * 20.0);
          color += mix(vec3(0.65, 0.86, 1.0), uAccent, 0.35) * star * twinkle;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 12), material);
    this.mesh.name = 'AtmosphericSky';
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  setBiome(b: BiomePalette, instant: boolean): void {
    this.topT.setHex(b.skyTop);
    this.horizonT.setHex(b.skyHorizon);
    this.bottomT.setHex(b.skyBottom);
    this.accentT.setHex(b.skyAccent);
    this.sunT.setHex(b.sunColor);
    this.sunStrengthT = b.sunStrength;
    this.starStrengthT = b.starStrength;
    this.cloudStrengthT = b.cloudStrength;
    if (instant) {
      this.uniforms.uTop.value.copy(this.topT);
      this.uniforms.uHorizon.value.copy(this.horizonT);
      this.uniforms.uBottom.value.copy(this.bottomT);
      this.uniforms.uAccent.value.copy(this.accentT);
      this.uniforms.uSunColor.value.copy(this.sunT);
      this.uniforms.uSunStrength.value = this.sunStrengthT;
      this.uniforms.uStars.value = this.starStrengthT;
      this.uniforms.uClouds.value = this.cloudStrengthT;
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    const k = Math.min(1, dt * 0.85);
    this.uniforms.uTop.value.lerp(this.topT, k);
    this.uniforms.uHorizon.value.lerp(this.horizonT, k);
    this.uniforms.uBottom.value.lerp(this.bottomT, k);
    this.uniforms.uAccent.value.lerp(this.accentT, k);
    this.uniforms.uSunColor.value.lerp(this.sunT, k);
    this.uniforms.uSunStrength.value += (this.sunStrengthT - this.uniforms.uSunStrength.value) * k;
    this.uniforms.uStars.value += (this.starStrengthT - this.uniforms.uStars.value) * k;
    this.uniforms.uClouds.value += (this.cloudStrengthT - this.uniforms.uClouds.value) * k;
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);
  }
}

export class Gfx {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly hemi: THREE.HemisphereLight;
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  quality: QualityTier = 'medium';
  private fogColor = new THREE.Color();
  private fogTarget = new THREE.Color();
  private skyColor = new THREE.Color();
  private skyTarget = new THREE.Color();
  private hemiSkyT = new THREE.Color();
  private hemiGroundT = new THREE.Color();
  private keyT = new THREE.Color();
  private rimT = new THREE.Color();
  private keyIntensityT = 1;
  private rimIntensityT = 0.6;
  private fogFarT = 110;
  private contextLost = false;
  private sky: SkyBackdrop;

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
    this.sky = new SkyBackdrop(this.scene);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 2.2);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 1.4);
    this.key.position.set(3, 10, -4);
    this.scene.add(this.key);
    // Soft fill from the camera side so the cart's rear face never goes black.
    const fill = new THREE.DirectionalLight(0xfff0dd, 0.5);
    fill.position.set(-2, 4, -8);
    this.scene.add(fill);
    // Colored opposing rim separates low-poly silhouettes from similarly dark
    // mountain walls and changes smoothly with each biome.
    this.rim = new THREE.DirectionalLight(0x66d8ff, 0.58);
    this.rim.position.set(-7, 5, 6);
    this.scene.add(this.rim);

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
    this.lastW = w;
    this.lastH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private lastW = 0;
  private lastH = 0;

  /**
   * Resize-on-demand: called every frame. Guarantees the drawing buffer matches
   * the displayed CSS size regardless of ResizeObserver timing (which never
   * fires on a non-painting tab), covering first-frame sizing + orientation.
   */
  syncSize(): void {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    if (w > 0 && h > 0 && (w !== this.lastW || h !== this.lastH)) {
      this.resize(w, h);
    }
  }

  /** Switch lighting/fog targets to a biome; blended per-frame in update(). */
  setBiome(b: BiomePalette, instant = false): void {
    this.fogTarget.setHex(b.fog);
    this.skyTarget.setHex(b.sky);
    this.hemiSkyT.setHex(b.hemiSky);
    this.hemiGroundT.setHex(b.hemiGround);
    this.keyT.setHex(b.keyLight);
    this.rimT.setHex(b.skyAccent);
    this.keyIntensityT = b.keyIntensity;
    this.rimIntensityT = 0.54 + b.sunStrength * 0.16;
    this.fogFarT = b.fogFar;
    if (instant) {
      this.fogColor.copy(this.fogTarget);
      this.skyColor.copy(this.skyTarget);
      this.hemi.color.copy(this.hemiSkyT);
      this.hemi.groundColor.copy(this.hemiGroundT);
      this.key.color.copy(this.keyT);
      this.key.intensity = this.keyIntensityT;
      this.rim.color.copy(this.rimT);
      this.rim.intensity = this.rimIntensityT;
      (this.scene.fog as THREE.Fog).far = this.fogFarT;
      this.applyFog();
    }
    this.sky.setBiome(b, instant);
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
    this.rim.color.lerp(this.rimT, k);
    this.key.intensity += (this.keyIntensityT - this.key.intensity) * k;
    this.rim.intensity += (this.rimIntensityT - this.rim.intensity) * k;
    const fog = this.scene.fog as THREE.Fog;
    fog.far += (this.fogFarT - fog.far) * k;
    fog.near = fog.far * 0.18;
    this.sky.update(dt, this.camera);
    this.applyFog();
  }

  render(): void {
    if (this.contextLost) return;
    this.sky.mesh.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
