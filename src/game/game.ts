// ---------------------------------------------------------------------------
// Game — central state machine + run loop. Owns every system; nothing else
// talks to the platform bridge directly.
// States: loading → menu ⇄ running → crashing → results → (menu | running)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import { createBridge, type PlatformBridge } from '../platform/bridge';
import { SaveManager } from '../platform/save';
import { Gfx } from '../render/gfx';
import { BIOMES } from '../render/palette';
import { Particles } from '../render/particles';
import { AudioSys } from '../audio/audio';
import { InputManager } from './input';
import { TrackPath, TrackView } from './track';
import { ObstacleManager, CollectibleManager, OBSTACLE_SPECS, type PowerupKind } from './entities';
import { CartController } from './cart';
import { CameraRig } from './camera';
import { Director, validatePlan } from './director';
import { ForkVisual } from './fork';
import { ScoreSystem, OverdriveSystem, PowerUpSystem, ChaseSystem, COMBO_NAMES } from './systems';
import { UI, rankFor } from '../ui/ui';

type State = 'loading' | 'menu' | 'running' | 'crashing' | 'results';

const tmpV = new THREE.Vector3();
const DEV = import.meta.env.DEV;
const FORK_REVEAL_DIST = 100; // metres before the split that both branches appear
const FORK_COMMIT_LEAD = 15; // metres before the split that the choice locks in

export class Game {
  private bridge: PlatformBridge;
  private save: SaveManager;
  private gfx: Gfx;
  private ui: UI;
  private input: InputManager;
  private audio = new AudioSys();
  private particles: Particles;

  private path = new TrackPath();
  private director: Director;
  private view: TrackView;
  private obstacles: ObstacleManager;
  private collectibles: CollectibleManager;
  private cart: CartController;
  private camera: CameraRig;
  private chase: ChaseSystem;
  private forkVisual!: ForkVisual;
  private score = new ScoreSystem();
  private od = new OverdriveSystem();
  private pu = new PowerUpSystem();

  private state: State = 'loading';
  private paused = false;
  private pausedByPlatform = false;
  private lastT = 0;
  private runSeed = 1;
  private crashTimer = 0;
  private caughtByMaw = false;
  private airStart = -1;
  private collectStreak = 0;
  private lastCollectAt = 0;
  private lastSwitchAt = -9;
  private biomeIdx = 0;
  private odTrailAcc = 0;
  private tutorialActive = false;
  private tutorialStep = 0;
  private menuOrbit = 0;
  private validateTimer = 0;
  private forkShown = false;
  private lastForkSide: -1 | 1 = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.bridge = createBridge();
    this.save = new SaveManager(this.bridge);
    this.gfx = new Gfx(canvas);
    this.particles = new Particles(this.gfx.scene);
    this.input = new InputManager(document.getElementById('app')!);

    this.obstacles = new ObstacleManager(this.path, this.gfx.scene);
    this.collectibles = new CollectibleManager(this.path, this.gfx.scene);
    this.director = new Director(this.path, this.obstacles, this.collectibles);
    this.view = new TrackView(this.path, this.gfx.scene, this.director.biomeAt, this.gfx.quality);
    this.chase = new ChaseSystem(this.path, this.gfx.scene);
    this.forkVisual = new ForkVisual(this.path, this.gfx.scene);
    this.cart = new CartController(this.path, this.gfx.scene, {
      onSwitch: (dir) => {
        this.lastSwitchAt = performance.now() / 1000;
        this.audio.switch();
        this.haptic(12);
        this.sparks(dir);
      },
      onJump: () => {
        this.audio.jump();
        this.airStart = performance.now() / 1000;
      },
      onLand: () => {
        this.audio.land();
        this.haptic(10);
        this.cart.root.matrix.decompose(tmpV, tmpQ, tmpS);
        this.particles.spawn(tmpV, 0x8a6a4a, 6, { speed: 2.5, up: 1.5, size: 0.1, life: 0.5 });
        if (this.airStart >= 0) {
          this.score.airTime(performance.now() / 1000 - this.airStart);
          this.airStart = -1;
        }
      },
      onDuck: () => this.audio.duck(),
    });
    this.camera = new CameraRig(this.gfx.camera, this.path);

    this.ui = new UI({
      onRide: () => this.startRun(),
      onRideAgain: () => this.startRun(),
      onToMenu: () => this.toMenu(),
      onOverdrive: () => this.tryOverdrive(),
      onResume: () => this.setPaused(false, false),
      onSettingChanged: (k, v) => {
        this.save.data.settings[k] = v;
        this.applySettings();
        this.save.save();
      },
      getSettings: () => this.save.data.settings,
    });

    // Platform lifecycle
    this.bridge.onPause(() => this.setPaused(true, true));
    this.bridge.onResume(() => {
      if (this.pausedByPlatform) this.setPaused(false, true);
    });
    void this.bridge.isAudioEnabled().then((on) => {
      this.audio.platformAudio = on;
      this.audio.applyMix();
    });
    this.bridge.onAudioEnabledChange((on) => {
      this.audio.platformAudio = on;
      this.audio.applyMix();
    });

    // Resize — never resets game state.
    const app = document.getElementById('app')!;
    new ResizeObserver(() => {
      this.gfx.resize(app.clientWidth, app.clientHeight);
    }).observe(app);
    this.gfx.resize(app.clientWidth, app.clientHeight);

    // First user gesture anywhere unlocks audio (no autoplay).
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  // --- boot -------------------------------------------------------------------
  async boot(): Promise<void> {
    this.ui.setLoadProgress(0.25);
    // Pre-generate the opening stretch so the menu shows a real world.
    this.director.reset(1, false);
    this.director.update(0, 0);
    this.view.update(0);
    this.camera.snap(this.cart);

    // First real visual frame → firstFrameReady (loading screen + world).
    this.gfx.render();
    this.bridge.firstFrameReady();
    this.ui.setLoadProgress(0.6);

    // loadData must complete before any saveData.
    await this.save.load();
    this.applySettings();
    this.ui.setLoadProgress(1);

    this.toMenu();
    this.ui.showLoading(false);
    // Player can interact now — and only now.
    this.bridge.gameReady();

    this.lastT = performance.now();
    requestAnimationFrame(this.frame);
  }

  private applySettings(): void {
    const s = this.save.data.settings;
    this.audio.musicOn = s.music;
    this.audio.sfxOn = s.sfx;
    this.audio.applyMix();
    this.camera.reducedShake = s.reducedFx;
  }

  private haptic(ms: number): void {
    if (!this.save.data.settings.haptics) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* unsupported — fine */
    }
  }

  // --- state transitions --------------------------------------------------------
  private toMenu(): void {
    this.state = 'menu';
    this.input.gameplayEnabled = false;
    this.ui.showResults(false);
    this.ui.showHud(false);
    this.ui.showMenu(true, this.save.data);
    this.resetWorld(false);
  }

  private resetWorld(tutorial: boolean): void {
    this.runSeed = (this.runSeed * 16807 + 13) % 2147483647;
    this.path.reset();
    this.obstacles.reset();
    this.collectibles.reset();
    this.view.reset();
    this.director.reset(this.runSeed, tutorial);
    this.director.update(0, 0);
    this.cart.reset();
    this.score.reset();
    this.od.reset();
    this.pu.reset();
    this.chase.reset();
    this.forkVisual.reset();
    this.forkShown = false;
    this.ui.tutorialPrompt(null);
    this.particles.clear();
    this.biomeIdx = 0;
    this.gfx.setBiome(BIOMES[0], true);
    this.view.update(0);
    this.cart.update(0.0001); // apply initial transform
    this.camera.snap(this.cart);
  }

  private startRun(): void {
    this.audio.unlock();
    this.tutorialActive = !this.save.data.tutorialDone;
    this.tutorialStep = 0;
    this.caughtByMaw = false;
    this.resetWorld(this.tutorialActive);
    this.state = 'running';
    this.input.gameplayEnabled = true;
    this.input.clear();
    this.ui.showMenu(false);
    this.ui.showResults(false);
    this.ui.showHud(true);
    this.audio.button();
  }

  private endRun(): void {
    this.state = 'results';
    this.input.gameplayEnabled = false;
    const d = this.save.data;
    const sc = Math.round(this.score.score);
    const dist = this.cart.dist;
    const isNewBest = sc > d.bestScore;
    if (isNewBest) {
      d.bestScore = sc;
      this.audio.newBest();
    }
    d.bestDistance = Math.max(d.bestDistance, Math.round(dist));
    d.totalEmber += this.score.emberCount;
    d.totalPrism += this.score.prismCount;
    d.totalRuns += 1;
    d.lifetimeDistance += Math.round(dist);
    this.save.flush();
    // Submitted score must match saved best.
    if (isNewBest) void this.bridge.sendScore(d.bestScore);

    this.ui.showHud(false);
    this.ui.showResults(true, {
      score: sc,
      best: d.bestScore,
      isNewBest,
      distance: dist,
      ember: this.score.emberCount,
      prism: this.score.prismCount,
      bestCombo: this.score.bestComboTier,
      caught: this.caughtByMaw,
      rank: rankFor(d.bestScore),
    });
  }

  private setPaused(on: boolean, byPlatform: boolean): void {
    if (on === this.paused) return;
    this.paused = on;
    this.pausedByPlatform = on && byPlatform;
    if (on) {
      this.audio.pause();
      this.ui.showPause(this.state === 'running' || this.state === 'crashing');
    } else {
      this.audio.resume();
      this.ui.showPause(false);
      this.lastT = performance.now(); // don't integrate the paused gap
    }
  }

  private tryOverdrive(): void {
    if (this.state !== 'running') return;
    if (this.od.tryActivate()) {
      this.audio.overdriveStart();
      this.haptic(40);
      this.score.extraMult = TUNING.overdrive.scoreMult * (this.pu.frenzy ? TUNING.powerups.frenzyMult : 1);
      this.camera.fovBonus = TUNING.overdrive.fovBoost;
      this.cart.speedMult = 1 + TUNING.speed.overdriveBonus / this.cart.targetSpeed;
      this.ui.skillLabel('SUNHEART OVERDRIVE!', 'tier');
    }
  }

  // --- main loop ---------------------------------------------------------------
  private frame = (t: number): void => {
    requestAnimationFrame(this.frame);
    if (this.paused) return;
    const dt = Math.min(0.05, Math.max(0.0005, (t - this.lastT) / 1000));
    this.lastT = t;

    switch (this.state) {
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'running':
        this.updateRunning(dt, t / 1000);
        break;
      case 'crashing':
        this.updateCrashing(dt);
        break;
      case 'results':
        this.updateMenuish(dt);
        break;
      case 'loading':
        break;
    }

    this.gfx.syncSize();
    this.gfx.update(dt);
    this.particles.update(dt);
    this.gfx.render();
  };

  private updateMenu(dt: number): void {
    // Slow showcase orbit around the cart.
    this.menuOrbit += dt * 0.25;
    const r = 7.5;
    this.path.getPoint(this.cart.dist, 0, tmpV);
    this.gfx.camera.position.set(
      tmpV.x + Math.sin(this.menuOrbit) * r,
      tmpV.y + 3.4,
      tmpV.z + Math.cos(this.menuOrbit) * r,
    );
    this.gfx.camera.lookAt(tmpV.x, tmpV.y + 1, tmpV.z);
    this.input.drain();
  }

  private updateMenuish(_dt: number): void {
    this.input.drain();
  }

  private updateRunning(dt: number, now: number): void {
    // Input
    for (const a of this.input.drain()) {
      if (a === 'left' || a === 'right' || a === 'jump' || a === 'duck') {
        this.cart.act(a);
      } else if (a === 'overdrive') {
        this.tryOverdrive();
      } else if (a === 'pause' && !this.bridge.isYouTube) {
        this.setPaused(true, false);
      }
    }

    // Fork: reveal the split as it nears, then lock in the player's chosen side
    // BEFORE director.update so the path branches this same frame.
    if (this.director.forkPending) {
      const j = this.director.forkDist;
      if (!this.forkShown && this.cart.dist > j - FORK_REVEAL_DIST) {
        this.forkShown = true;
        this.forkVisual.showSplit(j, BIOMES[this.director.biomeAt(j)].wall);
        this.ui.tutorialPrompt('<span class="big">◀   ▶</span>PICK A PATH — swipe left or right');
        this.audio.powerup();
      }
      if (this.cart.dist > j - FORK_COMMIT_LEAD) {
        const lane = this.cart.laneIdx;
        const side: -1 | 1 = lane === 0 ? -1 : lane === 2 ? 1 : this.lastForkSide;
        this.lastForkSide = side;
        this.director.commitFork(side);
        this.forkVisual.commit(side);
        this.forkShown = false;
        this.ui.tutorialPrompt(null);
        this.ui.skillLabel(side < 0 ? 'LEFT PATH!' : 'RIGHT PATH!', 'tier');
        this.audio.switch();
        this.haptic(18);
      }
    }

    // Systems
    this.director.update(dt, this.cart.dist);
    this.cart.targetSpeed = this.director.targetSpeed;
    this.cart.update(dt);
    this.view.update(this.cart.dist);
    this.forkVisual.update(this.cart.dist);
    this.obstacles.update(dt, this.cart.dist);
    this.pu.update(dt);
    if (this.od.update(dt)) {
      // overdrive just expired
      this.score.extraMult = this.pu.frenzy ? TUNING.powerups.frenzyMult : 1;
      this.camera.fovBonus = 0;
      this.cart.speedMult = 1;
    }
    this.score.update(dt);
    this.score.addDistance(this.cart.speed * dt);
    this.chase.update(dt, this.cart.dist, false);
    this.camera.update(dt, this.cart, this.chase.pressure);

    // Overdrive trail
    if (this.od.active) {
      this.odTrailAcc += dt;
      if (this.odTrailAcc > 0.06) {
        this.odTrailAcc = 0;
        this.path.getPoint(this.cart.dist - 1.2, this.cart.lateral, tmpV);
        tmpV.y += 0.4 + this.cart.y;
        this.particles.spawn(tmpV, 0xffc94d, 2, { speed: 1, up: 0.5, size: 0.16, life: 0.5, gravity: 0 });
      }
    }

    // Collectibles
    const magnet = this.pu.magnet || this.od.active;
    this.collectibles.update(dt, this.cart.dist, this.cart.lateral, this.cart.y, magnet, {
      onEmber: (pos, trailDone) => {
        this.collectStreak = now - this.lastCollectAt < 1.2 ? this.collectStreak + 1 : 1;
        this.lastCollectAt = now;
        this.score.ember();
        this.od.fill(TUNING.overdrive.fillEmber);
        this.audio.collect(this.collectStreak);
        this.particles.spawn(pos, 0xffa826, 4, { speed: 2, up: 2, size: 0.09, life: 0.4, gravity: 3 });
        if (trailDone) {
          this.score.trailComplete();
          this.od.fill(TUNING.overdrive.fillNearMiss);
          this.ui.skillLabel('TRAIL COMPLETE!', 'perfect');
          this.audio.perfect();
        }
      },
      onPrism: (pos) => {
        this.score.prism();
        this.od.fill(TUNING.overdrive.fillPrism);
        this.audio.prism();
        this.haptic(20);
        this.particles.spawn(pos, 0xc06cff, 12, { speed: 3.5, up: 3, size: 0.12, life: 0.7, gravity: 2 });
        this.ui.skillLabel('PRISM SHARD!', 'tier');
      },
      onPowerup: (kind, pos) => this.activatePowerup(kind, pos),
    });

    // Collisions + scoring for obstacles
    this.resolveObstacles(now);

    // Caught by the Maw?
    if (this.chase.caught) {
      this.caughtByMaw = true;
      this.startCrash();
      return;
    }

    // Biome ambience
    const bi = this.director.biomeAt(this.cart.dist + 30);
    if (bi !== this.biomeIdx) {
      this.biomeIdx = bi;
      this.gfx.setBiome(BIOMES[bi]);
      this.ui.skillLabel(BIOMES[bi].name.toUpperCase(), 'tier');
    }

    // Tutorial prompts
    if (this.tutorialActive) this.updateTutorial();

    // Overdrive ready ping
    if (this.od.ready && !this.odWasReady) {
      this.audio.overdriveReady();
      this.haptic(25);
    }
    this.odWasReady = this.od.ready;

    // Audio dynamics
    this.audio.setDynamics(
      Math.min(1, this.cart.speed / TUNING.speed.max),
      this.chase.pressure,
      (this.score.comboTier - 1) / 4 + (this.od.active ? 0.4 : 0),
    );

    // HUD
    this.pushHud();

    // Dev-only fairness validation (throttled)
    if (DEV) {
      this.validateTimer += dt;
      if (this.validateTimer > 5) {
        this.validateTimer = 0;
        // Only judge upcoming content — passed rows were paced for an earlier phase.
        const ahead = this.director.plan.filter((p) => p.dist > this.cart.dist);
        const issues = validatePlan(
          ahead,
          this.obstacles.list.map((o) => ({ dist: o.dist, lane: o.lane, type: o.type })),
          this.director.targetSpeed * TUNING.fairness.reactionTime,
        );
        for (const i of issues) console.warn('[fairness]', i.kind, i.detail, '@', Math.round(i.dist));
      }
    }
  }
  private odWasReady = false;

  private activatePowerup(kind: PowerupKind, pos: THREE.Vector3): void {
    this.audio.powerup();
    this.haptic(18);
    this.particles.spawn(pos, 0x3ef0a0, 10, { speed: 3, up: 2.5, size: 0.11, life: 0.6 });
    switch (kind) {
      case 'magnet':
        this.pu.magnetT = TUNING.powerups.magnetTime;
        this.ui.skillLabel('MAGNETIC COUPLER!', 'nearmiss');
        break;
      case 'shield':
        this.pu.shield = true;
        this.cart.model.shield.visible = true;
        this.ui.skillLabel('AEGIS PLATE!', 'nearmiss');
        break;
      case 'ghost':
        this.pu.ghostT = TUNING.powerups.ghostTime;
        this.ui.skillLabel('GHOST WHEELS!', 'nearmiss');
        break;
      case 'frenzy':
        this.pu.frenzyT = TUNING.powerups.frenzyTime;
        this.score.extraMult = TUNING.powerups.frenzyMult * (this.od.active ? TUNING.overdrive.scoreMult : 1);
        this.ui.skillLabel('SHARD FRENZY!', 'nearmiss');
        break;
      case 'repair':
        this.chase.relievePressure(0.45);
        this.cart.stumbleT = 0;
        this.ui.skillLabel('REPAIR SPARK!', 'nearmiss');
        break;
    }
  }

  private resolveObstacles(now: number): void {
    const cartHalf = 0.95;
    for (const o of this.obstacles.list) {
      if (o.resolved) continue;
      const spec = OBSTACLE_SPECS[o.type];
      const gapAhead = o.dist - this.cart.dist;

      // Oncoming cart horn telegraph
      if (o.type === 'oncoming' && !o.warned && gapAhead < 75) {
        o.warned = true;
        this.audio.horn();
      }

      const laneLat = TUNING.track.laneOffsets[o.lane];
      const overlap = Math.abs(gapAhead) < spec.halfLen + cartHalf;
      const sameLane = Math.abs(laneLat - this.cart.lateral) < 1.35;

      if (overlap && sameLane) {
        // Is the cart clearing it? A jump obstacle is cleared whenever the cart
        // is airborne across the overlap (runner-standard) — being mid-jump over
        // the obstacle IS the clear, so a well-timed swipe never clips on the
        // rise or the descent. Landing on it (grounded mid-overlap) still fails.
        const cleared =
          (spec.action === 'jump' && this.cart.airborne) ||
          (spec.action === 'duck' && this.cart.ducking) ||
          (spec.action === 'none' && (this.cart.airborne || this.cart.y >= spec.clearHeight));
        if (!cleared) {
          // Ghost wheels phase through gaps/debris; overdrive shreds debris.
          const ghosted = this.pu.ghost && (o.type === 'gap' || o.type === 'debris');
          const shredded = this.od.active && !spec.major;
          if (ghosted) continue;
          // Brief post-stumble mercy: CONSUME a co-located hazard (so it can't be
          // mis-scored as "passed") without a second hit. The window is short
          // (TUNING.speed.mercyTime) so it only ever spares a hazard essentially
          // on top of the stumble — never lets the cart phase a separate wall.
          if (this.cart.invulnerable) {
            o.resolved = true;
            continue;
          }
          if (shredded) {
            o.resolved = true;
            this.smashObstacle(o.dist, laneLat);
            continue;
          }
          if (!spec.major) {
            o.resolved = true;
            this.minorHit(o.dist, laneLat);
            continue;
          }
          if (this.od.active && spec.action !== 'jump' && o.type !== 'gap') {
            // Overdrive protects against a single major scrape → treat as minor
            o.resolved = true;
            this.minorHit(o.dist, laneLat);
            continue;
          }
          if (this.pu.shield) {
            this.pu.shield = false;
            this.cart.model.shield.visible = false;
            o.resolved = true;
            this.smashObstacle(o.dist, laneLat);
            this.ui.skillLabel('AEGIS SAVED YOU!', 'nearmiss');
            this.audio.stumble();
            this.haptic(30);
            this.chase.addPressure(TUNING.chase.grazeAdd);
            continue;
          }
          o.resolved = true;
          this.startCrash();
          return;
        }
      }

      // Passed it → score
      if (gapAhead < -(spec.halfLen + cartHalf + 0.1)) {
        o.resolved = true;
        if (spec.action === 'jump' || spec.action === 'none') {
          if (this.cart.airborne || this.cart.y > 0.2) this.perfectLabel(`PERFECT JUMP`);
        } else if (spec.action === 'duck') {
          if (this.cart.ducking) this.perfectLabel(`PERFECT DUCK`);
        } else if (spec.action === 'switch') {
          const latDiff = Math.abs(laneLat - this.cart.lateral);
          if (latDiff < 3.3) {
            if (now - this.lastSwitchAt < 0.65) this.perfectLabel('PERFECT SWITCH');
            else {
              this.score.nearMiss();
              this.od.fill(TUNING.overdrive.fillNearMiss);
              this.ui.skillLabel('NEAR MISS!', 'nearmiss');
              this.chaseTierCheck();
            }
          }
        }
      }
    }
  }

  private perfectLabel(text: string): void {
    const before = this.score.comboTier;
    this.score.perfect();
    this.od.fill(TUNING.overdrive.fillPerfect);
    this.ui.skillLabel(text, 'perfect');
    this.audio.perfect();
    if (this.score.comboTier > before) this.tierUp();
  }

  private chaseTierCheck(): void {
    // near-miss path shares tier-up feedback
    const t = this.score.comboTier;
    if (t > this.lastTier) this.tierUp();
    this.lastTier = t;
  }
  private lastTier = 1;

  private tierUp(): void {
    this.lastTier = this.score.comboTier;
    this.audio.tierUp(this.score.comboTier);
    this.ui.skillLabel(`x${this.score.comboTier} ${COMBO_NAMES[this.score.comboTier - 1].toUpperCase()}`, 'tier');
    this.haptic(15);
  }

  /** Wheel sparks on a lane switch, biased to the push-off side. */
  private sparks(dir: -1 | 1): void {
    this.path.getPoint(this.cart.dist, this.cart.lateral - dir * 0.8, tmpV);
    tmpV.y += 0.25;
    this.particles.spawn(tmpV, 0xffd080, 5, { speed: 2.5, up: 1.2, size: 0.07, life: 0.35, gravity: 6 });
  }

  private smashObstacle(dist: number, lat: number): void {
    this.path.getPoint(dist, lat, tmpV);
    tmpV.y += 0.8;
    this.particles.spawn(tmpV, 0x8a6238, 14, { speed: 5, up: 4, size: 0.14, life: 0.8 });
    this.audio.stumble();
    this.camera.addShake(0.25);
  }

  private minorHit(dist: number, lat: number): void {
    this.cart.stumble();
    this.score.minorHit();
    this.chase.addPressure(TUNING.chase.minorHitAdd);
    this.path.getPoint(dist, lat, tmpV);
    tmpV.y += 0.6;
    this.particles.spawn(tmpV, 0x9a5a2a, 10, { speed: 4, up: 3, size: 0.12, life: 0.7 });
    this.audio.stumble();
    this.haptic(35);
    this.camera.addShake(0.5);
    this.ui.hitFlash();
  }

  private startCrash(): void {
    this.state = 'crashing';
    this.crashTimer = 0;
    this.ui.tutorialPrompt(null); // clear any fork prompt if we die mid-approach
    this.cart.startCrash();
    this.score.majorHit();
    this.audio.crash();
    this.haptic(80);
    this.camera.addShake(1.0);
    this.ui.hitFlash();
    this.path.getPoint(this.cart.dist + 1, this.cart.lateral, tmpV);
    tmpV.y += 0.8;
    this.particles.spawn(tmpV, 0xffa040, 22, { speed: 6, up: 5, size: 0.16, life: 1.0 });
    this.particles.spawn(tmpV, 0x555a60, 16, { speed: 5, up: 4, size: 0.13, life: 1.1 });
  }

  private updateCrashing(dt: number): void {
    this.crashTimer += dt;
    this.cart.update(dt);
    this.view.update(this.cart.dist);
    this.obstacles.update(dt, this.cart.dist);
    this.chase.update(dt, this.cart.dist, true);
    this.camera.update(dt, this.cart, 1);
    this.audio.setDynamics(0.2, 1, 0);
    if (this.crashTimer > 1.45) this.endRun();
  }

  private updateTutorial(): void {
    const d = this.cart.dist;
    const steps: Array<[number, number, string]> = [
      [30, 58, '<span class="big">◀ ▶</span>Swipe to switch rails!'],
      [88, 114, '<span class="big">▲</span>Swipe up to jump!'],
      [142, 168, '<span class="big">▼</span>Swipe down to duck!'],
    ];
    let shown: string | null = null;
    for (const [a, b, text] of steps) {
      if (d >= a && d <= b) shown = text;
    }
    this.ui.tutorialPrompt(shown);
    if (d > 190 && this.tutorialStep === 0) {
      this.tutorialStep = 1;
      this.tutorialActive = false;
      this.ui.tutorialPrompt(null);
      this.save.data.tutorialDone = true;
      this.save.save();
    }
  }

  private pushHud(): void {
    const labels: string[] = [];
    if (this.pu.magnet) labels.push(`⊕ ${Math.ceil(this.pu.magnetT)}s`);
    if (this.pu.shield) labels.push('⛨');
    if (this.pu.ghost) labels.push(`◌ ${Math.ceil(this.pu.ghostT)}s`);
    if (this.pu.frenzy) labels.push(`◆x2 ${Math.ceil(this.pu.frenzyT)}s`);
    this.ui.updateHud({
      score: Math.round(this.score.score),
      emberCount: this.score.emberCount,
      prismCount: this.score.prismCount,
      comboTier: this.score.comboTier,
      comboName: COMBO_NAMES[this.score.comboTier - 1],
      odMeter: this.od.active ? this.od.timeLeft / TUNING.overdrive.duration : this.od.meter,
      odReady: this.od.ready,
      odActive: this.od.active,
      powerups: labels,
      pressure: this.chase.pressure,
    });
  }
}

const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
