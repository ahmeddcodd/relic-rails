# Relic Rails: Abyss Run

An endless minecart runner for **YouTube Playables**, built with Three.js + TypeScript + Vite.
Rin Vale stole the Sunheart Core; the Emberdeep Railway woke up angry. Swipe to survive,
collect Ember Shards, chain Perfect actions, ignite Overdrive, and outrun the Iron Maw
through four biomes: Crystal Hollow → Timber Maw Mine → Flooded Ravine → Ember Forge
(dark opener, red-hot finale). The biome order is `BIOMES` in `src/render/palette.ts`.

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
| Overdrive | tap the ☀ button, or tap anywhere when charged | Shift / E |
| Skip the crash | tap | — |
| Pause (local dev only) | — | Esc |

Swipes commit on **distance alone** (a fast flick commits sooner, at a shorter
distance) — requiring distance *and* velocity together silently dropped ordinary
deliberate thumb swipes. A finger that stays down can chain a *different*
direction (left, then jump) without lifting, but never repeats the same one: that
turned a single 100 px drag into two lane changes. Thresholds: `TUNING.gesture`.

## Architecture (short version)

- `src/config/tuning.ts` — every gameplay number. No magic numbers elsewhere.
- `src/platform/bridge.ts` — the ONLY file touching `window.ytgame`. Local dev uses a
  localStorage mock; the real bridge is selected at runtime when the SDK is present.
- `src/platform/save.ts` — versioned, migration-safe save (< 1 KiB).
- `src/game/track.ts` — ring-buffer arc-length track path + pooled visual chunks;
  complete four-metre Blender platform modules with filled shoulders are instanced along
  curves and slopes.
- `src/game/director.ts` — phase-gated procedural generation with explicit fairness
  rules and a validator (`validatePlan`, unit-tested across seeds).
- `src/game/game.ts` — state machine + run loop; owns SDK lifecycle ordering.
- `src/audio/audio.ts` — fully procedural WebAudio (layered music stems + synth SFX,
  zero audio files, no autoplay, platform-audio gated).
- `src/render/assets.ts` — one-time GLB preload, pooled clones, authored subclips,
  instanced collectibles, and instanced biome track/platform modules.
- `src/render/gfx.ts` — camera-centred gradient sky, biome sun/stars/cloud bands, fog,
  and complementary rim lighting in one lightweight atmospheric draw call.

See `ARCHITECTURE-notes in TECHNICAL_DECISIONS.md` for the reasoning behind each call.

## YouTube Playables lifecycle

1. SDK `<script>` loads first in `index.html`.
2. The model pack starts downloading immediately; `firstFrameReady()` fires as
   soon as the loading screen paints, so YouTube can drop its own spinner without
   waiting on ~1.8 MiB of GLBs. Boot never blocks on `requestAnimationFrame`,
   which does not fire in a hidden or throttled tab.
3. `await loadData()` → migrate save → menu shown → `gameReady()` (player can interact).
4. Saves are debounced/batched; flushed on run end. Score submission only when the
   submitted value equals the saved best.
5. Pause/resume only via SDK callbacks (mirrored locally with `visibilitychange`).
   A pause is a HARD stop in every state, results screen included: the frame
   loop halts, audio suspends and cannot be restarted by a gesture, the input
   manager goes inert, and `#ui-root.frozen` makes every button unclickable so
   nothing can fire underneath YouTube's pause overlay.
6. Audio bus is gated by `isAudioEnabled()` + `onAudioEnabledChange` and only unlocks
   after a user gesture.

## Browser support

WebGL-capable evergreen browsers. Quality tiers (high/medium/low) selected by a
non-blocking device heuristic; DPR capped per tier; blob shadows only (no shadow maps).
That tier is a guess made before the first frame is drawn, so `Gfx.adapt()` then
corrects the render scale from measured frame time — stepping down below 50 fps
and recovering above ~74. Only the render buffer scales; geometry, UI and
gameplay are unaffected.

## Troubleshooting

- **Black screen locally** — check the console; the game must boot with zero errors.
- **No audio** — audio unlocks on the first pointer/key gesture (autoplay policy).
- **Slow on old devices** — quality tier drops automatically; "Reduced effects" in
  Settings also lowers camera shake and flash effects.
