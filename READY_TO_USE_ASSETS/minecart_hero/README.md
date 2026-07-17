# minecart_hero

Hero Emberdeep minecart with copper trim and Sunheart lantern.

## Runtime file

Use `minecart_hero.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: between wheel contact points at rail height.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `idle_loop`: frames 1–60 at 30 fps (loop) — Subtle suspension breathing and Sunheart pulse.
- `wheel_spin_loop`: frames 70–100 at 30 fps (loop) — One full consistent wheel revolution.
- `suspension_hit`: frames 110–145 at 30 fps (one-shot) — Compression, overshoot, and settle.
- `crash`: frames 160–210 at 30 fps (one-shot) — Readable airborne roll and ground settle.

## Runtime notes

- Runtime gameplay may override wheel spin, lean, jump trajectory, and crash transform.
- Attach Rin to SOCKET_rider.
