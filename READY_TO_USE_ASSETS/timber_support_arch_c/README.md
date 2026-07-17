# timber_support_arch_c

Timber support variant C with burned timber and apex reinforcement.

## Runtime file

Use `timber_support_arch_c.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: track centreline at ground.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- Static asset; no baked animation clip.

## Runtime notes

- Same clearance and origin contract as Timber Support Arch A.
- Attach torches and dust to named sockets.
