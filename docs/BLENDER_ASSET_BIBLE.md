# Relic Rails: Abyss Run — Blender Asset Bible

## 1. Purpose

This document is the permanent production context for every Blender asset created for
**Relic Rails: Abyss Run**. Each asset generator, `.blend` source, `.glb` export, preview,
and later Three.js integration must follow these rules unless its asset specification
explicitly documents an exception.

The objective is an original, premium low-poly mine adventure. The visual target is the
clarity, environmental density, and strong silhouettes associated with polished endless
runners, while retaining the original Emberdeep Railway fiction and avoiding copies of
another game's protected characters, props, UI, or distinctive trade dress.

## 2. Game context

### Genre and platform

- Endless three-lane minecart runner.
- Built with Three.js, TypeScript, and Vite for YouTube Playables.
- Landscape, portrait, square, ultrawide, desktop, and mobile layouts are supported.
- The camera follows behind and above the cart, looking forward along the railway.
- Typical runs last 60–150 seconds, but the track and difficulty continue endlessly.
- The game must remain readable at approximately 12–34 metres per second.

### Core actions

- Switch left or right between three rail lanes.
- Jump over gaps, rocks, debris, and crystal spikes.
- Duck under beams and gates.
- Collect Ember Shards and Prisms.
- Activate Sunheart Overdrive.
- Use magnet, shield, ghost, frenzy, and repair power-ups.
- Survive pressure from the Iron Maw chase guardian.
- Choose a branch at railway junctions.

### Existing technical structure

- Track direction is procedural and may curve or slope.
- Collision is deterministic track-space logic, not mesh or rigid-body collision.
- The tunnel shell, rails, and ties are generated at runtime.
- World chunks are pooled and recycled.
- Repeating art should be instanced or cloned from one loaded source.
- Dynamic shadows are intentionally avoided; the game uses inexpensive blob shadows.
- Fog limits the useful detail range and hides chunk recycling.

Blender models are visual assets. They must not replace the procedural path or become
the authoritative source for gameplay collision.

## 3. Art direction

### Visual identity

The world is an ancient industrial railway built through impossible underground ruins.
It combines:

- Hand-hewn rock and oversized timber engineering.
- Copper, black iron, rivets, straps, braces, and worn mine hardware.
- Warm practical lights against cool ambient cave colours.
- Strong low-poly silhouettes with restrained surface detail.
- Slightly exaggerated proportions so hazards read on small screens.
- Original Sunheart technology: gold light, geometric relic shapes, and controlled
  emissive accents.

### Shape language

- **Safe route:** broad horizontal shapes, rounded bevels, warm wood, neutral stone.
- **Danger:** points, hanging silhouettes, hot-red accents, diagonal braces, broken edges.
- **Reward:** compact diamond/octahedral shapes with gold, violet, or mint emission.
- **Ancient industry:** chunky construction, large fasteners, visible repair plates.
- **Iron Maw:** heavy asymmetry, teeth, crushing mechanisms, black silhouettes, red eyes.

### Detail hierarchy

Every view should contain three levels of detail:

1. Large forms: tunnel profile, support arches, cliffs, machinery, landmarks.
2. Medium forms: braces, rock clusters, pipes, carts, crates, rail debris.
3. Small accents: bolts, cracks, splinters, ore seams, warning lights, dust.

Small detail must support silhouettes and material separation. It must not become noisy
geometry that disappears at gameplay distance.

### Colour language

- Timber: warm umber and dark end grain.
- Structural iron: charcoal with restrained metallic response.
- Copper/Sunheart: warm orange-gold.
- Hazards: hot red, used sparingly and consistently.
- Power-ups: mint-positive colour family.
- Ember Shards: warm gold.
- Prisms: violet.

Decorative crystals must be placed against walls, use clustered silhouettes, and differ
in scale and colour balance from collectible trails.

## 4. Biome requirements

### Crystal Hollow

- Mineral cavern, not a neon void.
- Layered slate/obsidian rock clusters.
- Cyan and violet crystals integrated into walls and floor seams.
- Ancient timber remnants and occasional Sunheart archaeology.
- Decorative crystals remain visually distinct from collectibles.

### Timber Maw Mine

- Primary reference biome for the first art-quality pass.
- Repeating timber support arches, braces, iron straps, torches, ore piles, ballast,
  broken boards, carts, signs, and maintenance platforms.
- Warm torch pools with cooler, darker rock between them.
- Supports should frame the track rhythmically without obstructing gameplay visibility.

### Flooded Ravine

- Open cliffs, wet rock, timber bridges, mine structures, twisted trees, waterfalls,
  hanging roots, moss, and mist anchors.
- Brighter relief biome, but rails and hazards must maintain contrast.
- Water surfaces and waterfalls are animated in Three.js; Blender provides their frames,
  cliff anchors, and optional simple cards.

### Ember Forge

- Blackened stone, iron ducts, pipes, gears, chains, vents, crucibles, warning lamps,
  and magma channels.
- Large moving machinery may use procedural rotation or short authored clips.
- Emissive orange is reserved for heat sources and must not flatten the whole scene.

## 5. Coordinate and scale contract

- Blender units: metres, unit scale `1.0`.
- Blender up axis: `+Z`.
- Blender asset forward: `-Y`.
- After glTF conversion, imported gameplay forward is `+Z` in Three.js.
- Width is Blender `X`; depth/track direction is Blender `Y`; height is Blender `Z`.
- Apply scale before export. Static mesh transforms should be clean unless a named node
  intentionally carries a transform.
- Static environment asset origin: ground centre on the track centreline.
- Character origin: between the feet at ground level.
- Cart origin: centred between wheel contact points at rail height.
- Obstacles: origin at the lane centre and leading-edge midpoint unless documented.

Current lane centres are `-2.2 m`, `0 m`, and `+2.2 m`. A full three-lane environment
frame must preserve a clear opening of at least `12.0 m` wide and `5.1 m` high.

## 6. Geometry standards

- Low-poly does not mean untreated cubes. Use silhouette variation, one-segment bevels,
  flat or controlled normals, taper, asymmetry, and purposeful overlaps.
- Repeating props: usually 100–800 triangles.
- Major obstacles: usually 300–1,500 triangles.
- Hero cart: approximately 2,500–4,000 triangles.
- Rin character: approximately 2,000–4,000 triangles before optional accessories.
- Major landmark/Iron Maw: approximately 4,000–8,000 triangles.
- Avoid unseen interior faces where practical.
- Avoid micro-bevel subdivisions; one bevel segment is normally sufficient.
- Avoid Boolean-heavy topology in exported meshes unless cleaned and triangulated.
- Modifiers must be applied by the generator before `.glb` export.
- Exported geometry is triangulated for deterministic counts.

### Draw-call policy

- Target one mesh primitive per material.
- A normal repeating environment asset should use no more than three materials.
- Join static pieces by material before export.
- Named sockets remain empties and do not add draw calls.
- Avoid unique materials that differ only slightly in colour.

## 7. Materials and texture policy

The initial asset set uses compact PBR materials and vertex/mesh colour variation.
Texture atlases may be added later only when they provide visible benefit.

- Wood: roughness `0.82–0.95`, metallic `0.0`.
- Stone: roughness `0.90–1.0`, metallic `0.0`.
- Iron: roughness `0.52–0.72`, metallic `0.65–0.85`.
- Copper: roughness `0.35–0.55`, metallic `0.70–0.90`.
- Emissive elements use a separate clearly named material.
- Transparent materials are exceptional and should be reviewed for sorting cost.

Material names use the prefix `MAT_`, for example `MAT_Wood_Primary` and
`MAT_Iron_Dark`.

## 8. Naming and hierarchy

### Files

- Generator: `scripts/blender/generate_<asset_id>.py`
- Blender source: `art/blender/<asset_id>/<asset_id>.blend`
- Runtime export: `art/exports/<asset_id>/<asset_id>.glb`
- Preview: `art/previews/<asset_id>.png`
- Validation metadata: `art/reports/<asset_id>.json`
- Asset specification: `docs/assets/<ASSET_NAME>.md`

### Blender nodes

- Root empty: exact asset ID, for example `timber_support_arch`.
- Geometry: `GEO_<description>`.
- Armature: `RIG_<description>`.
- Sockets: `SOCKET_<purpose>`.
- Collision reference: `COL_<description>`; collision meshes are normally excluded from
  runtime export because track-space collision remains authoritative.

Every root receives custom properties:

- `asset_id`
- `asset_version`
- `game`
- `asset_type`
- `animation_mode`
- `generator`

## 9. Animation strategy

High-quality animation means consistent timing, arcs, anticipation, follow-through, and
readability. It does not mean baking animation into every prop.

### Authored Blender animation

Use skeletal or object clips when motion expresses personality or has a non-trivial pose:

- Rin: `idle_cart`, `lean_left`, `lean_right`, `jump_takeoff`, `jump_air`, `land`,
  `duck`, `stumble`, `crash`, and optional celebration/result clips.
- Iron Maw: `chase_loop`, `lunge`, `hit_react`, and `catch`.
- Large one-off machinery: short mechanical cycles when procedural rotation is
  insufficient.

### Runtime procedural animation

Use code-driven motion for synchronized, repeated, or state-dependent movement:

- Minecart wheel spin and suspension rattle.
- Cart lean, jump trajectory, crash spin, and speed response.
- Torches, fire jets, warning lights, emissive pulses, waterfalls, and particles.
- Pickups: bob, spin, magnet attraction, and collection burst.
- Gears, fans, pistons, and oncoming cart wheels when a simple loop is enough.
- Support-arch dust, rare creak particles, and light flicker.

This avoids duplicated animation data and keeps instancing available.

### Clip standards

- Author at 30 fps; runtime interpolation provides smooth display at higher frame rates.
- Loop clips have matching first/last poses without duplicated visible holds.
- No root motion unless an asset specification explicitly requires it.
- Clip names are lower snake case.
- Character actions should include 2–4 frames of anticipation and 3–6 frames of
  settle/follow-through when gameplay timing allows.
- Avoid animation curves that overshoot collision-critical silhouettes.
- NLA tracks must be clean and export only approved actions.

## 10. Asset catalogue

### Hero and chase assets

- Hero minecart: hull, chassis, four named wheels, Sunheart lantern, trim, suspension
  anchors, rider socket, shadow footprint.
- Rin Vale: low-poly character, compact rig, scarf and ponytail secondary motion anchors.
- Iron Maw: readable chase silhouette, eyes, grinders, shoulder mechanisms.

### Obstacles

- Blocker cart and oncoming variant.
- Broken rail/gap marker.
- Low beam.
- Half-closed portcullis gate.
- Rock pile.
- Fire jet.
- Crystal spikes.
- Minor debris cluster.

Obstacle shapes must communicate the required action before surface detail:

- Wide solid mass = switch lanes.
- Low floor mass/gap edge = jump.
- High horizontal silhouette = duck.

### Collectibles and power-ups

- Ember Shard.
- Prism.
- Magnet, shield, ghost, frenzy, and repair icons/cores.

These remain extremely low-cost and primarily use runtime spin, bob, emission, and
particles.

### Modular environment assets

- Timber support arches A/B/C.
- Rock wall and floor clusters.
- Rail ballast, ore, rubble, planks, crates, signs, chains, ropes, and maintenance props.
- Torches and warning lamps.
- Crystal clusters and dark mineral boulders.
- Ravine cliffs, trees, roots, bridge structures, waterfall frames.
- Forge pipes, ducts, vents, gears, pistons, crucibles, and magma channel borders.
- Junction mouth frames and landmark silhouettes.

## 11. Export contract

- Format: binary glTF 2.0 (`.glb`).
- Export only the selected asset root, its meshes, and approved sockets.
- Apply modifiers and triangulate.
- Include custom properties/extras.
- Do not export preview camera, lights, ground, or staging geometry.
- Animation export is disabled for static props.
- Prefer compact geometry and shared materials over decoder-dependent compression.
- Every `.glb` should ideally remain below 512 KiB.

The generator must also save an editable `.blend`, render a preview, and write a JSON
report containing dimensions, mesh count, material count, vertices, triangles, sockets,
animation mode, and output size.

## 12. Quality gates

An asset is complete only when:

1. Scale and origin match the contract.
2. Silhouette reads at gameplay camera distance.
3. Required clearance is preserved.
4. Materials match the art bible.
5. Triangle and material budgets pass.
6. Named sockets and animated nodes are present.
7. `.blend`, `.glb`, preview, and report are generated deterministically.
8. The `.glb` can be loaded by Three.js without missing resources.
9. The asset is verified in landscape and portrait gameplay views after integration.
10. The playable still passes typecheck, tests, bundle checks, and performance review.

## 13. Current production sequence

1. Timber Support Arch A — reference-quality environment standard.
2. Rock Wall Cluster A.
3. Torch Sconce A.
4. Rail Ballast and Debris Cluster A.
5. Hero Minecart.
6. Rin Vale rider.
7. Blocker/oncoming cart.
8. Remaining obstacle set.
9. Crystal Hollow kit.
10. Flooded Ravine kit.
11. Ember Forge kit.
12. Iron Maw.
