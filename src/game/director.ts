// ---------------------------------------------------------------------------
// DifficultyDirector — generates track modules (geometry) and content
// (obstacles, shard trails, power-ups) ahead of the cart, phase-gated and
// governed by explicit fairness rules:
//   • every obstacle row leaves ≥1 free lane
//   • required actions are separated by ≥ speed × reactionTime metres
//   • a recovery breather follows every N hazard patterns
//   • no hazards inside biome transitions
// validatePlan() re-checks these invariants (unit-tested, dev-asserted).
// ---------------------------------------------------------------------------
import { TUNING, type LaneIndex } from '../config/tuning';
import { Rand } from '../core/rand';
import type { TrackPath } from './track';
import type { ObstacleManager, ObstacleType } from './entities';
import type { CollectibleManager, PowerupKind } from './entities';
import { OBSTACLE_SPECS } from './entities';

const LANES: LaneIndex[] = [0, 1, 2];
const PHASE_SPEEDS = [
  TUNING.speed.start,
  TUNING.speed.phase2,
  TUNING.speed.phase3,
  TUNING.speed.phase4,
  TUNING.speed.phase5,
];

// Index order matches BIOMES in palette.ts (dark Crystal first, red Forge last).
const BIOME_OBSTACLES: ObstacleType[][] = [
  ['spikes', 'blocker', 'gate', 'gap', 'beam'], // 0 Crystal Hollow
  ['blocker', 'beam', 'rocks', 'gap', 'oncoming'], // 1 Timber Maw Mine
  ['gap', 'rocks', 'blocker', 'oncoming', 'beam'], // 2 Flooded Ravine
  ['fire', 'gate', 'blocker', 'gap', 'oncoming'], // 3 Ember Forge
];

const POWERUP_ROTATION: PowerupKind[] = ['magnet', 'shield', 'frenzy', 'ghost', 'repair'];

export interface PlacedAction {
  dist: number;
  lane: LaneIndex;
  action: string;
}

export class Director {
  private genDist = 0; // content generated up to here
  private runTime = 0;
  private rand = new Rand(1);
  private patternsSinceRecovery = 0;
  private lastActionDist = -99;
  private lastBlockedLane: LaneIndex = 1;
  private sameLaneCount = 0;
  private powerupIdx = 0;
  private nextPowerupAt = 260;
  private tutorial = false;
  /** dev/testing: record of required actions for validation */
  plan: PlacedAction[] = [];

  // --- fork (Temple-Run-style branching) state ---
  /** true while a fork is placed ahead but the player has not committed a side. */
  forkPending = false;
  /** distance of the split point; path generation halts here until commit. */
  forkDist = 0;
  private forkApproachDone = false;
  private nextForkAt = 300;

  phase = 0;

  constructor(
    private path: TrackPath,
    private obstacles: ObstacleManager,
    private collectibles: CollectibleManager,
  ) {}

  reset(seed: number, tutorial: boolean): void {
    this.rand = new Rand(seed);
    this.genDist = 0;
    this.runTime = 0;
    this.phase = 0;
    this.patternsSinceRecovery = 0;
    this.lastActionDist = -99;
    this.sameLaneCount = 0;
    this.powerupIdx = 0;
    this.nextPowerupAt = 260;
    this.tutorial = tutorial;
    this.forkPending = false;
    this.forkDist = 0;
    this.forkApproachDone = false;
    this.nextForkAt = tutorial ? 520 : 300; // first fork only after the basics land
    this.plan.length = 0;
  }

  get targetSpeed(): number {
    return PHASE_SPEEDS[this.phase];
  }

  biomeAt = (dist: number): number => {
    if (dist < 0) return 0;
    return Math.floor(dist / TUNING.biome.length) % 4;
  };

  /** Is dist inside a biome-transition strip (no hazards allowed)? */
  private inTransition(dist: number): boolean {
    const local = dist % TUNING.biome.length;
    return local > TUNING.biome.length - TUNING.biome.transitionLen;
  }

  update(dt: number, cartDist: number): void {
    this.runTime += dt;
    const ph = TUNING.phases;
    this.phase = 0;
    for (let i = ph.length - 1; i >= 0; i--) {
      if (this.runTime >= ph[i]) {
        this.phase = i;
        break;
      }
    }

    // Keep the geometric path generated ahead — but STOP at a pending fork.
    // The path cannot branch until the player commits a side, so once a fork is
    // scheduled we queue nothing past it; head halts at forkDist and the split
    // visual + fog make that a readable "the road ends in two choices" moment.
    while (
      !this.forkPending &&
      this.path.queuedLength() + this.path.headDist < cartDist + TUNING.track.aheadDist + 80
    ) {
      const queuedEnd = this.path.headDist + this.path.queuedLength();
      if (this.canForkAt(queuedEnd)) {
        this.scheduleFork(queuedEnd);
        break;
      }
      this.pushTrackModule();
    }
    this.path.ensure(cartDist + TUNING.track.aheadDist);

    // Keep content generated ahead (also halts at a pending fork).
    while (this.genDist < cartDist + TUNING.track.aheadDist - 40) {
      if (this.forkPending && this.genDist >= this.forkDist) break;
      this.generateNext();
    }
  }

  // --- forks ----------------------------------------------------------------
  private canForkAt(dist: number): boolean {
    return (
      !this.tutorial &&
      this.runTime >= 6 && // let the player settle before the first split
      dist >= this.nextForkAt &&
      !this.inTransition(dist) &&
      !this.inTransition(dist + 60) && // keep the whole branch out of a biome gate
      this.biomeAt(dist) === this.biomeAt(dist + 70) // don't fork across a biome
    );
  }

  private scheduleFork(atLeast: number): void {
    // Give a straight lead-in so the player runs squarely into the split.
    this.path.pushModule({ len: 34, curve: 0, slope: 0 });
    this.forkDist = this.path.headDist + this.path.queuedLength();
    this.forkPending = true;
    this.forkApproachDone = false;
    void atLeast;
  }

  /** Commit the branch the player chose. side: -1 = left, +1 = right. */
  commitFork(side: -1 | 1): void {
    if (!this.forkPending) return;
    this.forkPending = false;
    // The whole world turns toward the chosen side, then straightens out.
    this.path.pushModule({ len: 52, curve: 0.62 * side, slope: 0 });
    this.path.pushModule({ len: 26, curve: 0, slope: 0 });
    this.nextForkAt = this.forkDist + this.rand.range(340, 520);
    // Resume content generation from the fork point onward.
    this.genDist = this.forkDist;
  }

  /** Split shard trail guiding the player toward either lane before the fork. */
  private generateForkApproach(): void {
    const j = this.forkDist;
    this.trailFlat(j - 40, 1, 3, 2.6); // run in centred
    this.trailCurve(j - 28, 1, 0, 6, 2.4); // peel left
    this.trailCurve(j - 28, 1, 2, 6, 2.4); // peel right
  }

  private pushTrackModule(): void {
    const r = this.rand;
    const roll = r.next();
    if (roll < 0.42) {
      this.path.pushModule({ len: r.range(36, 60), curve: 0, slope: 0 });
    } else if (roll < 0.78) {
      // gentle curve, radius ≥ ~60 m
      const len = r.range(45, 75);
      const curve = r.range(0.35, 0.62) * (r.chance(0.5) ? 1 : -1);
      this.path.pushModule({ len, curve, slope: 0 });
    } else {
      // slope change (dip or climb), settles back over two modules
      const len = r.range(40, 60);
      const s = r.range(0.05, 0.1) * (r.chance(0.5) ? 1 : -1);
      this.path.pushModule({ len, curve: 0, slope: s });
      this.path.pushModule({ len: len * 0.8, curve: 0, slope: -s });
    }
  }

  // --- content -------------------------------------------------------------
  private generateNext(): void {
    // Approaching a pending fork: lay the split telegraph once, then park
    // content at the split (nothing is generated past it until commit). The
    // 55 m guard exceeds any single pattern's span, so no hazard can spill onto
    // the not-yet-generated branch.
    if (this.forkPending && this.genDist >= this.forkDist - 55) {
      if (!this.forkApproachDone) {
        this.generateForkApproach();
        this.forkApproachDone = true;
      }
      this.genDist = this.forkDist;
      return;
    }
    if (this.tutorial && this.genDist < 10) {
      this.generateTutorial();
      return;
    }
    if (this.genDist < 30) {
      // opening runway: shards only
      this.trailFlat(this.genDist + 12, 1, 6, 2.4);
      this.genDist += 34;
      return;
    }
    if (this.inTransition(this.genDist + 20)) {
      // breather through the biome gate — reward trail, no hazards
      const lane = this.rand.pick(LANES);
      this.trailFlat(this.genDist + 8, lane, 8, 2.6);
      this.genDist += TUNING.biome.transitionLen;
      return;
    }
    if (this.genDist >= this.nextPowerupAt) {
      const kind = POWERUP_ROTATION[this.powerupIdx++ % POWERUP_ROTATION.length];
      this.collectibles.addPowerup(kind, this.genDist + 10, this.rand.pick(LANES));
      this.nextPowerupAt = this.genDist + this.rand.range(240, 380);
      this.genDist += 18;
      return;
    }
    if (this.patternsSinceRecovery >= TUNING.fairness.recoveryEvery) {
      this.patternsSinceRecovery = 0;
      const lane = this.rand.pick(LANES);
      this.trailFlat(this.genDist + 6, lane, 10, 2.4);
      this.genDist += 34;
      return;
    }
    this.patternsSinceRecovery++;
    // Within a fork's approach corridor, only short single patterns run so the
    // last hazard always lands clear of the split.
    if (this.forkPending) {
      this.patSingle();
      return;
    }
    const pattern = this.pickPattern();
    pattern();
  }

  private pickPattern(): () => void {
    const r = this.rand;
    const p = this.phase;
    const options: Array<[() => void, number]> = [[() => this.patSingle(), 3]];
    if (p >= 1) {
      options.push([() => this.patActionTrail(), 3]);
      options.push([() => this.patZigzag(), 1.5]);
      options.push([() => this.patOncoming(), 1.2]);
    }
    if (p >= 2) {
      options.push([() => this.patDouble(), 2]);
      options.push([() => this.patDebrisField(), 1.2]);
      options.push([() => this.patRiskReward(), 1.4]);
    }
    if (p >= 3) {
      options.push([() => this.patGauntlet(2), 1.6]);
    }
    if (p >= 4) {
      options.push([() => this.patGauntlet(3), 1.6]);
    }
    let total = 0;
    for (const [, wgt] of options) total += wgt;
    let roll = r.next() * total;
    for (const [fn, wgt] of options) {
      roll -= wgt;
      if (roll <= 0) return fn;
    }
    return options[0][0];
  }

  /**
   * Min metres between required actions. Content is generated ~220 m ahead and
   * may be consumed after a phase speed-up, so space against the NEXT phase's
   * speed — the reaction window then holds even across the ramp.
   */
  private actionGap(): number {
    const s = PHASE_SPEEDS[Math.min(this.phase + 1, PHASE_SPEEDS.length - 1)];
    return s * TUNING.fairness.reactionTime;
  }

  /** Advance cursor so the next action respects the reaction gap. */
  private cursorForAction(lead = 0): number {
    const min = this.lastActionDist + this.actionGap();
    const d = Math.max(this.genDist + lead, min);
    return d;
  }

  private pickLane(): LaneIndex {
    let lane = this.rand.pick(LANES);
    if (lane === this.lastBlockedLane) {
      this.sameLaneCount++;
      if (this.sameLaneCount >= TUNING.fairness.sameLaneRepeatMax) {
        lane = LANES[(lane + this.rand.int(1, 2)) % 3] as LaneIndex;
        this.sameLaneCount = 0;
      }
    } else {
      this.sameLaneCount = 0;
    }
    this.lastBlockedLane = lane;
    return lane;
  }

  private biomeTypes(): ObstacleType[] {
    return BIOME_OBSTACLES[this.biomeAt(this.genDist + 30)];
  }

  private placeObstacle(type: ObstacleType, dist: number, lane: LaneIndex): void {
    this.obstacles.add(type, dist, lane);
    const spec = OBSTACLE_SPECS[type];
    if (spec.action !== 'none') {
      this.lastActionDist = dist;
      this.plan.push({ dist, lane, action: spec.action });
    }
  }

  // --- shard trails -----------------------------------------------------------
  private trailFlat(start: number, lane: LaneIndex, count: number, spacing: number): void {
    const id = this.collectibles.newTrailId();
    const lat = TUNING.track.laneOffsets[lane];
    for (let i = 0; i < count; i++) this.collectibles.addEmber(start + i * spacing, lat, 0, id);
  }

  /** Curved trail sliding from one lane to another — telegraphs a switch. */
  private trailCurve(start: number, from: LaneIndex, to: LaneIndex, count: number, spacing: number): void {
    const id = this.collectibles.newTrailId();
    const a = TUNING.track.laneOffsets[from];
    const b = TUNING.track.laneOffsets[to];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      this.collectibles.addEmber(start + i * spacing, a + (b - a) * t, 0, id);
    }
  }

  /** Arc trail over a jump obstacle — telegraphs the jump trajectory. */
  private trailArc(centre: number, lane: LaneIndex, count = 7): void {
    const id = this.collectibles.newTrailId();
    const lat = TUNING.track.laneOffsets[lane];
    const span = 8;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = Math.sin(t * Math.PI) * 2.2;
      this.collectibles.addEmber(centre - span / 2 + t * span, lat, y, id);
    }
  }

  // --- patterns ---------------------------------------------------------------
  private patSingle(): void {
    const lane = this.pickLane();
    const type = this.rand.pick(this.biomeTypes());
    const d = this.cursorForAction(14);
    this.placeObstacle(type, d, lane);
    const spec = OBSTACLE_SPECS[type];
    if (spec.action === 'jump') {
      this.trailArc(d, lane);
    } else if (spec.action === 'duck') {
      this.trailFlat(d - 6, lane, 6, 2.4);
    } else {
      // switch obstacle: curved trail guides to a free lane
      const free = LANES.filter((l) => l !== lane);
      const to = this.rand.pick(free);
      this.trailCurve(d - 16, lane, to, 6, 2.6);
    }
    this.genDist = d + 16;
  }

  private patActionTrail(): void {
    // jump or duck obstacle spanning with matching trail on a NEIGHBOUR lane too
    const lane = this.pickLane();
    const types = this.biomeTypes().filter((t) => {
      const a = OBSTACLE_SPECS[t].action;
      return a === 'jump' || a === 'duck';
    });
    const type = types.length ? this.rand.pick(types) : 'rocks';
    const d = this.cursorForAction(14);
    this.placeObstacle(type, d, lane);
    if (OBSTACLE_SPECS[type].action === 'jump') this.trailArc(d, lane);
    else this.trailFlat(d - 5, lane, 5, 2.2);
    this.genDist = d + 14;
  }

  private patDouble(): void {
    // two lanes blocked in one row — exactly one free lane, trail leads there
    const free = this.pickLane(); // the FREE lane
    const blocked = LANES.filter((l) => l !== free) as LaneIndex[];
    const d = this.cursorForAction(20);
    const types = this.biomeTypes();
    for (const l of blocked) {
      const t = this.rand.pick(types.filter((x) => OBSTACLE_SPECS[x].action === 'switch' || OBSTACLE_SPECS[x].action === 'jump'));
      this.placeObstacle(t ?? 'blocker', d, l);
    }
    this.trailCurve(d - 18, blocked[this.rand.int(0, 1)], free, 7, 2.6);
    this.genDist = d + 18;
  }

  private patZigzag(): void {
    // shard slalom with light debris — teaches fast lane work
    let d = this.genDist + 10;
    let lane: LaneIndex = this.rand.pick(LANES);
    for (let k = 0; k < 3; k++) {
      const next = LANES.filter((l) => Math.abs(l - lane) === 1);
      const to = this.rand.pick(next);
      this.trailCurve(d, lane, to, 5, 2.4);
      if (this.phase >= 2 && k === 1) this.placeObstacle('debris', d + 6, lane);
      lane = to;
      d += 15;
    }
    this.genDist = d + 4;
  }

  private patOncoming(): void {
    const lane = this.pickLane();
    const d = this.cursorForAction(30) + 25; // extra room: it moves toward you
    this.placeObstacle('oncoming', d, lane);
    const free = this.rand.pick(LANES.filter((l) => l !== lane));
    this.trailFlat(this.genDist + 8, free, 7, 2.6);
    this.genDist = d - 8;
  }

  private patDebrisField(): void {
    // minor hazards scattered — combo pressure, not lethal
    let d = this.genDist + 12;
    const used = new Set<LaneIndex>();
    for (let k = 0; k < 3; k++) {
      const lane = this.rand.pick(LANES);
      used.add(lane);
      this.obstacles.add('debris', d, lane);
      d += this.rand.range(7, 11);
    }
    const freeLanes = LANES.filter((l) => !used.has(l));
    this.trailFlat(this.genDist + 10, freeLanes.length ? this.rand.pick(freeLanes) : 1, 8, 2.6);
    this.genDist = d + 4;
  }

  private patRiskReward(): void {
    // Prism on a lane guarded by a jump obstacle — earn it with an arc
    const lane = this.pickLane();
    const d = this.cursorForAction(16);
    const jumpTypes = this.biomeTypes().filter((t) => OBSTACLE_SPECS[t].action === 'jump');
    const type = jumpTypes.length ? this.rand.pick(jumpTypes) : 'rocks';
    this.placeObstacle(type, d, lane);
    this.collectibles.addPrism(d, TUNING.track.laneOffsets[lane], 1.9);
    this.trailArc(d, lane, 5);
    this.genDist = d + 16;
  }

  private patGauntlet(n: number): void {
    // n alternating actions in sequence, each respecting the reaction gap
    let lane = this.pickLane();
    let d = this.cursorForAction(16);
    for (let k = 0; k < n; k++) {
      const type = this.rand.pick(this.biomeTypes());
      this.placeObstacle(type, d, lane);
      const spec = OBSTACLE_SPECS[type];
      if (spec.action === 'jump') this.trailArc(d, lane, 5);
      if (spec.action === 'switch') {
        const free = LANES.filter((l) => l !== lane);
        lane = this.rand.pick(free);
      }
      d += this.actionGap() + this.rand.range(2, 8);
    }
    this.genDist = d + 6;
  }

  private generateTutorial(): void {
    // Authored gentle opening: switch → jump → duck, each with guidance trail.
    this.trailFlat(16, 1, 5, 2.4);
    this.placeObstacle('blocker', 62, 1);
    this.trailCurve(44, 1, 2, 6, 2.6);
    this.placeObstacle('rocks', 118, 2);
    this.trailArc(118, 2);
    this.placeObstacle('beam', 172, 2);
    this.trailFlat(164, 2, 6, 2.4);
    this.trailFlat(196, 1, 6, 2.4);
    this.genDist = 214;
    this.lastActionDist = 172;
  }
}

// --- Fairness validator (dev + tests) -----------------------------------------
export interface ValidationIssue {
  kind: string;
  dist: number;
  detail: string;
}

export function validatePlan(
  plan: PlacedAction[],
  obstacles: Array<{ dist: number; lane: LaneIndex; type: ObstacleType }>,
  minGap: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sorted = [...plan].sort((a, b) => a.dist - b.dist);
  // Obstacles within 3 m form one ROW (a single player decision); the
  // reaction window applies between rows, not within one.
  const rows: number[] = [];
  for (const a of sorted) {
    if (rows.length === 0 || a.dist - rows[rows.length - 1] >= 3) rows.push(a.dist);
  }
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i] - rows[i - 1];
    if (gap < minGap * 0.85) {
      issues.push({
        kind: 'reaction-window',
        dist: rows[i],
        detail: `actions ${gap.toFixed(1)}m apart (< ${minGap.toFixed(1)}m)`,
      });
    }
  }
  // rows: group MAJOR obstacles within 3 m and confirm a free lane exists.
  // (Minor debris is survivable by design and does not count as a wall.)
  const majors = obstacles.filter((o) => OBSTACLE_SPECS[o.type].major).sort((a, b) => a.dist - b.dist);
  let i = 0;
  while (i < majors.length) {
    const row = [majors[i]];
    let j = i + 1;
    while (j < majors.length && majors[j].dist - majors[i].dist < 3) row.push(majors[j++]);
    const lanes = new Set(row.map((o) => o.lane));
    const passable = [0, 1, 2].some(
      (l) => !lanes.has(l as LaneIndex) || row.every((o) => o.lane !== l || OBSTACLE_SPECS[o.type].action !== 'switch'),
    );
    if (lanes.size >= 3 && !passable) {
      issues.push({ kind: 'blocked-row', dist: majors[i].dist, detail: 'all lanes blocked by switch obstacles' });
    }
    i = j;
  }
  return issues;
}
