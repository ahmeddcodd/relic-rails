# rin_vale

Low-poly Emberdeep scavenger hero with scarf, goggles silhouette, and relic backpack.

## Runtime file

Use `rin_vale.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: between the feet at ground level.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `idle_cart`: frames 1–60 at 30 fps (loop) — Balanced breathing, head counter-motion, and scarf follow-through.
- `lean_left`: frames 70–90 at 30 fps (one-shot) — Fast readable left commitment and return.
- `lean_right`: frames 100–120 at 30 fps (one-shot) — Mirrored right commitment and return.
- `jump`: frames 130–170 at 30 fps (one-shot) — Anticipation, arm lift, airborne pose, and landing settle.
- `duck`: frames 180–210 at 30 fps (one-shot) — Compressed silhouette held through the clearance window.
- `stumble`: frames 220–250 at 30 fps (one-shot) — Two-stage balance recovery.
- `crash`: frames 260–310 at 30 fps (one-shot) — Large readable tumble pose.
- `celebrate`: frames 320–360 at 30 fps (one-shot) — Two-arm victory gesture with settle.

## Runtime notes

- Attach the root to the minecart SOCKET_rider.
- Runtime cart lean may layer over or replace lean clips.
