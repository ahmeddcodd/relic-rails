# low_beam

Measured duck obstacle with timber supports, red warning bar, and swaying chains.

## Runtime file

Use `low_beam.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: lane centre on ground.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `chain_sway_loop`: frames 1–60 at 30 fps (loop) — Offset weighty warning-chain motion.

## Runtime notes

- Rigid clearance is 2.25 m above the rail plane: a 2.95 m standing rider collides and a 2.18 m crouched rider clears.
- The beam silhouette must remain fixed; only chains animate.
