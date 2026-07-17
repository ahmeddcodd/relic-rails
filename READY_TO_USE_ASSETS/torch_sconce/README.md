# torch_sconce

Iron wall sconce with timber handle and animated low-poly flame.

## Runtime file

Use `torch_sconce.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: wall attachment point at root.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `flame_flicker_loop`: frames 1–45 at 30 fps (loop) — Irregular but seamless flame movement.

## Runtime notes

- Use a pooled runtime light at SOCKET_point_light.
- Seed clip playback offset per instance to avoid synchronization.
