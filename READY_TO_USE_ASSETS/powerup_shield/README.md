# powerup_shield

Readable low-poly shield power-up with a shared mint pickup ring.

## Runtime file

Use `powerup_shield.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: lane centre, root at ground; visible core centred at 1 m.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `pickup_loop`: frames 1–60 at 30 fps (loop) — Shared two-second bob and spin cadence used by every power-up.

## Runtime notes

- Runtime magnet attraction may override root position.
- All power-ups use identical loop timing for visual consistency.
