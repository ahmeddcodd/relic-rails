# Timber Support Arch — Ready-to-Use Package

Use `timber_support_arch.glb` as the runtime model in the Three.js game.

## Package files

- `timber_support_arch.glb` — optimized game-ready model.
- `timber_support_arch.blend` — editable Blender 5.1 source.
- `timber_support_arch_preview.png` — visual reference.
- `asset_manifest.json` — dimensions, hierarchy, materials, and performance data.

## Three.js loading

Copy the GLB into the game's served asset directory, then load it once with
`GLTFLoader`:

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load('./assets/models/environment/timber_support_arch.glb', (gltf) => {
  const arch = gltf.scene.getObjectByName('timber_support_arch') ?? gltf.scene;
  scene.add(arch);
});
```

For repeated tunnel supports, load the file once and clone or instance its three
geometry meshes. Do not load the GLB separately for every arch.

## Runtime hierarchy

```text
timber_support_arch
├── GEO_wood_primary
├── GEO_wood_dark
├── GEO_iron
├── SOCKET_torch_left
├── SOCKET_torch_right
├── SOCKET_dust_left
├── SOCKET_dust_right
└── SOCKET_apex_fx
```

The asset is static. Torch flicker, dust, falling grit, and rare creak effects should
be added at the named sockets in Three.js.

## Placement

- Place the root at the track centreline and ground height.
- Three.js up axis: `+Y`.
- Three.js gameplay forward: `+Z`.
- Clear opening: `12.0 m` wide and `6.35 m` high.
- Do not use the visual geometry for gameplay collision.
