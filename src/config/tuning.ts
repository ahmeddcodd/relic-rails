// ---------------------------------------------------------------------------
// RELIC RAILS — central tuning. Every gameplay magic number lives here.
// ---------------------------------------------------------------------------

export const TUNING = {
  // --- Track geometry ---
  track: {
    sampleStep: 1.0,        // metres between path samples
    sampleCap: 2048,        // ring buffer capacity (2 km live window)
    chunkLen: 32,           // metres of track per visual chunk
    laneOffsets: [-2.2, 0, 2.2] as const,
    railGauge: 1.1,         // rail pair spacing within a lane
    aheadDist: 260,         // metres of track kept generated ahead of cart
    behindDist: 60,         // metres kept behind before recycling
    drawAheadChunks: 8,     // visual chunks ahead of the cart
    drawBehindChunks: 2,
  },

  // --- Speed curve (m/s) ---
  speed: {
    start: 12,
    phase2: 16,
    phase3: 19.5,
    phase4: 23,
    phase5: 26,
    max: 27,
    overdriveBonus: 5,
    rampTime: 22,           // seconds to blend between phase targets
    minorHitLoss: 0.35,     // fraction of speed lost on a minor hit
    recoverTime: 2.2,       // seconds to regain speed after minor hit
  },

  // --- Cart handling ---
  cart: {
    laneSwitchTime: 0.22,   // seconds for a lane transition
    laneSwitchCooldown: 0.10,
    jumpHeight: 2.1,
    jumpTime: 0.62,         // total airborne time at base speed
    duckTime: 0.7,          // how long a duck holds (generous so timing is forgiving)
    inputBufferTime: 0.18,  // early-press buffer window
    leanMax: 0.32,          // radians of cart lean during switch
    crashSpinTime: 1.1,
  },

  // --- Gestures ---
  gesture: {
    minSwipeDist: 24,       // px
    minSwipeVel: 0.25,      // px/ms
    maxTapDist: 14,
    maxTapTime: 260,
  },

  // --- Collision windows (metres along track) ---
  collision: {
    obstacleHalf: 1.0,      // default obstacle half-length
    grazeExtra: 0.85,       // margin beyond obstacle that counts as a near-miss
    pickupRadius: 1.5,
    pickupYRadius: 1.4,
    magnetRadius: 6.5,
  },

  // --- Score ---
  score: {
    perMetre: 2,
    ember: 25,
    prism: 250,
    perfect: 120,
    nearMiss: 80,
    trailComplete: 300,
    airTimePerSec: 40,
    comboTiers: [1, 2, 3, 4, 5] as const,
    comboPerfectsPerTier: 3, // perfects/near-misses needed per tier step
    comboDecayTime: 7.5,     // seconds without skill events before a tier drops
  },

  // --- Overdrive ---
  overdrive: {
    duration: 5.0,
    fillPerfect: 0.09,
    fillNearMiss: 0.07,
    fillEmber: 0.006,
    fillPrism: 0.06,
    scoreMult: 2,
    fovBoost: 9,
  },

  // --- Power-ups ---
  powerups: {
    magnetTime: 7,
    ghostTime: 5,
    frenzyTime: 7,
    frenzyMult: 2,
  },

  // --- Iron Maw chase pressure ---
  chase: {
    minorHitAdd: 0.34,
    grazeAdd: 0.08,
    decayPerSec: 0.030,     // pressure bleed during clean play
    catchThreshold: 1.0,
    visibleFrom: 0.25,      // silhouette appears above this pressure
    startPressure: 0.30,    // opening beat: the Maw is right behind you
  },

  // --- Difficulty phases (seconds into run) ---
  phases: [0, 15, 40, 75, 120] as const,

  // --- Fairness ---
  fairness: {
    reactionTime: 0.95,     // min seconds between required actions
    recoveryEvery: 5,       // hazard patterns before a guaranteed recovery module
    sameLaneRepeatMax: 3,
  },

  // --- Biomes (metres per biome visit) ---
  biome: {
    length: 620,
    transitionLen: 48,
  },

  // --- Camera ---
  camera: {
    back: 7.2,              // metres behind cart along track
    height: 4.3,
    lookAhead: 9.5,
    baseFov: 62,
    fovPerSpeed: 0.45,      // extra fov per m/s over start speed
    posLerp: 7.5,           // spring rates (1/s)
    lateralLag: 5.2,
    shakeDecay: 3.2,
  },
} as const;

export type LaneIndex = 0 | 1 | 2;
