# crystal_cluster_small

Small wall-integrated cyan/violet crystal formation.

## Runtime file

Use `crystal_cluster_small.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: rock/floor attachment point.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- Static asset; no baked animation clip.

## Runtime notes

- Keep clusters against cavern surfaces so they do not resemble collectible trails.
