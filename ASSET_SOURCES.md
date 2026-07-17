# Asset sources — Relic Rails: Abyss Run

## Authored 3D models

All runtime models are supplied by the project’s own Blender asset pack under
`READY_TO_USE_ASSETS/`. Each asset directory contains its optimized `.glb`, editable
`.blend` source, preview render, manifest, and integration README.

The production build bundles only the `.glb` runtime files. `src/render/assets.ts`
loads each model once and reuses its geometry and materials through clones or
`InstancedMesh` rendering. Nothing is downloaded or hotlinked at runtime.

## Blender-authored track and world

- The complete track bed/deck, sleepers, six rails, fasteners, filled shoulder spaces,
  left/right mountains, walls, and ceilings are authored as four-metre Blender GLB
  modules for all four biomes. Shoulder infill is biome-specific: cavern terrain and
  ballast, timber supplies, ravine water and bank stone, or forge catwalks and magma seams.
- Three.js only computes the procedural route and instances each Blender module onto a
  grade-aware track basis. The gradient sky atmosphere, shadows, shields, particles, and
  light glows remain transient runtime effects.
- Audio is synthesized with the Web Audio API; there are no recordings or music files.
- Fonts use the system font stack; there are no bundled webfonts.

No third-party art or audio assets are referenced by the game. Three.js is MIT licensed.
