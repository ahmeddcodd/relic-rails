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

## Draw calls are the mobile budget, not triangles
Profiling a real run found 387 draw calls and 171k triangles — against a
measured CPU cost of 0.13 ms per frame out of 16.7 ms. The JS was never the
problem; the GPU was issuing ~23,000 draw calls a second, which is what stalls
a mobile tiler.

Two thirds of those calls were environment props, drawn as individual GLB
clones: crystal clusters alone cost 135 calls for 5,400 triangles (43 tris per
call), and `forge_pipe` (10 mesh primitives) plus `forge_gear` (12) cost 224
calls between them in the Ember Forge.

Every prop and platform module now draws through `InstancedPool` — one shared
`InstancedMesh` set per asset, carved into a fixed block of slots per visual
chunk. Blocks are allocated per asset, always taking the lowest free one:
because the draw count must span the highest live block, pinning blocks to the
chunk's pool index left degenerate gaps underneath, and at a biome boundary
(two platforms live at once) that inflated a frame from 138k to 249k triangles.

Result: **387 → 122 peak draw calls** across a full four-biome rotation.

The cost is that props no longer run their authored node loops (valve vents,
gear spin, tree sway, torch flicker). For tunnel-wall dressing seen through fog
at 30 m/s that is a good trade; torch and magma motion is preserved as a pulse
on the glow instances, which reads more like fire than a wobbling mesh and costs
~100 matrix writes a frame instead of 42 draw calls.

## Visual range is bounded by fog, not by generation distance
Fog is fully opaque by 105-150 m depending on biome, but the view drew 8 chunks
(256 m) ahead — more than half the platform geometry was invisible. N chunks
guarantees at least N*32 m of visible track, so `drawAheadChunks: 5` keeps
160-192 m, clear of the ravine's 150 m fog, the deepest of the four.
`aheadDist` is unchanged: content still generates 260 m ahead for gameplay.

## Adaptive resolution over a device guess
The quality tier is chosen from `deviceMemory`/`hardwareConcurrency` before a
single frame has been drawn, and those signals are absent or misleading on much
of mobile (iOS reports no `deviceMemory` at all). `Gfx.adapt()` corrects it from
measured frame time: below 50 fps the render scale steps down, above ~74 fps it
steps back up, evaluated every 2 s. Only the render buffer scales — geometry, UI
and gameplay are untouched. The wide hysteresis band is deliberate: a device
sitting exactly at 60 fps must hold, not oscillate.

## Platform pause is a hard stop, in every state
`onPause` has to silence four things, not just the run loop, and the results
screen is the case that exposes this: its buttons are fully interactive while
the simulation is already stopped, so a tap underneath YouTube's pause overlay
would start a fresh run. `setPaused` therefore stops the frame loop, suspends
the audio context, sets `InputManager.enabled = false` (a master switch
independent of `gameplayEnabled`, so resume restores the interrupted state
exactly), and freezes the DOM via `#ui-root.frozen`. Every UI callback is also
guarded on `paused` — three independent layers, because a stray click starting a
run under the pause overlay is the failure that must not happen.

`AudioSys.unlock()` early-returns while paused. Without that, a first-ever
gesture during a pause would CREATE the context and start the music sequencer
mid-pause. Input queued while frozen is dropped on resume rather than replayed.

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

## Crash: one authored roll, never two — plus a deck clamp
Both `minecart_hero.crash` and `rin_vale.crash` animate their OWN root node, and
Rin is rigidly parented to the cart's `SOCKET_rider`. Playing both therefore
COMPOSED 113.2° (cart) with 93.7° (Rin) plus Rin's own −0.38 m root drop, which
put her head **2.26 m below the deck** — measured, not estimated. Two changes:

- Rin plays `stumble` on impact (22° root rotation, no drop) instead of `crash`,
  whose "performance" was almost entirely root motion anyway.
- The cart's clip runs at `crashRollScale` so it settles as a tip-onto-its-side
  rather than a barrel roll. At 1.0 the ground clamp had to lift the rig a full
  metre; at 0.45 it settles around 0.6 m, roughly where a real cart on its side
  would sit.

`clampToDeck()` then measures the rig's bounding box **in the track basis** (so
it stays correct through curves and grades) and lifts by exactly the penetration
depth. That makes ground clipping structurally impossible no matter what a future
re-export does. Verified in-game: lowest point holds at the 0.05 m clearance for
the whole crash, and the lift moves at most 0.022 m per frame — no pop.
`tests/unit/crash-clearance.test.ts` replays the real GLB curves and includes a
sensitivity check that fails if the simulation ever stops reflecting the game.

## Collision sampling is the ceiling on speed
Collision is a 1-D overlap test sampled once per frame, so a hazard is only
caught if the cart cannot cross its entire overlap window in one step. With
`speed.max` 38 + overdrive at the 20 fps `maxFrameDt` floor, the tightest hazards
(`beam`/`gate`, ±1.45 m) leave a 1.35× margin. **Raising the speed curve further
requires widening those windows or lowering `maxFrameDt` — not just editing the
speed.** `tests/unit/collision-margin.test.ts` enforces this.

## Input: distance commits, direction gates the repeat
Requiring distance AND velocity together rejected ordinary deliberate thumb
swipes (90 px over 600 ms is 0.15 px/ms, under the old 0.25 gate) — the player
swiped and nothing happened. Distance alone now commits, with a fast flick
committing earlier at a shorter distance. Re-arming a held finger on distance
alone then created the opposite bug: one 100 px drag fired two lane changes.
A held finger may now only fire a DIFFERENT direction; repeating one needs a
fresh touch, which is the natural motion anyway.

Pointer capture is deliberately NOT used: capturing on `#app` retargets `click`
away from the Overdrive and menu buttons nested inside it. Release is handled on
`window` instead, so a finger lifted outside the viewport cannot latch the
gesture and deadlock all later input.

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
