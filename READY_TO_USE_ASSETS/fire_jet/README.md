# fire_jet

Forge vent with layered animated flame meshes and runtime particle sockets.

## Runtime file

Use `fire_jet.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: lane centre on ground.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `flame_loop`: frames 1–30 at 30 fps (loop) — Asymmetric low-poly flame pulse.
- `burst`: frames 45–80 at 30 fps (one-shot) — Rapid ignition, sustained jet, and shutdown.

## Runtime notes

- Use runtime particles and heat distortion for close-range richness.
