# Relic Rails: Abyss Run

An endless minecart runner for **YouTube Playables**, built with Three.js + TypeScript + Vite.
Rin Vale stole the Sunheart Core; the Emberdeep Railway woke up angry. Swipe to survive,
collect Ember Shards, chain Perfect actions, ignite Overdrive, and outrun the Iron Maw
through four biomes: Timber Maw Mine → Flooded Ravine → Crystal Hollow → Ember Forge.

## Commands

```sh
npm install
npm run dev        # local dev on http://localhost:5176 (no YouTube SDK needed)
npm run build      # production bundle in dist/
npm run preview    # serve the production bundle
npm run typecheck  # strict TS check
npm run test       # vitest unit tests (scoring, save migration, RNG, fairness)
npm run sizecheck  # Playables bundle-limit check (run after build)
```

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Switch rail | swipe ◀ ▶ | A / D or ← / → |
| Jump | swipe ▲ | W / ↑ / Space |
| Duck (or fast-fall) | swipe ▼ | S / ↓ |
| Overdrive | tap the ☀ button | Shift / E |
| Pause (local dev only) | — | Esc |

## Architecture (short version)

- `src/config/tuning.ts` — every gameplay number. No magic numbers elsewhere.
- `src/platform/bridge.ts` — the ONLY file touching `window.ytgame`. Local dev uses a
  localStorage mock; the real bridge is selected at runtime when the SDK is present.
- `src/platform/save.ts` — versioned, migration-safe save (< 1 KiB).
- `src/game/track.ts` — ring-buffer arc-length track path + pooled visual chunks
  (merged vertex-colored environment geometry, ~4 draw calls per 32 m chunk).
- `src/game/director.ts` — phase-gated procedural generation with explicit fairness
  rules and a validator (`validatePlan`, unit-tested across seeds).
- `src/game/game.ts` — state machine + run loop; owns SDK lifecycle ordering.
- `src/audio/audio.ts` — fully procedural WebAudio (layered music stems + synth SFX,
  zero audio files, no autoplay, platform-audio gated).
- All models are procedural primitives via shared caches (`src/render/assets.ts`) —
  zero external assets, zero licensing surface.

See `ARCHITECTURE-notes in TECHNICAL_DECISIONS.md` for the reasoning behind each call.

## YouTube Playables lifecycle

1. SDK `<script>` loads first in `index.html`.
2. First rendered frame (loading screen + pre-generated world) → `firstFrameReady()`.
3. `await loadData()` → migrate save → menu shown → `gameReady()` (player can interact).
4. Saves are debounced/batched; flushed on run end. Score submission only when the
   submitted value equals the saved best.
5. Pause/resume only via SDK callbacks (mirrored locally with `visibilitychange`).
6. Audio bus is gated by `isAudioEnabled()` + `onAudioEnabledChange` and only unlocks
   after a user gesture.

## Browser support

WebGL-capable evergreen browsers. Quality tiers (high/medium/low) selected by a
non-blocking device heuristic; DPR capped per tier; blob shadows only (no shadow maps).

## Troubleshooting

- **Black screen locally** — check the console; the game must boot with zero errors.
- **No audio** — audio unlocks on the first pointer/key gesture (autoplay policy).
- **Slow on old devices** — quality tier drops automatically; "Reduced effects" in
  Settings also lowers camera shake and flash effects.
