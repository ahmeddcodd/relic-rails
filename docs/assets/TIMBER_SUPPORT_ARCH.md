# Asset 001 — Timber Support Arch A

## Role

`timber_support_arch` is the first Blender-authored asset and the visual benchmark for
the Timber Maw Mine. It replaces the impression of perfectly rectangular runtime boxes
with a deliberately constructed, hand-hewn mine support.

It should create a strong repeating rhythm around all three tracks without appearing to
be an obstacle.

## Story

The support was cut from oversized Emberdeep timber and repaired repeatedly by miners.
Its dark iron shoes and straps prevent the joints from splitting under the mountain's
weight. Uneven cuts, tapered posts, cracks, bolt heads, and mismatched braces show age,
but its silhouette remains solid and trustworthy.

## Dimensions and clearance

- Overall target width: approximately `14.4 m`.
- Overall target height: approximately `8.4 m`.
- Structural depth: approximately `0.58–0.72 m`.
- Clear gameplay opening: at least `12.0 m` wide.
- Clear height below collar structure: at least `6.35 m`.
- Origin: ground centre at `(0, 0, 0)`.
- Blender forward: `-Y`.

The existing track uses lane centres at `-2.2`, `0`, and `+2.2` metres, so the posts sit
well outside all cart envelopes.

## Construction

- Two slightly inward-leaning primary posts.
- Two sloped roof rafters forming a memorable pointed mine profile.
- A high collar tie that reinforces the roof without reading as a duck obstacle.
- Two knee braces.
- Iron base shoes, joint straps, gusset plates, and low-poly bolt heads.
- A small number of dark crack and grain insets on camera-facing surfaces.
- One-segment bevels on primary geometry.
- Controlled asymmetry so the asset feels hand-built.

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

The geometry is joined by material to target three draw calls before any engine-side
instancing or merging.

## Materials

- `MAT_Wood_Primary`: warm rough timber.
- `MAT_Wood_Dark`: dark end grain, cracks, and selected braces.
- `MAT_Iron_Dark`: straps, plates, shoes, and bolts.

## Animation policy

This asset is intentionally static and contains no baked Blender action.

Reasons:

- Support arches repeat frequently and should remain instancing-friendly.
- Visible structural swaying would make the tunnel feel unsafe and visually noisy.
- The cart already provides strong motion in the foreground.

High-quality secondary motion is provided through sockets:

- Torch flame and light flicker at the left/right torch sockets.
- Dust motes and occasional falling grit at the dust sockets.
- Rare creak particle or tiny camera-independent vibration effect at the apex socket.

These effects should be seeded by arch instance so repeated arches do not animate in
perfect synchronization.

## Variation plan

- Variant A: balanced intact arch; this asset.
- Variant B: repaired left post, extra iron band, missing knee brace.
- Variant C: darker burned wood, reinforced apex, hanging chain socket.

Variants retain identical clearance and origin contracts.

## Budget

- Target triangles: `600–1,400`.
- Materials: exactly `3`.
- Runtime mesh primitives: target `3`.
- Static sockets: `5`.
- Animation clips: `0`.
- Target `.glb` size: below `512 KiB`, preferably below `200 KiB`.

## Generator

Run from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background `
  --python scripts\blender\generate_timber_support_arch.py
```

Optional output override:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' `
  --background `
  --python scripts\blender\generate_timber_support_arch.py `
  -- --repo-root 'C:\path\to\relic-rails'
```
