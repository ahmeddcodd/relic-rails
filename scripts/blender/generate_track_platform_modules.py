"""Build the four modular Blender-authored track platforms used at runtime.

Each module is four metres long, centred on the origin, with Blender +Y as
travel and +Z as up. glTF conversion gives Three.js +Z travel and +Y up.

Run from the repository root:
    blender --background --python scripts/blender/generate_track_platform_modules.py
"""

from __future__ import annotations

import argparse
import math
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_common import (  # noqa: E402
    GAME_NAME,
    clear_scene,
    count_triangles,
    create_box,
    create_custom_mesh,
    create_ico,
    create_octahedron,
    ensure_collection,
    join_meshes_by_material,
    look_at,
    make_principled_material,
    move_to_collection,
    object_bounds,
    triangulate_mesh,
    write_json,
)


VERSION = "1.0.0"
MODULE_LENGTH = 4.0
ASSET_IDS = (
    "crystal_cavern_platform",
    "timber_mine_platform",
    "flooded_ravine_platform",
    "ember_forge_platform",
)


@dataclass(frozen=True)
class Theme:
    asset_id: str
    name: str
    ground: tuple[float, float, float, float]
    ground_alt: tuple[float, float, float, float]
    wall: tuple[float, float, float, float]
    wall_alt: tuple[float, float, float, float]
    ceiling: tuple[float, float, float, float] | None
    accent: tuple[float, float, float, float]
    accent_emission: float
    bed_kind: str


THEMES = {
    "crystal_cavern_platform": Theme(
        "crystal_cavern_platform", "Crystal Hollow",
        (0.145, 0.115, 0.255, 1), (0.235, 0.185, 0.390, 1),
        (0.250, 0.185, 0.430, 1), (0.345, 0.260, 0.535, 1),
        (0.090, 0.060, 0.175, 1), (0.080, 0.900, 0.855, 1), 1.8, "ballast",
    ),
    "timber_mine_platform": Theme(
        "timber_mine_platform", "Timber Maw Mine",
        (0.245, 0.135, 0.060, 1), (0.355, 0.225, 0.105, 1),
        (0.330, 0.205, 0.095, 1), (0.445, 0.295, 0.135, 1),
        (0.115, 0.060, 0.025, 1), (1.000, 0.315, 0.040, 1), 1.7, "ballast",
    ),
    "flooded_ravine_platform": Theme(
        "flooded_ravine_platform", "Flooded Ravine",
        (0.275, 0.300, 0.225, 1), (0.335, 0.365, 0.270, 1),
        (0.355, 0.315, 0.245, 1), (0.455, 0.405, 0.310, 1),
        None, (0.135, 0.520, 0.780, 1), 1.25, "bridge",
    ),
    "ember_forge_platform": Theme(
        "ember_forge_platform", "Ember Forge",
        (0.135, 0.125, 0.120, 1), (0.215, 0.195, 0.180, 1),
        (0.205, 0.170, 0.155, 1), (0.285, 0.235, 0.210, 1),
        (0.075, 0.060, 0.055, 1), (1.000, 0.145, 0.015, 1), 3.2, "forge",
    ),
}


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=SCRIPT_DIR.parents[1])
    parser.add_argument("--asset", choices=ASSET_IDS)
    parser.add_argument("--no-render", action="store_true")
    return parser.parse_args(args)


def configure_scene() -> None:
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("RelicRailsPlatformWorld") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.008, 0.006, 0.012, 1)
    bg.inputs["Strength"].default_value = 0.32


def materials(theme: Theme) -> dict[str, bpy.types.Material]:
    return {
        "ground": make_principled_material(
            "MAT_Platform", theme.ground, roughness=0.94,
            emission_color=theme.ground, emission_strength=0.10,
        ),
        "ground_alt": make_principled_material(
            "MAT_Ballast", theme.ground_alt, roughness=0.98,
            emission_color=theme.ground_alt, emission_strength=0.14,
        ),
        "wall": make_principled_material(
            "MAT_Mountain", theme.wall, roughness=0.98,
            emission_color=theme.wall, emission_strength=0.035,
        ),
        "wall_alt": make_principled_material(
            "MAT_MountainFacet", theme.wall_alt, roughness=0.96,
            emission_color=theme.wall_alt, emission_strength=0.055,
        ),
        "ceiling": make_principled_material(
            "MAT_Ceiling", theme.ceiling or theme.wall, roughness=0.99,
            emission_color=theme.ceiling or theme.wall, emission_strength=0.04,
        ),
        "rail": make_principled_material("MAT_Rail", (0.245, 0.255, 0.265, 1), roughness=0.38, metallic=0.86),
        "iron": make_principled_material("MAT_Iron", (0.085, 0.078, 0.072, 1), roughness=0.58, metallic=0.76),
        "wood": make_principled_material("MAT_Sleeper", (0.205, 0.085, 0.028, 1), roughness=0.92),
        "accent": make_principled_material(
            "MAT_BiomeGlow", theme.accent, roughness=0.42,
            emission_color=theme.accent, emission_strength=theme.accent_emission,
        ),
    }


def create_cliff(
    name: str,
    side: int,
    y0: float,
    y1: float,
    inner_bottom: float,
    inner_top: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Closed five-sided low-poly mountain volume with a faceted track face."""
    s = float(side)
    profile = [
        (s * inner_bottom, -0.55),
        (s * 13.0, -1.2),
        (s * 12.0, height * 0.78),
        (s * 10.0, height),
        (s * inner_top, height * 0.70),
        (s * (inner_bottom + 0.55), height * 0.34),
    ]
    vertices = [(x, y0, z) for x, z in profile] + [(x, y1, z) for x, z in profile]
    n = len(profile)
    faces: list[tuple[int, ...]] = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return create_custom_mesh(name, vertices, faces, material, collection)


def create_ceiling_slab(
    name: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    verts = [
        (-9.1, -2.08, 8.15), (-4.8, -2.08, 9.45), (0.0, -2.08, 9.95),
        (4.8, -2.08, 9.45), (9.1, -2.08, 8.15),
        (-9.5, -2.08, 11.3), (0.0, -2.08, 11.75), (9.5, -2.08, 11.3),
    ]
    verts += [(x, 2.08, z + (0.15 if i % 2 else 0.0)) for i, (x, _y, z) in enumerate(verts)]
    # Track-facing five-panel underside, outer roof panels, and seam caps.
    faces = [
        (0, 8, 9, 1), (1, 9, 10, 2), (2, 10, 11, 3), (3, 11, 12, 4),
        (5, 6, 14, 13), (6, 7, 15, 14),
        (0, 5, 13, 8), (4, 12, 15, 7),
        (0, 1, 2, 3, 4, 7, 6, 5), (8, 13, 14, 15, 12, 11, 10, 9),
    ]
    return create_custom_mesh(name, verts, faces, material, collection)


def create_terrain_wing(
    name: str,
    side: int,
    inner: float,
    outer: float,
    z_inner: float,
    z_outer: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Fill the full space between the track bed and an authored side wall."""
    inner_x = side * inner
    outer_x = side * outer
    if inner_x < outer_x:
        left_x, left_z, right_x, right_z = inner_x, z_inner, outer_x, z_outer
    else:
        left_x, left_z, right_x, right_z = outer_x, z_outer, inner_x, z_inner
    y0, y1 = -2.08, 2.08
    bottom = min(left_z, right_z) - 0.55
    vertices = [
        (left_x, y0, left_z), (right_x, y0, right_z),
        (right_x, y1, right_z), (left_x, y1, left_z),
        (left_x, y0, bottom), (right_x, y0, bottom),
        (right_x, y1, bottom), (left_x, y1, bottom),
    ]
    faces = [
        (0, 1, 2, 3), (7, 6, 5, 4),
        (0, 4, 5, 1), (1, 5, 6, 2),
        (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return create_custom_mesh(name, vertices, faces, material, collection)


def build_asset(theme: Theme) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    collection = ensure_collection("ASSET")
    mats = materials(theme)
    root = bpy.data.objects.new(theme.asset_id, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.5
    collection.objects.link(root)
    root["asset_id"] = theme.asset_id
    root["asset_version"] = VERSION
    root["game"] = GAME_NAME
    root["asset_type"] = "modular_track_platform"
    root["biome"] = theme.name
    root["module_length_m"] = MODULE_LENGTH
    root["lane_centres_m"] = "-2.2,0,2.2"
    root["rail_gauge_m"] = 1.1
    root["threejs_forward"] = "+Z"

    groups: dict[str, list[bpy.types.Object]] = {key: [] for key in mats}

    # Complete, authored track platform: bed/deck, sleepers, six rails, and fasteners.
    if theme.bed_kind == "bridge":
        groups["ground"].append(create_box("BridgeDeck", (0, 0, -0.18), (8.4, 4.08, 0.34), mats["ground"], collection, bevel=0.045))
        for x in (-3.75, 3.75):
            groups["iron"].append(create_box(f"BridgeGirder_{x}", (x, 0, -0.68), (0.24, 4.12, 0.78), mats["iron"], collection, bevel=0.025))
        for y in (-1.65, 0, 1.65):
            groups["iron"].append(create_box(f"BridgeCross_{y}", (0, y, -0.58), (8.15, 0.18, 0.22), mats["iron"], collection, bevel=0.018))
        # Water directly below the bridge fills the formerly black strip between
        # the deck and both ravine banks.
        for side in (-1, 1):
            groups["accent"].append(create_terrain_wing(
                f"WaterUnderBridge_{side}", side, 4.18, 7.45, -0.86, -0.80,
                mats["accent"], collection,
            ))
    elif theme.bed_kind == "forge":
        groups["ground"].append(create_box("ForgeTrackBed", (0, 0, -0.25), (8.45, 4.08, 0.46), mats["ground"], collection, bevel=0.055))
        for x in (-4.12, 4.12):
            groups["accent"].append(create_box(f"MagmaChannel_{x}", (x, 0, -0.08), (0.20, 4.10, 0.08), mats["accent"], collection, bevel=0.025))
        for y in (-1.88, 1.88):
            groups["iron"].append(create_box(f"ForgeSeam_{y}", (0, y, 0.005), (8.25, 0.08, 0.035), mats["iron"], collection))
    else:
        groups["ground"].append(create_box("TrackBed", (0, 0, -0.30), (8.55, 4.08, 0.50), mats["ground"], collection, bevel=0.075))

    if theme.bed_kind != "bridge":
        # Authored terrain/catwalk wings close the 2.5 m void on each side of
        # the track bed and meet the mountain wall with a gentle rise.
        for side in (-1, 1):
            groups["ground_alt"].append(create_terrain_wing(
                f"TerrainInfill_{side}", side, 4.22, 7.12, -0.10,
                0.18 if theme.bed_kind == "ballast" else 0.02,
                mats["ground_alt"], collection,
            ))

    for y in (-1.55, -0.52, 0.52, 1.55):
        groups["wood"].append(create_box(f"Sleeper_{y}", (0, y, -0.015), (7.85, 0.27, 0.15), mats["wood"], collection, bevel=0.022))
    for lane in (-2.2, 0.0, 2.2):
        for rail_offset in (-0.55, 0.55):
            x = lane + rail_offset
            groups["rail"].append(create_box(f"Rail_{x}", (x, 0, 0.105), (0.13, 4.12, 0.19), mats["rail"], collection, bevel=0.025))
            for y in (-1.55, -0.52, 0.52, 1.55):
                groups["iron"].append(create_box(f"Fastener_{x}_{y}", (x, y, 0.012), (0.31, 0.16, 0.055), mats["iron"], collection, bevel=0.012))

    # Authored ballast makes the bed read as a built structure rather than a flat strip.
    if theme.bed_kind == "ballast":
        for side in (-1, 1):
            for i, (y, size) in enumerate(((-1.45, 0.34), (-0.35, 0.26), (0.72, 0.31), (1.58, 0.23))):
                groups["ground_alt"].append(create_ico(
                    f"Ballast_{side}_{i}", (side * (4.0 + 0.12 * (i % 2)), y, -0.04),
                    (size * 1.4, size, size * 0.72), mats["ground_alt"], collection,
                    subdivisions=1, rotation=(0.18 * i, 0.12 * side, 0.37 * i),
                ))

        # Larger embedded edge stones visually knit the bed into the terrain
        # wing. Their asymmetric positions are reversed on alternate runtime
        # modules to keep the repeating kit from looking stamped.
        for side in (-1, 1):
            for i, (x, y, size) in enumerate(((4.72, -1.10, 0.34), (5.55, 0.40, 0.42), (6.35, 1.38, 0.29))):
                groups["wall_alt"].append(create_ico(
                    f"EdgeStone_{side}_{i}", (side * x, y * side, 0.12 + size * 0.24),
                    (size * 1.35, size, size * 0.78), mats["wall_alt"], collection,
                    subdivisions=1, rotation=(0.17 * i, 0.22 * side, 0.46 * i * side),
                ))

    # Left/right mountains are part of every module. Closed biomes also carry a
    # faceted ceiling shell, all made here in Blender rather than at runtime.
    open_ravine = theme.ceiling is None
    cliff_height = 8.6 if open_ravine else 10.2
    for side in (-1, 1):
        groups["wall"].append(create_cliff(
            f"Mountain_{'L' if side < 0 else 'R'}", side, -2.08, 2.08,
            7.0 if open_ravine else 6.75, 8.55 if open_ravine else 8.8,
            cliff_height, mats["wall"], collection,
        ))
        # A separate low-poly buttress gives the wall a large readable facet.
        groups["wall_alt"].append(create_ico(
            f"MountainFacet_{'L' if side < 0 else 'R'}",
            (side * (8.65 if open_ravine else 8.05), 0.55 * side, 3.35),
            (2.0, 2.35, 3.75), mats["wall_alt"], collection,
            subdivisions=1, rotation=(0.10, 0.18 * side, 0.32 * side),
        ))
    if theme.ceiling is not None:
        groups["ceiling"].append(create_ceiling_slab("CavernCeiling", mats["ceiling"], collection))

    # Biome-specific authored finish details.
    if theme.asset_id == "crystal_cavern_platform":
        for side in (-1, 1):
            for i, (y, z, scale) in enumerate(((-1.1, 1.1, 0.65), (0.9, 4.8, 0.9))):
                groups["accent"].append(create_octahedron(
                    f"WallCrystal_{side}_{i}", (side * 7.15, y, z),
                    (0.20 * scale, 0.24 * scale, 0.85 * scale), mats["accent"], collection,
                    rotation=(0.0, 0.22 * side, 0.12 * side),
                ))
        for side in (-1, 1):
            groups["accent"].append(create_octahedron(
                f"GroundCrystal_{side}", (side * 5.15, -0.55 * side, 0.52),
                (0.14, 0.18, 0.58), mats["accent"], collection,
                rotation=(0.0, 0.18 * side, 0.22 * side),
            ))
    elif theme.asset_id == "timber_mine_platform":
        for side in (-1, 1):
            groups["wood"].append(create_box(
                f"DrainageCurb_{side}", (side * 4.18, 0, 0.08), (0.22, 4.08, 0.34),
                mats["wood"], collection, bevel=0.025,
            ))
            groups["accent"].append(create_octahedron(
                f"WallEmber_{side}", (side * 7.05, 0.85 * side, 2.15),
                (0.09, 0.09, 0.14), mats["accent"], collection,
            ))
        # Low supply stacks fill the shoulder without intruding into a lane.
        groups["wood"].append(create_box(
            "SupplyTimber_A", (-5.18, -0.72, 0.36), (1.05, 0.34, 0.34),
            mats["wood"], collection, rotation=(0.0, 0.08, -0.05), bevel=0.025,
        ))
        groups["wood"].append(create_box(
            "SupplyTimber_B", (5.58, 0.88, 0.31), (0.86, 0.32, 0.30),
            mats["wood"], collection, rotation=(0.0, -0.12, 0.04), bevel=0.025,
        ))
    elif theme.asset_id == "flooded_ravine_platform":
        for side in (-1, 1):
            groups["accent"].append(create_box(
                f"River_{side}", (side * 10.55, 0, -0.88), (5.0, 4.10, 0.055),
                mats["accent"], collection,
            ))
            groups["wood"].append(create_box(
                f"BridgeRail_{side}", (side * 4.12, 0, 0.52), (0.13, 4.10, 0.13),
                mats["wood"], collection, bevel=0.018,
            ))
            # Two raised ripple facets catch the sky light and break up the
            # wide water plane without a texture or transparency sorting.
            for i, y in enumerate((-1.05, 0.95)):
                groups["accent"].append(create_box(
                    f"WaterRipple_{side}_{i}", (side * (5.25 + i * 0.75), y * side, -0.745),
                    (1.15, 0.055, 0.022), mats["accent"], collection,
                    rotation=(0.0, 0.0, 0.08 * side),
                ))
            groups["wall_alt"].append(create_ico(
                f"BankStone_{side}", (side * 6.85, -0.55 * side, -0.28),
                (0.62, 0.48, 0.55), mats["wall_alt"], collection,
                subdivisions=1, rotation=(0.18, 0.24 * side, 0.35),
            ))
    elif theme.asset_id == "ember_forge_platform":
        for side in (-1, 1):
            groups["iron"].append(create_box(
                f"WallRib_{side}", (side * 6.95, 0, 3.6), (0.38, 4.08, 7.0),
                mats["iron"], collection, rotation=(0, side * -0.10, 0), bevel=0.045,
            ))
            for y in (-1.55, 0, 1.55):
                groups["accent"].append(create_box(
                    f"ForgeLamp_{side}_{y}", (side * 6.70, y, 2.25), (0.08, 0.24, 0.32),
                    mats["accent"], collection, bevel=0.025,
                ))
            # Riveted catwalk panels and a second magma seam fill the shoulder
            # while keeping the gameplay track silhouette clean.
            for i, y in enumerate((-1.35, 0.0, 1.35)):
                groups["iron"].append(create_box(
                    f"CatwalkPanel_{side}_{i}", (side * 5.35, y, 0.11),
                    (2.0, 1.05, 0.11), mats["iron"], collection, bevel=0.018,
                ))
            groups["accent"].append(create_box(
                f"MagmaEdge_{side}", (side * 6.62, 0, 0.15),
                (0.13, 4.08, 0.055), mats["accent"], collection, bevel=0.018,
            ))

    geometry: list[bpy.types.Object] = []
    for key, objects in groups.items():
        if not objects:
            continue
        joined = join_meshes_by_material(objects, f"GEO_{key}", root)
        triangulate_mesh(joined)
        for polygon in joined.data.polygons:
            polygon.use_smooth = False
        geometry.append(joined)
    return root, geometry


def add_preview(theme: Theme) -> None:
    preview = ensure_collection("PREVIEW_ONLY")
    bpy.ops.object.light_add(type="AREA", location=(-7.5, -7.5, 12.5))
    key = bpy.context.object
    key.name = "PREVIEW_Key"
    key.data.energy = 1450
    key.data.shape = "DISK"
    key.data.size = 7.0
    key.data.color = theme.accent[:3]
    look_at(key, (0, 0, 2.5))
    move_to_collection(key, preview)
    bpy.ops.object.light_add(type="AREA", location=(8.0, 3.5, 9.0))
    fill = bpy.context.object
    fill.name = "PREVIEW_Fill"
    fill.data.energy = 1200
    fill.data.size = 6.0
    fill.data.color = (0.52, 0.62, 1.0)
    look_at(fill, (0, 0, 3.0))
    move_to_collection(fill, preview)
    bpy.ops.object.camera_add(location=(13.8, -18.5, 8.8))
    camera = bpy.context.object
    camera.name = "PREVIEW_Camera"
    camera.data.lens = 48
    look_at(camera, (0, 0.4, 2.6))
    move_to_collection(camera, preview)
    bpy.context.scene.camera = camera


def export_glb(root: bpy.types.Object, geometry: list[bpy.types.Object], path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *geometry]:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_extras=True, export_animations=False,
        export_yup=True, export_materials="EXPORT",
    )
    bpy.ops.object.select_all(action="DESELECT")


def generate(theme: Theme, repo_root: Path, no_render: bool) -> None:
    clear_scene()
    configure_scene()
    root, geometry = build_asset(theme)
    add_preview(theme)
    bpy.context.view_layer.update()

    output = repo_root / "READY_TO_USE_ASSETS" / theme.asset_id
    output.mkdir(parents=True, exist_ok=True)
    glb_path = output / f"{theme.asset_id}.glb"
    blend_path = output / f"{theme.asset_id}.blend"
    preview_path = output / f"{theme.asset_id}_preview.png"
    export_glb(root, geometry, glb_path)
    if not no_render:
        bpy.context.scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)
    try:
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    except RuntimeError:
        # Blender can occasionally fail the final atomic rename on Windows
        # after successfully writing `<name>.blend@` (for example while a file
        # indexer briefly holds the destination). Preserve that valid source
        # instead of failing the whole four-asset generation pass.
        pending_blend = Path(f"{blend_path}@")
        if not pending_blend.exists():
            raise
        shutil.copy2(pending_blend, blend_path)
        pending_blend.unlink()

    vertices, triangles = count_triangles(geometry)
    bounds = object_bounds(geometry)
    manifest = {
        "assetId": theme.asset_id,
        "version": VERSION,
        "game": GAME_NAME,
        "category": "environment_modular_track_platform",
        "description": (
            f"Four-metre Blender-authored {theme.name} platform with track, "
            "filled shoulders, mountains, and walls."
        ),
        "files": {"runtime": glb_path.name, "source": blend_path.name, "preview": preview_path.name},
        "units": "metres",
        "threeJsUp": "+Y",
        "threeJsForward": "+Z",
        "placement": "module centre on track basis; repeat every 4 metres",
        "moduleLengthMetres": MODULE_LENGTH,
        "boundsBlenderMetres": bounds,
        "performance": {
            "triangles": triangles, "sourceVertices": vertices,
            "meshPrimitives": len(geometry), "materials": len(geometry),
            "glbBytes": glb_path.stat().st_size, "triangleBudget": 3200,
        },
        "qualityGates": {
            "triangleBudgetPass": triangles <= 3200,
            "glbSizePass": glb_path.stat().st_size <= 512 * 1024,
            "materialBudgetPass": len(geometry) <= 9,
        },
    }
    manifest["qualityGates"]["allPass"] = all(manifest["qualityGates"].values())
    write_json(output / "asset_manifest.json", manifest)
    (output / "README.md").write_text(
        f"# {theme.asset_id}\n\n"
        f"Low-poly, Blender-authored four-metre platform module for **{theme.name}**.\n\n"
        "It includes the complete three-lane track bed/deck, sleepers, six rails, fasteners, "
        "filled terrain/water/catwalk shoulders, left/right mountain walls, and the biome "
        "ceiling or open ravine treatment. Runtime "
        "places one module every 4 m on the sampled track basis, so it follows curves and slopes.\n",
        encoding="utf-8",
    )
    print(f"Generated {theme.asset_id}: {triangles} triangles, {glb_path.stat().st_size} bytes")


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    selected = (args.asset,) if args.asset else ASSET_IDS
    for asset_id in selected:
        generate(THEMES[asset_id], repo_root, args.no_render)


if __name__ == "__main__":
    main()
