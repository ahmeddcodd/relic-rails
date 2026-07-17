# forge_gear

Large ten-tooth forge gear with copper hub and continuous mechanical loop.

## Runtime file

Use `forge_gear.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: gear axle centre projected to ground root.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `gear_spin_loop`: frames 1–60 at 30 fps (loop) — Two-second constant-speed rotation.

## Runtime notes

- Reverse playback for meshing neighbouring gears.
