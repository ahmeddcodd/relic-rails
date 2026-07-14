# Technical decisions — Relic Rails: Abyss Run

## Track: uniform arc-length ring buffer, not a spline library
The path is sampled every 1 m into fixed Float32Arrays (`CAP = 2048`, a 2 km live
window). Modules (length/curve/slope) pushed by the director are consumed by a
generator walk. Evaluation is O(1) array indexing — no binary search, no allocation,
frame-rate independent. Curves are bounded (radius ≳ 60 m) so the tube never
self-intersects within fog range.

## World rendering: merged chunk geometry + per-chunk instancing
Each 32 m chunk = 4 draw calls:
1. **Environment mesh** — one vertex-colored indexed geometry rewritten in place from
   preallocated buffers: ground/walls/ceiling ribbon PLUS biome props (timber frames,
   rocks, pipes) appended as transformed boxes. `DoubleSide` because the tunnel is seen
   from inside while prop boxes are seen from outside (single-sided winding caused the
   invisible-ground bug found during verification).
2. **Rails mesh** — 6 strips (3 lanes × 2 rails), rewritten the same way.
3. **Ties** — one InstancedMesh (22 instances).
4. **Glows** — one InstancedMesh of octahedra with per-instance color: torch flames,
   crystals, magma vents, warning lamps. `MeshBasicMaterial` + `toneMapped: false` so
   they read as emitters without bloom.

**Gotcha that cost a bug:** InstancedMesh frustum culling uses the base geometry's
origin-centred bounding sphere; once the cart travels away from the origin the whole
mesh culls. Ties/glows/shards/particles all set `frustumCulled = false` (they only
ever exist near the camera anyway). Chunk env/rail geometries get hand-set bounding
spheres at the chunk centre.

## Gameplay collision: 1-D track-space checks, not 3-D physics
Obstacles live at (distance, lane). Collision = overlap window on distance + lateral
proximity + clearance rule (airborne height for jump obstacles, duck state for duck
obstacles). This is deterministic, allocation-free, and impossible to tunnel through
at any frame rate. Near-miss/Perfect scoring falls out of the same data.

## Fairness is enforced twice
- **At generation:** min reaction gap (`speed × 0.95 s`) between required actions,
  guaranteed free lane per row, recovery breather every 5 hazard patterns, no hazards
  in biome transitions, same-lane repeat cap.
- **At validation:** `validatePlan()` re-checks the invariants; unit tests sweep 5
  seeds × 3 km; dev builds re-validate live every 5 s and warn loudly.

## Procedural everything (assets + audio)
All models are cached-primitive compositions; all audio is synthesized WebAudio
(sequenced music stems: base/arp/chase + rumble + SFX). Zero external files means the
gzipped bundle is ~150 KiB, loads instantly, and has zero licensing surface — the
entire ASSET_SOURCES.md is "n/a by construction".

## Save: versioned, paranoid, tiny
`migrateSave()` treats ALL input as hostile: unknown versions, NaN, negative numbers,
non-boolean settings, partial objects. Saves are debounced 400 ms and flushed on run
end. `loadData()` strictly precedes any `saveData()` (enforced by a loaded flag).

## Platform bridge
One interface, two implementations (local mock / YouTube). `firstFrameReady` /
`gameReady` are idempotent. Pause/resume only via SDK callbacks; local dev mirrors
with `visibilitychange`. Audio enablement is polled once and subscribed.

## Junction forks — delayed path commit (Temple-Run split)
The single-polyline model can't pre-generate past a choice the player hasn't made
yet, so the director HALTS path + content generation at the split (`forkDist`) once
a fork is scheduled. `TrackView` naturally stops building chunks there, and fog +
the two diverging tunnel-mouth stubs (`ForkVisual`) make "the road ends in two
choices" read cleanly. The game reveals both branches ~80 m out, then ~15 m out
reads the cart's lane and calls `director.commitFork(side)`, which appends a curve
module in that direction and resumes generation — so the whole world turns the way
you chose, in the same frame, with no visible gap (verified: 0 teleports / 0 path
halts across 4 forks over 2.2 km). Center-lane / no-input defaults to the last side
(fairness rule "valid default route"). No hazard pattern can spill onto the
ungenerated branch: the 55 m approach guard exceeds any single pattern's span and
only short `patSingle` patterns run inside it.

## Jump clearance — airborne, not per-frame height
A jump obstacle is cleared whenever the cart is **airborne** during the overlap, not
when `y >= clearHeight` on every overlapping frame (which made a well-centred jump
clip on the rise/descent, since the ~3.7 m overlap window is wider than the tight
height band). Landing on the obstacle (grounded mid-overlap) still fails. This is the
runner-standard feel and made jumps reliable in testing.

## Deliberate deferrals (documented, not forgotten)
- **Single-rail balance sections** — needs a distinct control mode; deferred.
- **Contracts/missions, cosmetic cart unlocks, relic gallery** — save schema has room
  (version bump + migration path proven by tests); menu keeps rank + totals for now.
- **Post-processing stack (bloom/vignette)** — the art direction reads well without
  it; `toneMapped:false` emitters approximate bloom at zero GPU cost. Revisit only if
  a perf budget survey on real devices shows headroom.
- **KTX2/texture pipeline** — no textures exist; nothing to compress.
