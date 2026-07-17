# rock_pile

Layered low-poly rock pile with a clear red jump telegraph.

## Runtime file

Use `rock_pile.glb`. Load it once with Three.js `GLTFLoader`, then clone or
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

- No additional runtime note.
