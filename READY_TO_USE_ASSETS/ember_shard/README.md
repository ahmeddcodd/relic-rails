# ember_shard

Primary golden Ember Shard collectible.

## Runtime file

Use `ember_shard.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: lane position; root at ground and visual centred at 0.9 m.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `collectible_loop`: frames 1–60 at 30 fps (loop) — Shared bob and one-turn spin loop.

## Runtime notes

- Runtime collection and magnet pull override the root transform.
