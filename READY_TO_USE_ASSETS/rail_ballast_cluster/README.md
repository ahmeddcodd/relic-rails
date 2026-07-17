# rail_ballast_cluster

Small ballast, broken tie wood, and loose hardware for near-camera rail detail.

## Runtime file

Use `rail_ballast_cluster.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: ground edge beside rails.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- Static asset; no baked animation clip.

## Runtime notes

- Instance along rail shoulders, never in the collision lane centre.
