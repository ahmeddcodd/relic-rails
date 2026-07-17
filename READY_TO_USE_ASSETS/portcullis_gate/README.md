# portcullis_gate

Measured half-closed iron portcullis with animated shudder and lift cycles.

## Runtime file

Use `portcullis_gate.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: lane centre on ground.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `warning_shudder`: frames 1–32 at 30 fps (one-shot) — Metallic side-to-side warning shudder.
- `lift_cycle`: frames 45–90 at 30 fps (one-shot) — Heavy lift, hold, and controlled drop.

## Runtime notes

- Rigid clearance is 2.25 m above the rail plane.
- Gameplay uses the default half-closed pose.
- Only play lift_cycle for set pieces or transitions.
