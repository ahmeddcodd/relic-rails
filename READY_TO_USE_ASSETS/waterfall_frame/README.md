# waterfall_frame

Timber-framed layered waterfall card with subtle flowing silhouette animation.

## Runtime file

Use `waterfall_frame.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: ground centre at waterfall base.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `water_flow_loop`: frames 1–60 at 30 fps (loop) — Counter-offset layered flow motion.

## Runtime notes

- Use runtime mist and splash particles at named sockets.
- Material opacity may be tuned in Three.js for the scene background.
