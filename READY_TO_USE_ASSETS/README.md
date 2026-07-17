# Relic Rails: Abyss Run - Complete Blender Asset Pack

This folder contains 35 individually packaged, low-poly game assets for a
three-lane minecart endless runner built for HTML5 and YouTube Playables.

The visual language is a readable stylized mine: warm timber and copper,
dark iron, faceted stone, bright hazard red, golden Ember Shards, cyan/violet
crystals, and controlled emissive accents. Geometry and materials are kept
small enough for real-time mobile WebGL use.

## What is included

Every asset folder contains:

- `<asset_id>.glb` - ready-to-load Three.js runtime asset
- `<asset_id>.blend` - editable Blender 5.1 source
- `<asset_id>_preview.png` - rendered visual reference
- `asset_manifest.json` - dimensions, budgets, sockets, and animation ranges
- `README.md` - asset-specific placement and runtime notes

Use `ASSET_CATALOG.md` for the human-readable list and `ASSET_CATALOG.json`
for tooling. `ASSET_CONTACT_SHEET.png` previews the full visual set, and
`VALIDATION_REPORT.json` records the clean-scene re-import test.

## Coordinate and animation contract

- Runtime units: metres
- Runtime up axis: `+Y`
- Runtime forward axis: `+Z`
- Animation rate: 30 fps
- Gameplay root motion: none; the game controls lane, jump, speed, and chase position
- Static props contain no empty animation tracks
- Repeated pickups share the same 60-frame bob/spin timing
- Particle-heavy effects stay in Three.js and attach to exported `SOCKET_` nodes

Animated GLBs contain a merged authored timeline. Each manifest lists named
subclip frame ranges. A typical Three.js setup is:

```js
const gltf = await loader.loadAsync(url);
const source = gltf.animations.find(
  clip => clip.name === manifest.animation.library
) ?? gltf.animations[0];

const clips = Object.fromEntries(
  manifest.animation.clips.map(({ name, start, end }) => [
    name,
    THREE.AnimationUtils.subclip(source, name, start, end, manifest.animation.fps)
  ])
);

const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(clips.idle_loop ?? clips.pickup_loop ?? Object.values(clips)[0]).play();
```

Load each GLB once, then clone or instance repeated props. Keep only the GLBs
needed by the current playable build in its served asset directory.

## Main groups

- Heroes: minecart, Rin Vale, and Iron Maw chase guardian
- Obstacles: carts, broken rail, low beam, portcullis, rocks, fire, crystals, debris
- Pickups: five power-ups, Ember Shard, and Prism
- Environment: torches, crystal clusters, ravine tree, forge machinery, waterfall,
  rock/ballast dressing, three modular timber support arches, and four complete
  biome platform modules containing track, mountains, walls, and ceilings

The complete authored design context is in `../docs/BLENDER_ASSET_BIBLE.md` and
`../docs/REMAINING_ASSET_INVENTORY.md`.
