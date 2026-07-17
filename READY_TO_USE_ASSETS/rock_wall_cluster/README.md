# rock_wall_cluster

Modular layered rock silhouette for breaking up procedural cavern walls.

## Runtime file

Use `rock_wall_cluster.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: wall or ground attachment centre.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- Static asset; no baked animation clip.

## Runtime notes

- Rotate, mirror, and vary scale between 0.85 and 1.15 per instance.
