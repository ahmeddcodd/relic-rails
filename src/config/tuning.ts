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
    aheadDist: 260,         // metres of track kept generated ahead of cart
    // VISUAL range only — content is still generated `aheadDist` ahead. Fog is
    // fully opaque by 105-150 m depending on biome, so anything past that is
    // pure cost: at 8 chunks (256 m) the platform modules alone were 144k
    // triangles, most of them invisible. N chunks guarantees at least N*32 m of
    // visible track, so 5 keeps 160-192 m — clear of the ravine's 150 m fog,
    // the deepest of the four biomes.
    drawAheadChunks: 5,
    // The camera sits 7.2 m back, so one chunk behind is ample cover.
    drawBehindChunks: 1,
    activateAhead: 170,     // metres ahead at which entity meshes are acquired
    releaseBehind: 14,      // metres behind at which entities return to the pool
  },

  // --- Speed curve (m/s) ---
  speed: {
    start: 14,
    phase2: 18,
    phase3: 22,
    phase4: 26,
    phase5: 30,
    max: 38,                // hard ceiling for the endless distance ramp
    overdriveBonus: 5,
    minorHitLoss: 0.35,     // fraction of speed lost on a minor hit
    recoverTime: 2.2,       // seconds to regain speed after minor hit
    mercyTime: 0.45,        // brief i-frames after a stumble (co-located hazards only, never phases a wall)
    // Endless ramp: once the final time-phase is reached, keep speeding up with
    // DISTANCE so longer runs stay faster (up to `max`). +`endlessPerMetre` m/s
    // for every metre past `endlessFrom`, clamped at `max`.
    endlessFrom: 3000,      // metres — distance where the endless ramp begins
    endlessPerMetre: 0.0016, // m/s added per metre travelled past endlessFrom
  },

  // --- Cart handling ---
  cart: {
    laneSwitchTime: 0.22,   // seconds for a lane transition
    laneSwitchCooldown: 0.10,
    jumpHeight: 2.1,
    jumpTime: 0.62,         // total airborne time at base speed
    duckTime: 0.7,          // how long a duck holds (generous so timing is forgiving)
    standingRiderTop: 2.95, // measured cart + socket + Rin GLB silhouette
    duckRiderTop: 2.18,     // measured at the authored duck pose apex
    inputBufferTime: 0.18,  // early-press buffer window
    leanMax: 0.32,          // radians of cart lean during switch
    crashDuration: 1.8,     // full authored impact, hop, landing and readable settle
    crashDeceleration: 26,  // hard stop without an instantaneous camera snap
    crashTravelScale: 0.24,
    // The authored cart crash clip rolls 113 degrees about the rail plane, so
    // at full speed the cart body (and Rin, rigidly parented to SOCKET_rider)
    // swings underneath the deck. Playing it slower stops at a readable
    // tip-onto-its-side. Measured in-game: 0.7 forced the ground clamp to lift
    // the rig a full metre; 0.45 settles it at ~0.6 m, which is about where a
    // real cart on its side would sit.
    crashRollScale: 0.45,
    crashGroundClearance: 0.05, // metres the rig is held above the deck on impact
    crashSkipAfter: 0.5,    // seconds before a tap may skip to the results
  },

  // --- Gestures ---
  gesture: {
    minSwipeDist: 22,       // px — distance alone is enough to commit a swipe
    minSwipeVel: 0.25,      // px/ms — a fast flick commits earlier, at flickDist
    flickDist: 12,          // px — shorter threshold when the flick is fast
    reArmDist: 16,          // px of travel before a held finger can swipe again
    maxTapDist: 14,
    maxTapTime: 260,
  },

  // --- Collision windows (metres along track) ---
  collision: {
    cartHalf: 0.95,         // half-length of the cart along the track
    laneWidth: 1.35,        // lateral metres within which a hazard is "in lane"
    pickupRadius: 1.5,
    pickupYRadius: 1.4,
    magnetRadius: 6.5,
    nearMissLateral: 3.3,   // lateral metres within which a pass counts as a graze
    oncomingSpeed: 7,       // m/s an oncoming cart closes on the player
  },

  /**
   * Largest integration step the run loop will take (a 20 fps floor). Slow
   * devices stretch real time rather than skipping distance, which is what
   * keeps 1-D collision immune to tunnelling — see the collision-margin test.
   */
  maxFrameDt: 0.05,

  // --- Score ---
  score: {
    perMetre: 2,
    ember: 25,
    prism: 250,
    perfect: 120,
    nearMiss: 80,
    trailComplete: 300,
    airTimePerSec: 40,
    maxComboTier: 5,         // must match the length of COMBO_NAMES
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
  // Runs last 60-150 s, so the old 120 s final phase was never reached by most
  // players. The curve is compressed to put top speed inside a typical run.
  phases: [0, 12, 30, 55, 85] as const,

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
    // Speed bonus + overdrive + portrait compensation stack. Without a ceiling
    // a portrait phone at top speed reaches ~107 degrees and distorts badly.
    maxFov: 88,
    posLerp: 7.5,           // spring rates (1/s)
    lateralLag: 5.2,
    shakeDecay: 3.2,
    crashBack: 8.8,         // safe rear-quarter framing during the impact
    crashHeight: 3.65,
    crashSide: 1.5,
    crashFov: 58,
    // Menu hero shot — fixed, not an orbit. Placed ahead of the cart on the
    // track centreline so the rails run symmetrically up the frame.
    menuBack: 7.5,
    menuHeight: 3.4,
    menuLookHeight: 1,
  },
} as const;

export type LaneIndex = 0 | 1 | 2;
