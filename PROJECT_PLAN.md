# Project plan — Relic Rails: Abyss Run

Goal: a certification-safe YouTube Playables endless minecart runner with original IP,
premium procedural visuals, and a skill loop (Perfect actions → combo → Overdrive →
chase pressure) that makes 60–150 s runs replayable.

## Phase map (build order)
1. **Foundation** — scaffold, renderer/quality tiers, platform bridge (mock + YT),
   state machine, input. *Gate: boots clean, resizes, no console errors.* ✅
2. **Core loop** — track path, cart controller, 3 lanes, jump/duck, collision,
   pickups, score, crash, instant restart. *Gate: full loop on touch+mouse+keys.* ✅
3. **Visual slice** — hero cart + Rin, Timber Mine kit, fog/lighting, particles,
   HUD polish. *Gate: reads as a real game, no gray-box.* ✅
4. **Endless systems** — director phases, fairness validator, pooling, combo,
   near-miss, Overdrive, Iron Maw. *Gate: validator clean across seeds.* ✅
5. **Content** — 4 biomes, 9 obstacle types, 5 power-ups, transitions. ✅
6. **Progression** — ranks, totals, settings, versioned save + migrations. ✅
   (contracts/cosmetics deferred — see PROGRESS.md)
7. **Platform** — SDK lifecycle ordering, pause/resume, audio gating, score submit. ✅
8. **Optimization** — instancing/merging (~4 draw calls per chunk), ~150 KiB bundle. ✅
9. **QA** — unit tests (21), in-browser verification incl. biome tour, portrait,
   soak runs. ✅ (automated e2e deferred)

## Source of truth
- Tuning: `src/config/tuning.ts` · Palette: `src/render/palette.ts`
- Save schema: `src/platform/save.ts` · Fairness: `src/game/director.ts`
