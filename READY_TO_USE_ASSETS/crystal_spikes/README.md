# crystal_spikes

Faceted crystal jump hazard with a consistent red base telegraph.

## Runtime file

Use `crystal_spikes.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: lane centre on ground.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- Static asset; no baked animation clip.

## Runtime notes

- Decorative wall crystals must not use this red base silhouette.
