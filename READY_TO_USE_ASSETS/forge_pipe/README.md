# forge_pipe

Black-iron forge pipe with copper valve and pulsing heat vent.

## Runtime file

Use `forge_pipe.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: ground/wall attachment centre.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `valve_vent_loop`: frames 1–60 at 30 fps (loop) — Slow valve rotation and offset heat pulse.

## Runtime notes

- Steam particles are emitted from SOCKET_steam.
