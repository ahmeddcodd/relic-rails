# iron_maw

Ancient mechanical guardian with grinders, crushing jaw, and red pursuit eyes.

## Runtime file

Use `iron_maw.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: ground centre behind the player.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at 30 fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

- `chase_loop`: frames 1–60 at 30 fps (loop) — Heavy pursuit bob, jaw chatter, and counter-rotating grinders.
- `lunge`: frames 70–105 at 30 fps (one-shot) — Anticipation, forward surge, jaw opening, and recoil.
- `catch`: frames 120–160 at 30 fps (one-shot) — Wide bite followed by crushing closure.

## Runtime notes

- Runtime chase pressure controls distance and scale visibility.
- Eye emission and dust intensity may be driven by pressure.
