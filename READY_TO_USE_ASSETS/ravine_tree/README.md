# ravine_tree

Twisted low-poly ravine tree with layered canopy and subtle wind motion.

## Runtime file

Use `ravine_tree.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: ground centre at trunk base.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `wind_sway_loop`: frames 1–90 at 30 fps (loop) — Three-second unsynchronized canopy sway.

## Runtime notes

- Offset playback time per tree instance.
- Leaf motes and mist remain pooled runtime FX.
