# Relic Rails — Ready-to-Use Asset Catalog

This folder contains 35 individually packaged low-poly assets for Relic Rails: Abyss Run.
Each asset folder contains a runtime GLB, editable Blender source, preview, manifest, and usage README.

| Asset | Category | Triangles | GLB | Animation clips | Valid |
|---|---|---:|---:|---|:---:|
| `blocker_cart` | obstacle | 380 | 32148 bytes | Static | ✓ |
| `broken_rail` | obstacle | 292 | 23864 bytes | Static | ✓ |
| `crystal_cavern_platform` | environment_modular_track_platform | 1840 | 152996 bytes | Static | ✓ |
| `crystal_cluster_large` | environment_prop | 120 | 13464 bytes | Static | ✓ |
| `crystal_cluster_small` | environment_prop | 120 | 13412 bytes | Static | ✓ |
| `crystal_spikes` | obstacle | 104 | 11612 bytes | Static | ✓ |
| `debris_cluster` | obstacle | 136 | 14504 bytes | Static | ✓ |
| `ember_forge_platform` | environment_modular_track_platform | 2112 | 168116 bytes | Static | ✓ |
| `ember_shard` | collectible | 8 | 4904 bytes | collectible_loop | ✓ |
| `fire_jet` | obstacle | 312 | 28640 bytes | flame_loop, burst | ✓ |
| `flooded_ravine_platform` | environment_modular_track_platform | 1952 | 155752 bytes | Static | ✓ |
| `forge_gear` | environment_prop | 648 | 57832 bytes | gear_spin_loop | ✓ |
| `forge_pipe` | environment_prop | 936 | 67092 bytes | valve_vent_loop | ✓ |
| `iron_maw` | chase_guardian | 780 | 82256 bytes | chase_loop, lunge, catch | ✓ |
| `low_beam` | obstacle | 284 | 26216 bytes | chain_sway_loop | ✓ |
| `minecart_hero` | hero_vehicle | 1140 | 98108 bytes | idle_loop, wheel_spin_loop, suspension_hit, crash | ✓ |
| `oncoming_cart` | obstacle | 400 | 39224 bytes | approach_loop | ✓ |
| `portcullis_gate` | obstacle | 396 | 37448 bytes | warning_shudder, lift_cycle | ✓ |
| `powerup_frenzy` | powerup | 212 | 24716 bytes | pickup_loop | ✓ |
| `powerup_ghost` | powerup | 200 | 24804 bytes | pickup_loop | ✓ |
| `powerup_magnet` | powerup | 360 | 35956 bytes | pickup_loop | ✓ |
| `powerup_repair` | powerup | 272 | 27528 bytes | pickup_loop | ✓ |
| `powerup_shield` | powerup | 204 | 23252 bytes | pickup_loop | ✓ |
| `prism` | collectible | 116 | 14628 bytes | collectible_loop | ✓ |
| `rail_ballast_cluster` | environment_prop | 232 | 26600 bytes | Static | ✓ |
| `ravine_tree` | environment_prop | 260 | 31892 bytes | wind_sway_loop | ✓ |
| `rin_vale` | hero_character | 704 | 124072 bytes | idle_cart, lean_left, lean_right, jump, duck, stumble, crash, celebrate | ✓ |
| `rock_pile` | obstacle | 120 | 15584 bytes | Static | ✓ |
| `rock_wall_cluster` | environment_prop | 100 | 13052 bytes | Static | ✓ |
| `timber_mine_platform` | environment_modular_track_platform | 1912 | 158320 bytes | Static | ✓ |
| `timber_support_arch` | environment_modular_support | 1236 | 91032 bytes | Static | ✓ |
| `timber_support_arch_b` | environment_modular_support | 624 | 47876 bytes | Static | ✓ |
| `timber_support_arch_c` | environment_modular_support | 592 | 46060 bytes | Static | ✓ |
| `torch_sconce` | environment_prop | 208 | 19972 bytes | flame_flicker_loop | ✓ |
| `waterfall_frame` | environment_prop | 184 | 18528 bytes | water_flow_loop | ✓ |

## Integration rule

Copy only the `.glb` files required by the current build into the game's served asset directory.
Load each GLB once and clone or instance repeated models. Use the manifest frame ranges to create
Three.js animation subclips from each embedded action library.
