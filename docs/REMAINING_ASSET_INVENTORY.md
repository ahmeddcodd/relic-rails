# Relic Rails — Remaining Blender Asset Inventory

This inventory is the completeness checklist for the batch following Timber Support
Arch A. Every row becomes an individual folder under `READY_TO_USE_ASSETS` containing a
GLB, editable Blend source, preview, README, and manifest.

All animation timelines use 30 fps, no gameplay root motion, consistent node naming,
and explicit frame ranges in each manifest. Static models deliberately contain no empty
animation tracks.

| # | Asset ID | Category | Animation delivery |
|---:|---|---|---|
| 1 | `minecart_hero` | Hero | Embedded action library: idle, wheel spin, suspension hit, crash |
| 2 | `rin_vale` | Character | Embedded action library: idle, lean L/R, jump, duck, stumble, crash, celebrate |
| 3 | `iron_maw` | Chase guardian | Embedded action library: chase, lunge, catch |
| 4 | `blocker_cart` | Obstacle | Static |
| 5 | `oncoming_cart` | Obstacle | Embedded wheel/headlamp loop |
| 6 | `broken_rail` | Obstacle | Static; particles are runtime FX |
| 7 | `low_beam` | Obstacle | Embedded warning-chain sway loop |
| 8 | `portcullis_gate` | Obstacle | Embedded shudder and lift cycles |
| 9 | `rock_pile` | Obstacle | Static |
| 10 | `fire_jet` | Obstacle | Embedded flame pulse and burst; particles remain runtime FX |
| 11 | `crystal_spikes` | Obstacle | Static; emission pulse may be runtime-controlled |
| 12 | `debris_cluster` | Obstacle | Static |
| 13 | `powerup_magnet` | Pickup | Embedded standardized bob/spin loop |
| 14 | `powerup_shield` | Pickup | Embedded standardized bob/spin loop |
| 15 | `powerup_ghost` | Pickup | Embedded standardized bob/spin loop |
| 16 | `powerup_frenzy` | Pickup | Embedded standardized bob/spin loop |
| 17 | `powerup_repair` | Pickup | Embedded standardized bob/spin loop |
| 18 | `ember_shard` | Collectible | Embedded standardized bob/spin loop |
| 19 | `prism` | Collectible | Embedded standardized bob/spin loop |
| 20 | `torch_sconce` | Environment | Embedded flame flicker loop plus runtime light socket |
| 21 | `crystal_cluster_small` | Environment | Static |
| 22 | `crystal_cluster_large` | Environment | Static |
| 23 | `ravine_tree` | Environment | Embedded subtle wind-sway loop |
| 24 | `forge_pipe` | Environment | Embedded valve/vent loop |
| 25 | `forge_gear` | Environment | Embedded mechanical rotation loop |
| 26 | `waterfall_frame` | Environment | Embedded water-card flow loop and runtime mist socket |
| 27 | `rock_wall_cluster` | Environment | Static |
| 28 | `rail_ballast_cluster` | Environment | Static |
| 29 | `timber_support_arch_b` | Environment | Static with runtime FX sockets |
| 30 | `timber_support_arch_c` | Environment | Static with runtime FX sockets |

## Consistency rules

- Shared colour and PBR palette across all folders.
- Low-poly silhouettes use flat shading and single-segment bevels.
- Animated assets use one embedded scene timeline with manifest-defined subclips.
- Loop endpoints match and are suitable for Three.js `AnimationMixer` subclips.
- Runtime-controlled effects also have explicit `SOCKET_` nodes.
- Pickups share the same 60-frame timing so they never appear rhythmically inconsistent.
- Hero animation exaggeration is stronger than environmental animation.
- Hazards preserve the current collision silhouettes and required-action language.
- Static environment props remain instancing-friendly.
