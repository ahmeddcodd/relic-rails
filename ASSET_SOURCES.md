# Asset sources — Relic Rails: Abyss Run

**Every asset in this game is generated procedurally at runtime.**

- Models: composed from cached Three.js primitives (`src/render/assets.ts`).
- Textures: none, except two runtime-generated canvas gradients (blob shadow, UI ring).
- Audio: synthesized with the Web Audio API (`src/audio/audio.ts`). No recordings,
  no music files.
- Fonts: system font stack only (no bundled/webfonts).

No third-party assets were downloaded, bundled, or hotlinked. There is nothing to
attribute and no license obligations beyond the project's own dependencies
(three.js — MIT).
