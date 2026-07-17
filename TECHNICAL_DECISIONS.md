# Technical decisions — Relic Rails: Abyss Run

## Track: uniform arc-length ring buffer, not a spline library
The path is sampled every 1 m into fixed Float32Arrays (`CAP = 2048`, a 2 km live
window). Modules (length/curve/slope) pushed by the director are consumed by a
generator walk. Evaluation is O(1) array indexing — no binary search, no allocation,
frame-rate independent. Curves are bounded (radius ≳ 60 m) so the tube never
self-intersects within fog range.

## World rendering: Blender platform modules + pooled authored props
Each 32 m visual chunk instances eight four-metre Blender modules. A module includes the
complete platform/deck, sleepers, six rails, fasteners, left/right mountain walls, and
the authored biome ceiling or open-ravine treatment. The previously open shoulders are
also part of the Blender asset: terrain/ballast in the caverns, water and bank stone in
the ravine, and metal catwalks/magma seams in the forge. Each instance uses the sampled,
grade-aware track basis, so the GLB shell follows curves and slopes without runtime mesh
generation. Alternate modules are turned 180 degrees to vary asymmetric dressing while
remaining perfectly tileable. Hidden biome module groups cost no draw calls.

## Atmosphere: one camera-centred biome sky
One low-segment inward-facing sphere follows the camera and renders a biome-blended
vertical gradient. Its tiny shader adds a sun disc/glow, sparse stars or forge embers,
and broad cloud/aurora bands without texture downloads or a post-processing stack. Fog,
hemisphere/key lights, and a complementary rim light blend with the same biome palette,
so silhouettes stay readable against the new mountains while the total sky cost remains
one draw call.

Glows remain one lightweight `InstancedMesh` of octahedra with per-instance color for
torch light, crystal light, magma vents, and warning lamps. `MeshBasicMaterial` plus
`toneMapped: false` keeps them readable without a post-processing stack.

Authored biome props are cached GLBs and pooled by asset ID. Recycled chunks reuse their
clones and AnimationMixers instead of allocating or reloading as the endless track moves.

**Gotcha that cost a bug:** InstancedMesh frustum culling uses the base geometry's
origin-centred bounding sphere; once the cart travels away from the origin the whole
mesh culls. Platform parts, glows, shards, and particles set `frustumCulled = false`;
they only exist inside the short pooled draw window.

## Gameplay collision: 1-D track-space checks, not 3-D physics
Obstacles live at (distance, lane). Collision = overlap window on distance + lateral
proximity + clearance rule (airborne state for jump obstacles, measured rider-top height
for duck obstacles). The Blender duck hazards have a 2.25 m rigid clearance; the authored
cart + Rin silhouette measures 2.95 m standing and 2.18 m crouched. This is deterministic,
allocation-free, and impossible to tunnel through at any frame rate.

## Fairness is enforced twice
- **At generation:** min reaction gap (`speed × 0.95 s`) between required actions,
  guaranteed free lane per row, recovery breather every 5 hazard patterns, no hazards
  in biome transitions, same-lane repeat cap.
- **At validation:** `validatePlan()` re-checks the invariants; unit tests sweep 5
  seeds × 3 km; dev builds re-validate live every 5 s and warn loudly.

## Authored models + procedural audio
Visible models come from the project-owned Blender GLB pack in `READY_TO_USE_ASSETS`.
The runtime preloads each model once, preserves authored materials and sockets, derives
named subclips from embedded action libraries, pools repeated scene clones, and uses
InstancedMesh parts for Ember Shards, Prisms, and the four complete biome platform GLBs.
Only transient shadows, shields, glows, and particle shapes remain runtime geometry.

All audio is still synthesized WebAudio (sequenced music stems: base/arp/chase + rumble
+ SFX), so there are no audio downloads or autoplay-sensitive media files.

## Save: versioned, paranoid, tiny
`migrateSave()` treats ALL input as hostile: unknown versions, NaN, negative numbers,
non-boolean settings, partial objects. Saves are debounced 400 ms and flushed on run
end. `loadData()` strictly precedes any `saveData()` (enforced by a loaded flag).

## Platform bridge
One interface, two implementations (local mock / YouTube). `firstFrameReady` /
`gameReady` are idempotent. Pause/resume only via SDK callbacks; local dev mirrors
with `visibilitychange`. Audio enablement is polled once and subscribed.

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
