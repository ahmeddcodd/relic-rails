# Progress — Relic Rails: Abyss Run

## Complete
- Phase 0/1 — project scaffold (Vite + strict TS + vitest), renderer, quality tiers,
  resize-safe canvas, platform bridge (local mock + YouTube), loading → menu → run →
  crash → results → restart state machine, zero-console-error boot.
- Phase 2 — core loop: ring-buffer track path, 3-rail lanes, swipe/mouse/keyboard
  input with buffering, jump/duck/switch, obstacle collision (major/minor), shard
  pickups, scoring, crash cinematic, sub-second restart.
- Phase 3 — visual slice: procedural hero cart + Rin, four biome kits (merged chunk
  geometry + instanced glows), torches/crystals/magma, fog + biome-blended lighting,
  pooled particles, polished DOM HUD/menu/results, tutorial woven into first run.
- Phase 4 — endless systems: difficulty director (5 phases), pattern pools, fairness
  rules + validator (unit-tested across seeds), recovery pacing, combo tiers x1–x5,
  Perfect/Near-miss detection, Sunheart Overdrive, Iron Maw chase pressure (visible
  guardian, catch ending), 5 power-ups (magnet/shield/ghost/frenzy/repair).
- Phase 5 — 4 biomes reachable in sequence (Crystal Hollow → Timber Maw Mine →
  Flooded Ravine → Ember Forge: dark opener, red-hot finale) with transition
  breathers; biome-specific obstacle pools (9 obstacle types).
- ~~Temple-Run-style **junction forks**~~ — **NOT IN THE BUILD.** Added in commit
  `ac88908`, then removed entirely by `6cd0cea` (the Blender asset-pack merge),
  which deleted all 89 lines of fork logic from `director.ts`. `grep -i
  "fork\|junction"` over `src/` returns nothing today. This entry described a
  feature that had already been dropped; kept here as a record so the loss is not
  rediscovered a third time. Restoring it is an open design decision.
- Phase 6 (partial) — ranks (8 tiers), persistent totals, settings (music/sfx/haptics/
  reduced fx), versioned + migration-tested save.
- Phase 7 — SDK lifecycle: firstFrameReady → loadData → gameReady ordering, pause/
  resume callbacks, audio-state gating, score submission == saved best, local no-SDK
  operation verified.
- Phase 8 — JS bundle ~188 KiB gzipped, 37 files / 2.43 MiB total including the
  35 authored GLBs. Measured over a 130 s / 3.1 km four-biome soak: **peak 122
  draw calls** (down from 387 — every prop and platform module now draws through
  one shared instancer), peak 236k triangles, 0.13 ms of CPU per frame, ~35 MB
  heap. Adaptive render scale corrects the device tier from real frame time.
- Phase 9 (partial) — 57 unit tests green; in-browser verification of full loop,
  all four biomes, overdrive, Maw catch, portrait + desktop aspect.

## Verified in browser
Menu → run → crash → results → restart; save persistence across reloads; NEW BEST +
rank promotion; tutorial prompts; autopilot soak (4+ consecutive auto-restarted runs,
no errors); all 4 biomes; portrait 375×812 and desktop framing.

## Deferred (see TECHNICAL_DECISIONS.md)
- Single-rail balance sections.
- Contracts/missions, cosmetic cart/outfit unlocks, relic-fragment collection.
- Post-processing pass; landmark set pieces; haptic patterns beyond basic pulses.
- E2E test harness (manual + scripted-eval coverage exists; no automated e2e yet).

## Known issues
- Straight cross-beams are skipped on tightly curved chunks (by design — a straight
  beam through curved space pokes the walls); curves read slightly barer than
  straights in the mine.
- Oncoming carts rely on horn + headlamp telegraphs; at phase 5 speeds they demand
  fast reads (tuned generous: spawn 25 m beyond the reaction cursor).
