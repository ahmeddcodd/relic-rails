"""Generate every remaining Relic Rails low-poly game asset and animation package.

The generator creates individual ready-to-use folders containing GLB, Blend, preview,
manifest, and README files. Run from the repository root with Blender 5.1+:

    blender --background --python scripts/blender/generate_remaining_asset_pack.py

Use ``-- --asset <asset_id>`` to regenerate one asset or ``-- --no-render`` for a fast
geometry/export pass.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Sequence

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_common import (  # noqa: E402
    GAME_NAME,
    assign_material,
    clear_scene,
    count_triangles,
    create_beam_between,
    create_box,
    create_cone,
    create_custom_mesh,
    create_cylinder,
    create_empty,
    create_ico,
    create_octahedron,
    create_plane,
    create_torus,
    create_uv_sphere,
    ensure_collection,
    join_meshes_by_material,
    look_at,
    make_principled_material,
    move_to_collection,
    object_bounds,
    set_action_interpolation,
    set_transform_key,
    triangulate_mesh,
    write_json,
)


VERSION = "1.0.0"
FPS = 30
OUTPUT_ROOT_NAME = "READY_TO_USE_ASSETS"


@dataclass(frozen=True)
class Clip:
    name: str
    start: int
    end: int
    loop: bool
    description: str


@dataclass
class AssetBuild:
    asset_id: str
    category: str
    description: str
    root: bpy.types.Object
    objects: list[bpy.types.Object]
    animated: list[bpy.types.Object] = field(default_factory=list)
    sockets: list[bpy.types.Object] = field(default_factory=list)
    clips: list[Clip] = field(default_factory=list)
    preview_frame: int = 1
    triangle_budget: int = 1800
    material_budget: int = 6
    placement: str = "ground centre"
    runtime_notes: list[str] = field(default_factory=list)


class Palette:
    """Per-asset shared material cache using the production colour language."""

    DEFINITIONS = {
        "wood": ((0.255, 0.115, 0.040, 1.0), 0.88, 0.0, None),
        "wood_dark": ((0.135, 0.052, 0.016, 1.0), 0.94, 0.0, None),
        "iron": ((0.125, 0.110, 0.100, 1.0), 0.60, 0.78, None),
        "iron_light": ((0.22, 0.24, 0.25, 1.0), 0.48, 0.82, None),
        "copper": ((0.43, 0.18, 0.055, 1.0), 0.48, 0.82, None),
        "stone": ((0.24, 0.225, 0.205, 1.0), 0.96, 0.0, None),
        "stone_dark": ((0.075, 0.066, 0.095, 1.0), 0.98, 0.0, None),
        "earth": ((0.16, 0.075, 0.028, 1.0), 0.98, 0.0, None),
        "leaf": ((0.12, 0.30, 0.15, 1.0), 0.90, 0.0, None),
        "skin": ((0.74, 0.40, 0.25, 1.0), 0.78, 0.0, None),
        "jacket": ((0.40, 0.095, 0.035, 1.0), 0.86, 0.0, None),
        "scarf": ((0.88, 0.56, 0.055, 1.0), 0.90, 0.0, None),
        "hair": ((0.07, 0.025, 0.012, 1.0), 0.94, 0.0, None),
        "hazard": ((0.72, 0.018, 0.009, 1.0), 0.52, 0.12, (1.0, 0.015, 0.005, 2.0)),
        "gold": ((0.95, 0.43, 0.035, 1.0), 0.35, 0.18, (1.0, 0.20, 0.015, 2.0)),
        "gold_core": ((1.0, 0.82, 0.35, 1.0), 0.24, 0.10, (1.0, 0.52, 0.08, 4.0)),
        "cyan": ((0.08, 0.72, 0.68, 1.0), 0.28, 0.05, (0.02, 0.65, 0.62, 2.0)),
        "violet": ((0.46, 0.12, 0.82, 1.0), 0.28, 0.03, (0.38, 0.03, 0.75, 2.0)),
        "mint": ((0.04, 0.86, 0.43, 1.0), 0.30, 0.04, (0.02, 0.85, 0.38, 2.0)),
        "blue": ((0.05, 0.44, 0.85, 1.0), 0.26, 0.05, (0.02, 0.35, 0.95, 2.0)),
        "ghost": ((0.45, 0.75, 0.92, 0.58), 0.25, 0.0, (0.25, 0.65, 1.0, 1.7)),
        "magma": ((0.95, 0.075, 0.005, 1.0), 0.25, 0.0, (1.0, 0.055, 0.0, 4.5)),
        "water": ((0.12, 0.46, 0.72, 0.72), 0.22, 0.0, (0.05, 0.25, 0.55, 0.8)),
        "maw": ((0.052, 0.038, 0.028, 1.0), 0.82, 0.55, None),
        "eye": ((0.95, 0.01, 0.002, 1.0), 0.20, 0.0, (1.0, 0.005, 0.0, 5.0)),
    }

    def __init__(self) -> None:
        self.cache: dict[str, bpy.types.Material] = {}

    def get(self, key: str) -> bpy.types.Material:
        if key in self.cache:
            return self.cache[key]
        color, roughness, metallic, emission = self.DEFINITIONS[key]
        material = make_principled_material(
            f"MAT_{key.title().replace('_', '')}",
            color,
            roughness=roughness,
            metallic=metallic,
            emission_color=emission[:3] if emission else None,
            emission_strength=emission[3] if emission else 0.0,
        )
        if color[3] < 1.0:
            material.surface_render_method = "DITHERED"
            material.diffuse_color = color
            node = material.node_tree.nodes.get("Principled BSDF")
            node.inputs["Alpha"].default_value = color[3]
        self.cache[key] = material
        return material


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=SCRIPT_DIR.parents[1])
    parser.add_argument("--asset", action="append", help="Generate only this asset ID; repeatable.")
    parser.add_argument("--no-render", action="store_true")
    return parser.parse_args(args)


def configure_scene(asset_id: str) -> None:
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    scene.name = f"{asset_id}_action_library"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = 1

    world = bpy.data.worlds.new("RelicRailsWorld") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.008, 0.005, 0.012, 1.0)
    background.inputs["Strength"].default_value = 0.25


def make_root(asset_id: str, category: str, collection: bpy.types.Collection) -> bpy.types.Object:
    root = bpy.data.objects.new(asset_id, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.22
    collection.objects.link(root)
    root["asset_id"] = asset_id
    root["asset_version"] = VERSION
    root["game"] = GAME_NAME
    root["asset_type"] = category
    root["generator"] = Path(__file__).name
    root["blender_forward"] = "-Y"
    root["threejs_forward"] = "+Z"
    root["animation_fps"] = FPS
    return root


def parent_to(obj: bpy.types.Object, root: bpy.types.Object) -> bpy.types.Object:
    obj.parent = root
    return obj


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    parent_world = parent.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent_world.inverted()
    obj.matrix_world = world
    bpy.context.view_layer.update()
    return obj


def add_socket(root: bpy.types.Object, collection: bpy.types.Collection, name: str, location: Sequence[float]) -> bpy.types.Object:
    socket = create_empty(name, location, collection, display_size=0.12)
    socket.parent = root
    socket["runtime_fx_only"] = True
    return socket


def make_rock(
    name: str,
    location: Sequence[float],
    scale: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    return create_ico(name, location, scale, material, collection, subdivisions=1, rotation=rotation)


def make_crystal(
    name: str,
    location: Sequence[float],
    radius: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    return create_cone(name, location, radius, radius * 0.08, height, material, collection, vertices=6, rotation=rotation)


def make_tapered_hopper(
    name: str,
    location: Sequence[float],
    bottom: Sequence[float],
    top: Sequence[float],
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    bx, by = bottom[0] * 0.5, bottom[1] * 0.5
    tx, ty = top[0] * 0.5, top[1] * 0.5
    z0, z1 = -height * 0.5, height * 0.5
    vertices = (
        (-bx, -by, z0), (bx, -by, z0), (bx, by, z0), (-bx, by, z0),
        (-tx, -ty, z1), (tx, -ty, z1), (tx, ty, z1), (-tx, ty, z1),
    )
    faces = (
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    )
    return create_custom_mesh(name, vertices, faces, material, collection, location=location, bevel=0.045)


def animate_loop_transform(
    obj: bpy.types.Object,
    frames: Sequence[int],
    locations: Sequence[Sequence[float]] | None = None,
    rotations: Sequence[Sequence[float]] | None = None,
    scales: Sequence[Sequence[float]] | None = None,
    interpolation: str = "BEZIER",
) -> None:
    for index, frame in enumerate(frames):
        set_transform_key(
            obj,
            frame,
            location=locations[index] if locations else None,
            rotation=rotations[index] if rotations else None,
            scale=scales[index] if scales else None,
        )
    if obj.animation_data and obj.animation_data.action:
        obj.animation_data.action.name = f"ACT_{obj.name}"
    set_action_interpolation(obj, interpolation)


def finalize_build(build: AssetBuild) -> AssetBuild:
    """Join non-animated geometry by material and preserve named moving parts."""
    animated_ids = {id(obj) for obj in build.animated}
    static = [obj for obj in build.objects if obj.type == "MESH" and id(obj) not in animated_ids]
    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in static:
        material_name = obj.data.materials[0].name if obj.data.materials else "Unassigned"
        groups.setdefault(material_name, []).append(obj)

    final_geometry: list[bpy.types.Object] = []
    for material_name, objects in groups.items():
        safe = material_name.removeprefix("MAT_").lower()
        joined = join_meshes_by_material(objects, f"GEO_{safe}", build.root)
        final_geometry.append(joined)

    for obj in build.animated:
        if obj.type != "MESH":
            continue
        if obj.parent is None:
            obj.parent = build.root
        if not obj.name.startswith("ANIM_"):
            obj.name = f"ANIM_{obj.name}"
        final_geometry.append(obj)

    unique: list[bpy.types.Object] = []
    seen: set[int] = set()
    for obj in final_geometry:
        if id(obj) in seen:
            continue
        seen.add(id(obj))
        triangulate_mesh(obj)
        for polygon in obj.data.polygons:
            polygon.use_smooth = False
        unique.append(obj)
    build.objects = unique

    build.root["animation_mode"] = "embedded_action_library" if build.clips else "static_runtime_fx_sockets"
    build.root["animation_clips"] = json.dumps(
        [{"name": clip.name, "start": clip.start, "end": clip.end, "loop": clip.loop} for clip in build.clips]
    )
    if build.clips:
        bpy.context.scene.frame_end = max(clip.end for clip in build.clips)
    bpy.context.view_layer.update()
    return build


def setup_preview(build: AssetBuild, palette: Palette) -> None:
    preview = ensure_collection("PREVIEW_ONLY")
    bounds = object_bounds(build.objects)
    minimum = Vector(bounds["min"])
    maximum = Vector(bounds["max"])
    size = maximum - minimum
    centre = (minimum + maximum) * 0.5
    max_dim = max(1.0, size.x, size.y, size.z)

    floor_size = max(3.2, size.x * 1.35, size.y * 2.0)
    create_box(
        "PREVIEW_Ground",
        (centre.x, centre.y, minimum.z - 0.10),
        (floor_size, floor_size * 0.68, 0.20),
        palette.get("earth"),
        preview,
        bevel=0.04,
    )

    bpy.ops.object.light_add(type="AREA", location=(centre.x - max_dim * 0.70, centre.y - max_dim, centre.z + max_dim))
    key = bpy.context.object
    key.name = "PREVIEW_Key"
    key.data.energy = 150 + max_dim * max_dim * 28
    key.data.shape = "DISK"
    key.data.size = max(2.0, max_dim * 0.55)
    key.data.color = (1.0, 0.34, 0.10)
    look_at(key, centre)
    move_to_collection(key, preview)

    bpy.ops.object.light_add(type="AREA", location=(centre.x + max_dim, centre.y + max_dim * 0.2, centre.z + max_dim * 0.65))
    rim = bpy.context.object
    rim.name = "PREVIEW_Rim"
    rim.data.energy = 120 + max_dim * max_dim * 16
    rim.data.size = max(1.8, max_dim * 0.45)
    rim.data.color = (0.18, 0.34, 0.82)
    look_at(rim, centre)
    move_to_collection(rim, preview)

    bpy.ops.object.light_add(type="AREA", location=(centre.x, centre.y - max_dim * 1.35, centre.z + max_dim * 0.25))
    fill = bpy.context.object
    fill.name = "PREVIEW_Fill"
    fill.data.energy = 100 + max_dim * max_dim * 18
    fill.data.size = max(2.5, max_dim * 0.85)
    fill.data.color = (0.72, 0.78, 1.0)
    look_at(fill, centre)
    move_to_collection(fill, preview)

    camera_distance = max_dim * 2.15
    camera_location = (
        centre.x + max_dim * 1.10,
        centre.y - camera_distance,
        max(minimum.z + max_dim * 0.55, centre.z + max_dim * 0.35),
    )
    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.name = "PREVIEW_Camera"
    camera.data.lens = 58 if size.z > size.x * 1.4 else 54
    look_at(camera, (centre.x, centre.y, max(minimum.z + size.z * 0.48, centre.z)))
    move_to_collection(camera, preview)
    bpy.context.scene.camera = camera
    bpy.context.scene.frame_set(build.preview_frame)


def export_asset(build: AssetBuild, collection: bpy.types.Collection, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    # Include rig/group empties as well as meshes and FX sockets. Preview staging lives
    # in a separate collection and is therefore never exported.
    selection = list(collection.all_objects)
    for obj in selection:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = build.root
    options = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_extras": True,
        "export_yup": True,
        "export_materials": "EXPORT",
        "export_animations": bool(build.clips),
    }
    if build.clips:
        options.update(
            {
                "export_animation_mode": "SCENE",
                "export_anim_scene_split_object": False,
                "export_nla_strips_merged_animation_name": f"{build.asset_id}_action_library",
                "export_optimize_animation_size": True,
                "export_bake_animation": True,
                "export_anim_slide_to_zero": False,
            }
        )
    bpy.ops.export_scene.gltf(**options)
    bpy.ops.object.select_all(action="DESELECT")


def package_readme(build: AssetBuild) -> str:
    clip_lines = "\n".join(
        f"- `{clip.name}`: frames {clip.start}–{clip.end} at {FPS} fps ({'loop' if clip.loop else 'one-shot'}) — {clip.description}"
        for clip in build.clips
    ) or "- Static asset; no baked animation clip."
    notes = "\n".join(f"- {note}" for note in build.runtime_notes) or "- No additional runtime note."
    return f"""# {build.asset_id}

{build.description}

## Runtime file

Use `{build.asset_id}.glb`. Load it once with Three.js `GLTFLoader`, then clone or
instance it when repeated.

## Placement

- Origin: {build.placement}.
- Three.js up: `+Y`.
- Three.js gameplay forward: `+Z`.
- Gameplay collision remains in the existing track-space collision system.

## Animation library

The GLB timeline is authored at {FPS} fps. Use the frame ranges below to create Three.js
subclips from the embedded action library.

{clip_lines}

## Runtime notes

{notes}
"""


def write_package(build: AssetBuild, repo_root: Path, palette: Palette, no_render: bool) -> dict:
    folder = repo_root / OUTPUT_ROOT_NAME / build.asset_id
    folder.mkdir(parents=True, exist_ok=True)
    glb_path = folder / f"{build.asset_id}.glb"
    blend_path = folder / f"{build.asset_id}.blend"
    preview_path = folder / f"{build.asset_id}_preview.png"
    manifest_path = folder / "asset_manifest.json"
    readme_path = folder / "README.md"

    setup_preview(build, palette)
    export_asset(build, ensure_collection("ASSET"), glb_path)
    if not no_render:
        bpy.context.scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    vertices, triangles = count_triangles(build.objects)
    materials = sorted({slot.material.name for obj in build.objects for slot in obj.material_slots if slot.material})
    bounds = object_bounds(build.objects)
    manifest = {
        "assetId": build.asset_id,
        "version": VERSION,
        "game": GAME_NAME,
        "category": build.category,
        "description": build.description,
        "files": {
            "runtime": glb_path.name,
            "source": blend_path.name,
            "preview": preview_path.name,
        },
        "units": "metres",
        "threeJsUp": "+Y",
        "threeJsForward": "+Z",
        "placement": build.placement,
        "boundsBlenderMetres": bounds,
        "performance": {
            "triangles": triangles,
            "sourceVertices": vertices,
            "meshPrimitives": len(build.objects),
            "materials": len(materials),
            "glbBytes": glb_path.stat().st_size,
            "triangleBudget": build.triangle_budget,
        },
        "meshes": [obj.name for obj in build.objects],
        "materials": materials,
        "sockets": [socket.name for socket in build.sockets],
        "animation": {
            "fps": FPS,
            "library": f"{build.asset_id}_action_library" if build.clips else None,
            "clips": [clip.__dict__ for clip in build.clips],
        },
        "runtimeNotes": build.runtime_notes,
        "qualityGates": {
            "triangleBudgetPass": triangles <= build.triangle_budget,
            "glbSizePass": glb_path.stat().st_size <= 512 * 1024,
            "materialBudgetPass": len(materials) <= build.material_budget,
            "animationDeclaredPass": bool(build.clips) == bool(bpy.data.actions),
        },
    }
    manifest["qualityGates"]["allPass"] = all(manifest["qualityGates"].values())
    write_json(manifest_path, manifest)
    readme_path.write_text(package_readme(build), encoding="utf-8")
    return manifest


# Asset builders are defined below. Each builder returns geometry in Blender's +Z-up,
# -Y-forward production coordinate system.


def build_minecart_hero(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("minecart_hero", "hero_vehicle", c)
    objects: list[bpy.types.Object] = []
    animated: list[bpy.types.Object] = []

    objects.append(make_tapered_hopper("Hull_Main", (0, 0, 0.86), (1.25, 1.55), (1.72, 2.05), 0.92, p.get("iron_light"), c))
    objects += [
        create_box("Rim_Front", (0, -1.02, 1.34), (1.86, 0.14, 0.16), p.get("copper"), c, bevel=0.025),
        create_box("Rim_Back", (0, 1.02, 1.34), (1.86, 0.14, 0.16), p.get("copper"), c, bevel=0.025),
        create_box("Rim_Left", (-0.86, 0, 1.34), (0.14, 1.95, 0.16), p.get("copper"), c, bevel=0.025),
        create_box("Rim_Right", (0.86, 0, 1.34), (0.14, 1.95, 0.16), p.get("copper"), c, bevel=0.025),
        create_box("Chassis", (0, 0, 0.33), (1.34, 1.74, 0.24), p.get("iron"), c, bevel=0.035),
        create_box("Front_Panel", (0, -0.86, 0.86), (1.45, 0.10, 0.48), p.get("iron"), c, bevel=0.018),
        create_box("Back_Panel", (0, 0.86, 0.86), (1.45, 0.10, 0.48), p.get("iron"), c, bevel=0.018),
    ]
    for x in (-0.58, 0.0, 0.58):
        objects.append(create_box(f"RivetStrip_{x}", (x, -0.925, 0.86), (0.11, 0.06, 0.62), p.get("copper"), c, bevel=0.012))

    wheels: list[bpy.types.Object] = []
    for label, x, y in (("FL", -0.72, -0.64), ("FR", 0.72, -0.64), ("RL", -0.72, 0.64), ("RR", 0.72, 0.64)):
        wheel = create_cylinder(f"wheel_{label}", (x, y, 0.31), 0.30, 0.20, p.get("iron"), c, vertices=12, rotation=(0, math.pi * 0.5, 0), bevel=0.018)
        animated.append(wheel)
        wheels.append(wheel)
        objects.append(create_cylinder(f"Hub_{label}", (x + (-0.12 if x < 0 else 0.12), y, 0.31), 0.10, 0.24, p.get("copper"), c, vertices=8, rotation=(0, math.pi * 0.5, 0)))

    lantern = create_octahedron("sunheart_lantern", (0, -1.15, 1.11), (0.20, 0.20, 0.24), p.get("gold_core"), c)
    animated.append(lantern)
    objects.append(create_torus("Lantern_Cage", (0, -1.15, 1.11), 0.26, 0.035, p.get("copper"), c, major_segments=14, rotation=(math.pi * 0.5, 0, 0)))
    rider_socket = add_socket(root, c, "SOCKET_rider", (0, 0.20, 1.27))
    objects.extend(animated)

    animate_loop_transform(root, (1, 30, 60), locations=((0, 0, 0), (0, 0, 0.035), (0, 0, 0)))
    animate_loop_transform(lantern, (1, 15, 30, 45, 60), scales=((1, 1, 1), (1.10, 1.10, 1.10), (1, 1, 1), (1.06, 1.06, 1.06), (1, 1, 1)))
    for wheel in wheels:
        animate_loop_transform(wheel, (70, 100), rotations=((0, math.pi * 0.5, 0), (math.tau, math.pi * 0.5, 0)), interpolation="LINEAR")
    animate_loop_transform(root, (110, 118, 128, 145), locations=((0, 0, 0), (0, 0, -0.09), (0, 0, 0.08), (0, 0, 0)), rotations=((0, 0, 0), (0.05, 0, 0), (-0.035, 0, 0), (0, 0, 0)))
    animate_loop_transform(root, (160, 174, 190, 210), locations=((0, 0, 0), (0.18, -0.15, 0.48), (0.42, -0.35, 0.22), (0.56, -0.48, 0)), rotations=((0, 0, 0), (0.18, 0.35, 0.55), (0.62, 1.1, 1.55), (1.1, 1.7, 2.5)))

    clips = [
        Clip("idle_loop", 1, 60, True, "Subtle suspension breathing and Sunheart pulse."),
        Clip("wheel_spin_loop", 70, 100, True, "One full consistent wheel revolution."),
        Clip("suspension_hit", 110, 145, False, "Compression, overshoot, and settle."),
        Clip("crash", 160, 210, False, "Readable airborne roll and ground settle."),
    ]
    return AssetBuild(
        "minecart_hero", "hero_vehicle", "Hero Emberdeep minecart with copper trim and Sunheart lantern.", root, objects, animated, [rider_socket], clips, 30, 4200,
        placement="between wheel contact points at rail height",
        runtime_notes=["Runtime gameplay may override wheel spin, lean, jump trajectory, and crash transform.", "Attach Rin to SOCKET_rider."],
    )


def build_rin_vale(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("rin_vale", "hero_character", c)
    objects: list[bpy.types.Object] = []
    animated: list[bpy.types.Object] = []

    torso = create_cone("torso", (0, 0, 0.92), 0.30, 0.23, 0.66, p.get("jacket"), c, vertices=8)
    pelvis = create_box("pelvis", (0, 0, 0.56), (0.50, 0.34, 0.22), p.get("jacket"), c, bevel=0.04)
    head = create_ico("head", (0, -0.015, 1.42), (0.22, 0.21, 0.24), p.get("skin"), c, subdivisions=2)
    hair = create_ico("hair_cap", (0, 0.015, 1.52), (0.235, 0.22, 0.16), p.get("hair"), c, subdivisions=1)
    scarf = create_box("scarf", (0, -0.02, 1.18), (0.48, 0.36, 0.12), p.get("scarf"), c, bevel=0.035)
    ponytail = create_cone("ponytail", (0, 0.22, 1.41), 0.065, 0.025, 0.38, p.get("hair"), c, vertices=6, rotation=(math.radians(58), 0, 0))
    backpack = create_box("backpack", (0, 0.25, 0.88), (0.40, 0.22, 0.48), p.get("wood_dark"), c, bevel=0.055)
    scarf_tail = create_box("scarf_tail", (0.18, 0.20, 1.02), (0.15, 0.08, 0.48), p.get("scarf"), c, rotation=(0.16, 0, -0.18), bevel=0.025)
    goggles = [
        create_cylinder("goggle_lens_l", (-0.085, -0.205, 1.45), 0.072, 0.045, p.get("blue"), c, vertices=10, rotation=(math.pi * 0.5, 0, 0)),
        create_cylinder("goggle_lens_r", (0.085, -0.205, 1.45), 0.072, 0.045, p.get("blue"), c, vertices=10, rotation=(math.pi * 0.5, 0, 0)),
        create_box("goggle_bridge", (0, -0.225, 1.45), (0.07, 0.035, 0.025), p.get("iron"), c, bevel=0.006),
        create_box("jacket_trim_l", (-0.11, -0.235, 0.98), (0.07, 0.035, 0.48), p.get("copper"), c, rotation=(0, -0.12, -0.10), bevel=0.008),
        create_box("jacket_trim_r", (0.11, -0.235, 0.98), (0.07, 0.035, 0.48), p.get("copper"), c, rotation=(0, 0.12, 0.10), bevel=0.008),
        create_box("boot_l", (-0.15, -0.04, 0.32), (0.24, 0.36, 0.22), p.get("iron"), c, bevel=0.035),
        create_box("boot_r", (0.15, -0.04, 0.32), (0.24, 0.36, 0.22), p.get("iron"), c, bevel=0.035),
    ]
    head_accessories = goggles[:3]
    jacket_details = goggles[3:5]
    for accessory in [hair, ponytail, *head_accessories]:
        parent_keep_world(accessory, head)
    for detail in [backpack, *jacket_details]:
        parent_keep_world(detail, torso)
    parent_keep_world(scarf_tail, scarf)
    animated.extend([torso, pelvis, head, hair, scarf, ponytail, scarf_tail, backpack, *head_accessories, *jacket_details])
    objects.extend([torso, pelvis, head, hair, scarf, ponytail, backpack, scarf_tail, *goggles])

    arms: list[bpy.types.Object] = []
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        arm = create_cylinder(f"arm_{label}", (side * 0.31, -0.02, 0.96), 0.075, 0.52, p.get("jacket"), c, vertices=7, rotation=(0, math.radians(side * 18), math.radians(side * 12)))
        hand = create_ico(f"hand_{label}", (side * 0.36, -0.10, 0.70), (0.085, 0.075, 0.10), p.get("skin"), c, subdivisions=1)
        parent_keep_world(hand, arm)
        arms.extend([arm, hand])
        animated.extend([arm, hand])
        objects.extend([arm, hand])

    animate_loop_transform(root, (1, 30, 60), locations=((0, 0, 0), (0, 0, 0.025), (0, 0, 0)))
    animate_loop_transform(torso, (1, 30, 60), rotations=((0, 0, 0), (0.035, 0, 0), (0, 0, 0)))
    animate_loop_transform(head, (1, 30, 60), rotations=((0, 0, 0), (-0.035, 0.025, 0), (0, 0, 0)))
    animate_loop_transform(scarf, (1, 20, 40, 60), rotations=((0, 0, 0), (0.12, 0, 0.07), (-0.08, 0, -0.04), (0, 0, 0)))
    animate_loop_transform(scarf_tail, (1, 20, 40, 60), rotations=((0.16, 0, -0.18), (0.34, 0.06, -0.10), (0.08, -0.04, -0.25), (0.16, 0, -0.18)))

    animate_loop_transform(root, (70, 80, 90), rotations=((0, 0, 0), (0, -0.24, -0.26), (0, 0, 0)))
    animate_loop_transform(root, (100, 110, 120), rotations=((0, 0, 0), (0, 0.24, 0.26), (0, 0, 0)))

    for index, arm in enumerate(arms[::2]):
        side = -1 if index == 0 else 1
        animate_loop_transform(arm, (130, 142, 160, 170), rotations=((0, math.radians(side * 18), math.radians(side * 12)), (math.radians(-62), 0, math.radians(side * 22)), (math.radians(-48), 0, math.radians(side * 15)), (0, math.radians(side * 18), math.radians(side * 12))))
    animate_loop_transform(root, (130, 145, 160, 170), locations=((0, 0, 0), (0, -0.04, 0.18), (0, 0.02, 0.10), (0, 0, 0)), rotations=((0, 0, 0), (-0.18, 0, 0), (0.10, 0, 0), (0, 0, 0)))

    animate_loop_transform(root, (180, 188, 202, 210), locations=((0, 0, 0), (0, 0, -0.30), (0, 0, -0.30), (0, 0, 0)), scales=((1, 1, 1), (1.06, 1.06, 0.72), (1.06, 1.06, 0.72), (1, 1, 1)))
    animate_loop_transform(root, (220, 230, 240, 250), rotations=((0, 0, 0), (0.10, -0.18, 0.32), (-0.06, 0.12, -0.20), (0, 0, 0)))
    animate_loop_transform(root, (260, 275, 295, 310), locations=((0, 0, 0), (0.18, 0, 0.14), (0.38, 0.08, -0.22), (0.48, 0.14, -0.38)), rotations=((0, 0, 0), (0.30, 0.35, 0.55), (1.0, 0.65, 1.2), (1.35, 0.80, 1.55)))
    for index, arm in enumerate(arms[::2]):
        side = -1 if index == 0 else 1
        animate_loop_transform(arm, (320, 336, 350, 360), rotations=((0, 0, math.radians(side * 12)), (math.radians(-115), 0, math.radians(side * 22)), (math.radians(-95), 0, math.radians(side * 34)), (0, 0, math.radians(side * 12))))
    animate_loop_transform(root, (320, 336, 350, 360), locations=((0, 0, 0), (0, 0, 0.08), (0, 0, 0.02), (0, 0, 0)))

    clips = [
        Clip("idle_cart", 1, 60, True, "Balanced breathing, head counter-motion, and scarf follow-through."),
        Clip("lean_left", 70, 90, False, "Fast readable left commitment and return."),
        Clip("lean_right", 100, 120, False, "Mirrored right commitment and return."),
        Clip("jump", 130, 170, False, "Anticipation, arm lift, airborne pose, and landing settle."),
        Clip("duck", 180, 210, False, "Compressed silhouette held through the clearance window."),
        Clip("stumble", 220, 250, False, "Two-stage balance recovery."),
        Clip("crash", 260, 310, False, "Large readable tumble pose."),
        Clip("celebrate", 320, 360, False, "Two-arm victory gesture with settle."),
    ]
    return AssetBuild(
        "rin_vale", "hero_character", "Low-poly Emberdeep scavenger hero with scarf, goggles silhouette, and relic backpack.", root, objects, animated, [], clips, 30, 4200,
        material_budget=10,
        placement="between the feet at ground level",
        runtime_notes=["Attach the root to the minecart SOCKET_rider.", "Runtime cart lean may layer over or replace lean clips."],
    )


def build_iron_maw(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("iron_maw", "chase_guardian", c)
    objects: list[bpy.types.Object] = []
    animated: list[bpy.types.Object] = []
    body = create_box("body", (0, 0.25, 2.85), (5.4, 2.8, 4.4), p.get("maw"), c, bevel=0.18)
    jaw = create_box("lower_jaw", (0, -1.25, 1.15), (6.0, 1.15, 1.35), p.get("maw"), c, bevel=0.12)
    animated.extend([body, jaw])
    objects.extend([body, jaw])
    grinders: list[bpy.types.Object] = []
    for index in range(5):
        grinder = create_cone(f"grinder_{index}", (-2.25 + index * 1.12, -1.85, 1.25), 0.52, 0.06, 1.35, p.get("iron"), c, vertices=7, rotation=(math.pi * 0.5, 0, 0))
        grinders.append(grinder)
        animated.append(grinder)
        objects.append(grinder)
    for side in (-1, 1):
        arm = create_box(f"arm_{'L' if side < 0 else 'R'}", (side * 3.35, 0.10, 2.3), (1.05, 1.1, 3.6), p.get("maw"), c, rotation=(0, side * -0.10, side * -0.17), bevel=0.12)
        animated.append(arm)
        objects.append(arm)
        eye = create_ico(f"eye_{'L' if side < 0 else 'R'}", (side * 1.48, -1.20, 3.85), (0.36, 0.20, 0.30), p.get("eye"), c, subdivisions=1)
        animated.append(eye)
        objects.append(eye)
        objects.append(create_box(f"brow_{side}", (side * 1.48, -1.27, 4.30), (1.15, 0.16, 0.18), p.get("copper"), c, rotation=(0, 0, side * -0.10), bevel=0.025))
        objects.append(create_cylinder(f"jaw_hinge_{side}", (side * 2.72, -1.48, 1.45), 0.42, 0.34, p.get("iron_light"), c, vertices=10, rotation=(math.pi * 0.5, 0, 0), bevel=0.025))
    objects.append(create_box("face_band", (0, -1.22, 3.05), (4.55, 0.16, 0.20), p.get("iron_light"), c, bevel=0.025))
    for x in (-2.45, -1.22, 0, 1.22, 2.45):
        objects.append(create_cone(f"tooth_{x}", (x, -1.96, 2.0), 0.28, 0.03, 0.88, p.get("iron_light"), c, vertices=5, rotation=(math.pi, 0, 0)))

    animate_loop_transform(root, (1, 30, 60), locations=((0, 0, 0), (0, -0.08, 0.10), (0, 0, 0)))
    animate_loop_transform(jaw, (1, 15, 30, 45, 60), rotations=((0, 0, 0), (-0.12, 0, 0), (-0.03, 0, 0), (-0.16, 0, 0), (0, 0, 0)))
    for index, grinder in enumerate(grinders):
        animate_loop_transform(grinder, (1, 60), rotations=((math.pi * 0.5, 0, 0), (math.pi * 0.5, 0, math.tau * (1 if index % 2 == 0 else -1))), interpolation="LINEAR")
    animate_loop_transform(root, (70, 82, 94, 105), locations=((0, 0, 0), (0, -1.15, 0.20), (0, -1.55, 0.05), (0, 0, 0)), scales=((1, 1, 1), (1.05, 1.10, 1.03), (1.02, 1.04, 0.98), (1, 1, 1)))
    animate_loop_transform(jaw, (70, 82, 94, 105), rotations=((0, 0, 0), (-0.38, 0, 0), (-0.14, 0, 0), (0, 0, 0)))
    animate_loop_transform(jaw, (120, 132, 145, 160), rotations=((0, 0, 0), (-0.52, 0, 0), (0.18, 0, 0), (0, 0, 0)))
    animate_loop_transform(root, (120, 132, 145, 160), locations=((0, 0, 0), (0, -0.7, 0.18), (0, -1.25, 0), (0, -0.45, 0)))
    clips = [
        Clip("chase_loop", 1, 60, True, "Heavy pursuit bob, jaw chatter, and counter-rotating grinders."),
        Clip("lunge", 70, 105, False, "Anticipation, forward surge, jaw opening, and recoil."),
        Clip("catch", 120, 160, False, "Wide bite followed by crushing closure."),
    ]
    sockets = [add_socket(root, c, "SOCKET_dust_wake", (0, 1.6, 0.6)), add_socket(root, c, "SOCKET_mouth_fx", (0, -2.0, 1.4))]
    return AssetBuild(
        "iron_maw", "chase_guardian", "Ancient mechanical guardian with grinders, crushing jaw, and red pursuit eyes.", root, objects, animated, sockets, clips, 30, 8000,
        placement="ground centre behind the player",
        runtime_notes=["Runtime chase pressure controls distance and scale visibility.", "Eye emission and dust intensity may be driven by pressure."],
    )


def _build_obstacle_cart(asset_id: str, p: Palette, oncoming: bool) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root(asset_id, "obstacle", c)
    objects: list[bpy.types.Object] = []
    animated: list[bpy.types.Object] = []
    objects.append(make_tapered_hopper("CartBody", (0, 0, 0.82), (1.18, 1.42), (1.62, 1.86), 0.86, p.get("copper"), c))
    objects += [
        create_box("RimFront", (0, -0.92, 1.27), (1.72, 0.14, 0.16), p.get("iron"), c, bevel=0.025),
        create_box("RimBack", (0, 0.92, 1.27), (1.72, 0.14, 0.16), p.get("iron"), c, bevel=0.025),
        create_box("HazardStripe", (0, -1.005, 0.90), (1.42, 0.07, 0.23), p.get("hazard"), c, bevel=0.015),
    ]
    for idx, (x, y, z, s) in enumerate(((-0.32, 0, 1.42, 0.48), (0.22, 0.12, 1.52, 0.38), (0.05, -0.25, 1.35, 0.32))):
        objects.append(make_rock(f"Ore_{idx}", (x, y, z), (s, s * 0.82, s * 0.70), p.get("stone"), c, rotation=(idx * 0.4, idx * 0.7, idx * 0.2)))
    wheels: list[bpy.types.Object] = []
    for label, x, y in (("FL", -0.65, -0.60), ("FR", 0.65, -0.60), ("RL", -0.65, 0.60), ("RR", 0.65, 0.60)):
        wheel = create_cylinder(f"wheel_{label}", (x, y, 0.29), 0.27, 0.18, p.get("iron"), c, vertices=10, rotation=(0, math.pi * 0.5, 0))
        objects.append(wheel)
        if oncoming:
            animated.append(wheel)
    clips: list[Clip] = []
    sockets: list[bpy.types.Object] = []
    preview_frame = 1
    if oncoming:
        lamp = create_ico("headlamp", (0, -1.06, 1.03), (0.18, 0.12, 0.18), p.get("gold_core"), c, subdivisions=1)
        objects.append(lamp)
        animated.append(lamp)
        for wheel in wheels:
            animate_loop_transform(wheel, (1, 30), rotations=((0, math.pi * 0.5, 0), (math.tau, math.pi * 0.5, 0)), interpolation="LINEAR")
        animate_loop_transform(lamp, (1, 10, 20, 30), scales=((1, 1, 1), (1.22, 1.22, 1.22), (0.94, 0.94, 0.94), (1, 1, 1)))
        clips = [Clip("approach_loop", 1, 30, True, "Synchronized wheel rotation and urgent headlamp pulse.")]
        sockets.append(add_socket(root, c, "SOCKET_horn_fx", (0, -1.14, 1.18)))
        preview_frame = 10
    return AssetBuild(
        asset_id, "obstacle", "Reinforced ore cart obstacle with a hot-red gameplay warning stripe.", root, objects, animated, sockets, clips, preview_frame, 2200,
        placement="lane centre at rail height",
        runtime_notes=["Oncoming motion and collision remain track-space controlled."] if oncoming else ["Static lane-blocking obstacle."],
    )


def build_blocker_cart(p: Palette) -> AssetBuild:
    return _build_obstacle_cart("blocker_cart", p, False)


def build_oncoming_cart(p: Palette) -> AssetBuild:
    return _build_obstacle_cart("oncoming_cart", p, True)


def build_broken_rail(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("broken_rail", "obstacle", c)
    objects: list[bpy.types.Object] = []
    for side in (-1, 1):
        objects.append(create_beam_between(f"BrokenTie_{side}", (side * 0.55, -0.72, 0.14), (side * 0.25, 0.55, 0.34 + side * 0.08), 0.28, 0.30, p.get("wood_dark"), c, taper_start=1.1, taper_end=0.55, twist=side * 0.10, bevel=0.025))
        objects.append(create_beam_between(f"BentRail_{side}", (side * 0.55, -0.80, 0.24), (side * 0.75, 0.58, 0.50), 0.12, 0.13, p.get("iron"), c, taper_end=0.65, bend=(side * 0.08, 0), bevel=0.018))
    objects += [
        create_box("WarningPost", (-0.92, 0.0, 0.58), (0.16, 0.18, 1.16), p.get("wood"), c, rotation=(0, 0.16, -0.10), bevel=0.025),
        create_octahedron("WarningLamp", (-0.99, -0.02, 1.20), (0.14, 0.14, 0.18), p.get("hazard"), c),
    ]
    sockets = [add_socket(root, c, "SOCKET_falling_dust", (0, 0.55, 0.10))]
    return AssetBuild("broken_rail", "obstacle", "Splintered gap marker with bent rails and warning lamp.", root, objects, [], sockets, [], 1, 1100, placement="lane centre at gap leading edge", runtime_notes=["The actual gap collision is track-space geometry; this mesh marks its leading edge."])


def build_low_beam(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("low_beam", "obstacle", c)
    # Gameplay clearance contract (Three.js metres above the rail plane):
    #   Rin standing top = 2.95 m, crouched top = 2.18 m.
    # The lowest rigid warning silhouette is authored at 2.25 m, leaving a
    # readable 7 cm crouch margin while still intersecting the standing rider.
    objects: list[bpy.types.Object] = [
        create_beam_between("TopBeam", (-1.35, 0, 2.56), (1.35, 0, 2.56), 0.42, 0.52, p.get("wood"), c, taper_start=1.03, taper_end=0.96, twist=0.02, bevel=0.04),
        create_beam_between("PostL", (-1.30, 0, 0.10), (-1.28, 0, 2.55), 0.34, 0.40, p.get("wood_dark"), c, taper_start=1.08, taper_end=0.95, bevel=0.035),
        create_beam_between("PostR", (1.30, 0, 0.10), (1.28, 0, 2.55), 0.34, 0.40, p.get("wood_dark"), c, taper_start=1.08, taper_end=0.95, bevel=0.035),
        create_box("HazardBar", (0, -0.30, 2.34), (2.42, 0.10, 0.17), p.get("hazard"), c, bevel=0.018),
    ]
    chains: list[bpy.types.Object] = []
    for index, x in enumerate((-0.72, 0.0, 0.72)):
        chain = create_cylinder(f"chain_{index}", (x, -0.24, 2.52), 0.025, 0.38, p.get("iron"), c, vertices=6)
        chains.append(chain)
        objects.append(chain)
        animate_loop_transform(chain, (1, 15, 30, 45, 60), rotations=((0, 0, -0.06), (0.08, 0, 0.10), (0, 0, -0.04), (-0.07, 0, 0.08), (0, 0, -0.06)))
    root["clearance_m"] = 2.25
    return AssetBuild("low_beam", "obstacle", "Measured duck obstacle with timber supports, red warning bar, and swaying chains.", root, objects, chains, [], [Clip("chain_sway_loop", 1, 60, True, "Offset weighty warning-chain motion.")], 15, 1400, placement="lane centre on ground", runtime_notes=["Rigid clearance is 2.25 m above the rail plane: a 2.95 m standing rider collides and a 2.18 m crouched rider clears.", "The beam silhouette must remain fixed; only chains animate."])


def build_portcullis_gate(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("portcullis_gate", "obstacle", c)
    objects: list[bpy.types.Object] = [
        create_box("PostL", (-1.22, 0, 2.00), (0.34, 0.42, 4.00), p.get("iron"), c, bevel=0.045),
        create_box("PostR", (1.22, 0, 2.00), (0.34, 0.42, 4.00), p.get("iron"), c, bevel=0.045),
        create_box("Header", (0, 0, 3.85), (2.72, 0.44, 0.34), p.get("iron"), c, bevel=0.045),
    ]
    gate_rig = create_empty("RIG_gate", (0, 0, 0), c)
    gate_rig.parent = root
    bars: list[bpy.types.Object] = []
    for index, x in enumerate((-0.90, -0.45, 0.0, 0.45, 0.90)):
        bar = create_box(f"gate_bar_{index}", (x, -0.04, 3.00), (0.10, 0.20, 1.50), p.get("iron_light"), c, bevel=0.015)
        bar.parent = gate_rig
        bars.append(bar)
    cross = create_box("gate_warning_crossbar", (0, -0.16, 2.34), (2.10, 0.18, 0.16), p.get("hazard"), c, bevel=0.018)
    cross.parent = gate_rig
    bars.append(cross)
    objects.extend(bars)
    animate_loop_transform(gate_rig, (1, 8, 16, 24, 32), locations=((0, 0, 0), (0.025, 0, 0), (-0.025, 0, 0), (0.015, 0, 0), (0, 0, 0)))
    animate_loop_transform(gate_rig, (45, 58, 72, 90), locations=((0, 0, 0), (0, 0, 0.72), (0, 0, 0.72), (0, 0, 0)))
    clips = [Clip("warning_shudder", 1, 32, False, "Metallic side-to-side warning shudder."), Clip("lift_cycle", 45, 90, False, "Heavy lift, hold, and controlled drop.")]
    root["clearance_m"] = 2.25
    return AssetBuild("portcullis_gate", "obstacle", "Measured half-closed iron portcullis with animated shudder and lift cycles.", root, objects, bars, [], clips, 8, 2100, placement="lane centre on ground", runtime_notes=["Rigid clearance is 2.25 m above the rail plane.", "Gameplay uses the default half-closed pose.", "Only play lift_cycle for set pieces or transitions."])


def build_rock_pile(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("rock_pile", "obstacle", c)
    specs = ((-0.48, 0.08, 0.34, 0.52), (0.04, 0.02, 0.52, 0.68), (0.52, 0.04, 0.30, 0.43), (-0.06, -0.35, 0.25, 0.36), (0.26, 0.34, 0.22, 0.31))
    objects = [make_rock(f"Rock_{i}", (x, y, z), (s, s * 0.82, s * 0.72), p.get("stone" if i % 2 == 0 else "stone_dark"), c, rotation=(i * 0.41, i * 0.28, i * 0.67)) for i, (x, y, z, s) in enumerate(specs)]
    objects.append(create_cone("WarningSpike", (0, -0.20, 1.12), 0.14, 0.02, 0.48, p.get("hazard"), c, vertices=6))
    return AssetBuild("rock_pile", "obstacle", "Layered low-poly rock pile with a clear red jump telegraph.", root, objects, triangle_budget=850, placement="lane centre on ground")


def build_fire_jet(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("fire_jet", "obstacle", c)
    objects: list[bpy.types.Object] = [
        create_cylinder("VentBase", (0, 0, 0.24), 0.46, 0.48, p.get("iron"), c, vertices=10, bevel=0.035),
        create_torus("VentRing", (0, 0, 0.49), 0.37, 0.065, p.get("copper"), c, major_segments=12),
    ]
    flame = create_cone("flame", (0, 0, 1.42), 0.42, 0.045, 2.10, p.get("magma"), c, vertices=8)
    core = create_cone("flame_core", (0, -0.02, 1.05), 0.24, 0.02, 1.15, p.get("gold_core"), c, vertices=7)
    objects.extend([flame, core])
    animated = [flame, core]
    animate_loop_transform(flame, (1, 8, 16, 24, 30), scales=((1, 1, 0.92), (1.10, 0.94, 1.08), (0.92, 1.08, 0.96), (1.06, 0.96, 1.10), (1, 1, 0.92)))
    animate_loop_transform(core, (1, 10, 20, 30), scales=((1, 1, 0.95), (0.88, 1.08, 1.08), (1.08, 0.92, 0.92), (1, 1, 0.95)))
    animate_loop_transform(flame, (45, 52, 65, 80), scales=((0.15, 0.15, 0.15), (1.25, 1.25, 1.30), (1.05, 1.05, 1.12), (0.15, 0.15, 0.15)))
    animate_loop_transform(core, (45, 52, 65, 80), scales=((0.12, 0.12, 0.12), (1.20, 1.20, 1.25), (0.92, 0.92, 1.05), (0.12, 0.12, 0.12)))
    clips = [Clip("flame_loop", 1, 30, True, "Asymmetric low-poly flame pulse."), Clip("burst", 45, 80, False, "Rapid ignition, sustained jet, and shutdown.")]
    sockets = [add_socket(root, c, "SOCKET_fire_particles", (0, 0, 0.58)), add_socket(root, c, "SOCKET_heat_haze", (0, 0, 1.35))]
    return AssetBuild("fire_jet", "obstacle", "Forge vent with layered animated flame meshes and runtime particle sockets.", root, objects, animated, sockets, clips, 10, 1200, placement="lane centre on ground", runtime_notes=["Use runtime particles and heat distortion for close-range richness."])


def build_crystal_spikes(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("crystal_spikes", "obstacle", c)
    objects: list[bpy.types.Object] = []
    specs = ((-0.48, 0.0, 0.62, 0.28, 1.25, -0.18), (0.05, 0.06, 0.84, 0.34, 1.68, 0.08), (0.53, -0.04, 0.52, 0.24, 1.04, 0.24))
    for index, (x, y, z, radius, height, tilt) in enumerate(specs):
        objects.append(make_crystal(f"Spike_{index}", (x, y, z), radius, height, p.get("cyan" if index != 1 else "violet"), c, rotation=(0, tilt, 0)))
    objects.append(create_box("HazardBase", (0, -0.26, 0.09), (1.52, 0.68, 0.16), p.get("hazard"), c, bevel=0.025))
    return AssetBuild("crystal_spikes", "obstacle", "Faceted crystal jump hazard with a consistent red base telegraph.", root, objects, triangle_budget=700, placement="lane centre on ground", runtime_notes=["Decorative wall crystals must not use this red base silhouette."])


def build_debris_cluster(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("debris_cluster", "obstacle", c)
    objects = [
        create_box("PlankA", (-0.12, 0.02, 0.14), (1.02, 0.34, 0.25), p.get("wood_dark"), c, rotation=(0.04, 0.22, 0.34), bevel=0.025),
        create_box("PlankB", (0.22, -0.16, 0.31), (0.78, 0.28, 0.22), p.get("wood"), c, rotation=(-0.08, -0.28, -0.22), bevel=0.025),
        create_cylinder("BrokenBarrel", (-0.34, 0.18, 0.28), 0.19, 0.58, p.get("wood"), c, vertices=8, rotation=(0, math.pi * 0.5, 0.72)),
        make_rock("SmallRock", (0.48, 0.20, 0.18), (0.30, 0.24, 0.20), p.get("stone"), c, rotation=(0.3, 0.5, 0.1)),
    ]
    return AssetBuild("debris_cluster", "obstacle", "Minor-hit cluster of broken boards, barrel timber, and stone.", root, objects, triangle_budget=650, placement="lane centre on ground")


def _build_powerup(asset_id: str, kind: str, p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root(asset_id, "powerup", c)
    ring = create_torus("pickup_ring", (0, 0, 1.0), 0.54, 0.055, p.get("mint"), c, major_segments=14, minor_segments=5, rotation=(math.pi * 0.5, 0, 0))
    objects: list[bpy.types.Object] = [ring]
    animated: list[bpy.types.Object] = [ring]
    core_nodes: list[bpy.types.Object] = []

    if kind == "magnet":
        core_nodes += [
            create_box("magnet_left", (-0.17, 0, 1.0), (0.14, 0.20, 0.42), p.get("hazard"), c, bevel=0.045),
            create_box("magnet_right", (0.17, 0, 1.0), (0.14, 0.20, 0.42), p.get("hazard"), c, bevel=0.045),
            create_box("magnet_bridge", (0, 0, 0.82), (0.42, 0.20, 0.14), p.get("hazard"), c, bevel=0.045),
            create_box("magnet_tip_l", (-0.17, 0, 1.23), (0.15, 0.21, 0.10), p.get("iron_light"), c, bevel=0.025),
            create_box("magnet_tip_r", (0.17, 0, 1.23), (0.15, 0.21, 0.10), p.get("iron_light"), c, bevel=0.025),
        ]
    elif kind == "shield":
        core_nodes.append(create_ico("shield_core", (0, 0, 1.0), (0.32, 0.16, 0.38), p.get("blue"), c, subdivisions=1, rotation=(0, 0, math.radians(45))))
        core_nodes.append(create_box("shield_band", (0, -0.15, 1.0), (0.46, 0.08, 0.10), p.get("iron_light"), c, bevel=0.02))
    elif kind == "ghost":
        core_nodes.append(create_ico("ghost_core", (0, 0, 1.02), (0.32, 0.22, 0.36), p.get("ghost"), c, subdivisions=1))
        core_nodes += [
            create_ico("ghost_eye_l", (-0.10, -0.20, 1.08), (0.035, 0.025, 0.05), p.get("blue"), c, subdivisions=1),
            create_ico("ghost_eye_r", (0.10, -0.20, 1.08), (0.035, 0.025, 0.05), p.get("blue"), c, subdivisions=1),
        ]
    elif kind == "frenzy":
        core_nodes.append(create_octahedron("frenzy_core", (0, 0, 1.0), (0.30, 0.30, 0.38), p.get("gold_core"), c))
        for index in range(4):
            angle = index * math.pi * 0.5
            core_nodes.append(create_cone(f"frenzy_ray_{index}", (math.cos(angle) * 0.38, math.sin(angle) * 0.20, 1.0), 0.07, 0.01, 0.28, p.get("gold"), c, vertices=5, rotation=(0, math.pi * 0.5, angle)))
    else:  # repair
        core_nodes.append(create_box("repair_core", (0, 0, 1.0), (0.42, 0.28, 0.42), p.get("iron"), c, bevel=0.06))
        core_nodes += [
            create_box("repair_cross_v", (0, -0.18, 1.0), (0.12, 0.06, 0.32), p.get("mint"), c, bevel=0.02),
            create_box("repair_cross_h", (0, -0.18, 1.0), (0.32, 0.06, 0.12), p.get("mint"), c, bevel=0.02),
        ]

    objects.extend(core_nodes)
    animated.extend(core_nodes)
    core_rig = create_empty("RIG_core", (0, 0, 1.0), c)
    core_rig.parent = root
    for core in core_nodes:
        parent_keep_world(core, core_rig)
    animate_loop_transform(ring, (1, 60), rotations=((math.pi * 0.5, 0, 0), (math.pi * 0.5, 0, math.tau)), interpolation="LINEAR")
    animate_loop_transform(
        core_rig,
        (1, 15, 30, 45, 60),
        locations=((0, 0, 1.0), (0, 0, 1.10), (0, 0, 1.0), (0, 0, 0.94), (0, 0, 1.0)),
        rotations=((0, 0, 0), (0, 0, 0.18), (0, 0, 0.35), (0, 0, 0.52), (0, 0, math.tau)),
    )
    clip = Clip("pickup_loop", 1, 60, True, "Shared two-second bob and spin cadence used by every power-up.")
    return AssetBuild(asset_id, "powerup", f"Readable low-poly {kind} power-up with a shared mint pickup ring.", root, objects, animated, [], [clip], 15, 1800, placement="lane centre, root at ground; visible core centred at 1 m", runtime_notes=["Runtime magnet attraction may override root position.", "All power-ups use identical loop timing for visual consistency."])


def build_powerup_magnet(p: Palette) -> AssetBuild:
    return _build_powerup("powerup_magnet", "magnet", p)


def build_powerup_shield(p: Palette) -> AssetBuild:
    return _build_powerup("powerup_shield", "shield", p)


def build_powerup_ghost(p: Palette) -> AssetBuild:
    return _build_powerup("powerup_ghost", "ghost", p)


def build_powerup_frenzy(p: Palette) -> AssetBuild:
    return _build_powerup("powerup_frenzy", "frenzy", p)


def build_powerup_repair(p: Palette) -> AssetBuild:
    return _build_powerup("powerup_repair", "repair", p)


def _build_collectible(asset_id: str, rare: bool, p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root(asset_id, "collectible", c)
    if rare:
        core = create_ico("prism_core", (0, 0, 0.90), (0.46, 0.32, 0.52), p.get("violet"), c, subdivisions=1)
        halo = create_torus("prism_halo", (0, 0, 0.90), 0.54, 0.035, p.get("gold"), c, major_segments=12, minor_segments=4, rotation=(math.pi * 0.5, 0, 0))
        objects = [core, halo]
        animated = [core, halo]
        budget = 700
    else:
        core = create_octahedron("ember_core", (0, 0, 0.90), (0.25, 0.25, 0.36), p.get("gold_core"), c)
        objects = [core]
        animated = [core]
        budget = 150
    for index, obj in enumerate(animated):
        base = obj.location.copy()
        animate_loop_transform(obj, (1, 15, 30, 45, 60), locations=((base.x, base.y, base.z), (base.x, base.y, base.z + 0.09), (base.x, base.y, base.z), (base.x, base.y, base.z - 0.05), (base.x, base.y, base.z)), rotations=((0, 0, 0), (0, 0, math.pi * 0.5), (0, 0, math.pi), (0, 0, math.pi * 1.5), (0, 0, math.tau)), interpolation="LINEAR")
    clip = Clip("collectible_loop", 1, 60, True, "Shared bob and one-turn spin loop.")
    return AssetBuild(asset_id, "collectible", "Rare violet Prism collectible." if rare else "Primary golden Ember Shard collectible.", root, objects, animated, [], [clip], 15, budget, placement="lane position; root at ground and visual centred at 0.9 m", runtime_notes=["Runtime collection and magnet pull override the root transform."])


def build_ember_shard(p: Palette) -> AssetBuild:
    return _build_collectible("ember_shard", False, p)


def build_prism(p: Palette) -> AssetBuild:
    return _build_collectible("prism", True, p)


def build_torch_sconce(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("torch_sconce", "environment_prop", c)
    objects: list[bpy.types.Object] = [
        create_box("WallPlate", (0, 0.08, 0.75), (0.42, 0.12, 0.58), p.get("iron"), c, bevel=0.04),
        create_beam_between("Handle", (0, -0.02, 0.34), (0, -0.18, 1.12), 0.09, 0.10, p.get("wood_dark"), c, taper_end=0.82, bevel=0.018),
        create_torus("Basket", (0, -0.20, 1.10), 0.18, 0.045, p.get("iron"), c, major_segments=10, minor_segments=4, rotation=(math.pi * 0.5, 0, 0)),
    ]
    flame = create_cone("flame", (0, -0.20, 1.45), 0.17, 0.02, 0.55, p.get("gold_core"), c, vertices=7)
    objects.append(flame)
    animate_loop_transform(flame, (1, 8, 16, 24, 32, 45), locations=((0, -0.20, 1.45), (0.02, -0.20, 1.48), (-0.015, -0.20, 1.43), (0.018, -0.20, 1.50), (-0.01, -0.20, 1.46), (0, -0.20, 1.45)), scales=((1, 1, 1), (0.92, 1.06, 1.12), (1.08, 0.94, 0.90), (0.88, 1.04, 1.16), (1.05, 0.96, 0.96), (1, 1, 1)))
    sockets = [add_socket(root, c, "SOCKET_point_light", (0, -0.24, 1.42)), add_socket(root, c, "SOCKET_smoke", (0, -0.20, 1.70))]
    return AssetBuild("torch_sconce", "environment_prop", "Iron wall sconce with timber handle and animated low-poly flame.", root, objects, [flame], sockets, [Clip("flame_flicker_loop", 1, 45, True, "Irregular but seamless flame movement.")], 24, 800, placement="wall attachment point at root", runtime_notes=["Use a pooled runtime light at SOCKET_point_light.", "Seed clip playback offset per instance to avoid synchronization."])


def _build_crystal_cluster(asset_id: str, large: bool, p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root(asset_id, "environment_prop", c)
    s = 1.85 if large else 1.0
    specs = ((0, 0, 0.80, 0.30, 1.60, 0.10), (0.38, 0.10, 0.50, 0.21, 1.00, -0.38), (-0.34, -0.05, 0.42, 0.18, 0.84, 0.42), (0.18, -0.18, 0.34, 0.14, 0.68, 0.24))
    objects = [make_crystal(f"Crystal_{i}", (x * s, y * s, z * s), r * s, h * s, p.get("cyan" if i % 2 == 0 else "violet"), c, rotation=(0, tilt, 0)) for i, (x, y, z, r, h, tilt) in enumerate(specs)]
    objects += [make_rock("BaseRockA", (-0.25 * s, 0.05, 0.18 * s), (0.55 * s, 0.42 * s, 0.22 * s), p.get("stone_dark"), c), make_rock("BaseRockB", (0.35 * s, 0.08, 0.15 * s), (0.45 * s, 0.34 * s, 0.18 * s), p.get("stone_dark"), c, rotation=(0.2, 0.6, 0.1))]
    return AssetBuild(asset_id, "environment_prop", f"{'Large' if large else 'Small'} wall-integrated cyan/violet crystal formation.", root, objects, triangle_budget=900 if large else 700, placement="rock/floor attachment point", runtime_notes=["Keep clusters against cavern surfaces so they do not resemble collectible trails."])


def build_crystal_cluster_small(p: Palette) -> AssetBuild:
    return _build_crystal_cluster("crystal_cluster_small", False, p)


def build_crystal_cluster_large(p: Palette) -> AssetBuild:
    return _build_crystal_cluster("crystal_cluster_large", True, p)


def build_ravine_tree(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("ravine_tree", "environment_prop", c)
    objects: list[bpy.types.Object] = [
        create_beam_between("Trunk", (0, 0, 0), (0.12, 0, 2.55), 0.38, 0.42, p.get("wood_dark"), c, taper_start=1.20, taper_mid=0.92, taper_end=0.58, bend=(0.05, 0.02), twist=0.08, bevel=0.035),
        create_beam_between("BranchL", (0.04, 0, 1.72), (-0.75, 0.02, 2.48), 0.20, 0.24, p.get("wood_dark"), c, taper_end=0.40, bend=(-0.04, 0), bevel=0.022),
        create_beam_between("BranchR", (0.08, 0, 1.88), (0.78, -0.02, 2.35), 0.18, 0.22, p.get("wood_dark"), c, taper_end=0.38, bend=(0.03, 0), bevel=0.020),
    ]
    canopy_specs = ((-0.38, 0.02, 2.68, 0.78), (0.35, 0.08, 2.78, 0.86), (0.0, -0.06, 3.18, 0.70), (0.72, 0.02, 2.38, 0.54))
    canopy: list[bpy.types.Object] = []
    for index, (x, y, z, s) in enumerate(canopy_specs):
        leaf = create_ico(f"canopy_{index}", (x, y, z), (s, s * 0.72, s * 0.68), p.get("leaf"), c, subdivisions=1, rotation=(index * 0.2, index * 0.4, index * 0.3))
        canopy.append(leaf)
        objects.append(leaf)
        base = leaf.location.copy()
        animate_loop_transform(leaf, (1, 22, 45, 68, 90), locations=((base.x, base.y, base.z), (base.x + 0.035, base.y, base.z + 0.015), (base.x - 0.025, base.y, base.z), (base.x + 0.018, base.y, base.z - 0.01), (base.x, base.y, base.z)), rotations=((0, 0, 0), (0.015, 0.025, 0.025), (-0.012, -0.018, -0.020), (0.008, 0.014, 0.014), (0, 0, 0)))
    sockets = [add_socket(root, c, "SOCKET_leaf_motes", (0, 0, 2.75))]
    return AssetBuild("ravine_tree", "environment_prop", "Twisted low-poly ravine tree with layered canopy and subtle wind motion.", root, objects, canopy, sockets, [Clip("wind_sway_loop", 1, 90, True, "Three-second unsynchronized canopy sway.")], 22, 1400, placement="ground centre at trunk base", runtime_notes=["Offset playback time per tree instance.", "Leaf motes and mist remain pooled runtime FX."])


def build_forge_pipe(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("forge_pipe", "environment_prop", c)
    objects: list[bpy.types.Object] = [
        create_cylinder("Pipe", (0, 0, 2.50), 0.42, 5.0, p.get("iron"), c, vertices=10, bevel=0.025),
        create_torus("CollarLow", (0, 0, 1.25), 0.46, 0.07, p.get("iron_light"), c, major_segments=12),
        create_torus("CollarHigh", (0, 0, 3.72), 0.46, 0.07, p.get("iron_light"), c, major_segments=12),
        create_box("Mount", (0, 0.25, 0.35), (0.92, 0.64, 0.70), p.get("iron"), c, bevel=0.06),
    ]
    valve = create_torus("valve_wheel", (0, -0.48, 2.10), 0.48, 0.065, p.get("copper"), c, major_segments=12, minor_segments=5, rotation=(math.pi * 0.5, 0, 0))
    objects.append(valve)
    valve_rig = create_empty("RIG_valve", (0, -0.48, 2.10), c)
    valve_rig.parent = root
    parent_keep_world(valve, valve_rig)
    valve_parts = [valve]
    for index in range(6):
        angle = index * math.tau / 6
        spoke = create_beam_between(f"ValveSpoke_{index}", (0, -0.49, 2.10), (math.cos(angle) * 0.42, -0.49, 2.10 + math.sin(angle) * 0.42), 0.045, 0.05, p.get("copper"), c, bevel=0.008)
        parent_keep_world(spoke, valve_rig)
        valve_parts.append(spoke)
        objects.append(spoke)
    vent = create_octahedron("vent_glow", (0, -0.45, 1.25), (0.18, 0.10, 0.18), p.get("magma"), c)
    objects.append(vent)
    animate_loop_transform(valve_rig, (1, 60), rotations=((0, 0, 0), (0, math.tau, 0)), interpolation="LINEAR")
    animate_loop_transform(vent, (1, 15, 30, 45, 60), scales=((1, 1, 1), (1.16, 1.16, 1.16), (0.94, 0.94, 0.94), (1.08, 1.08, 1.08), (1, 1, 1)))
    sockets = [add_socket(root, c, "SOCKET_steam", (0, -0.48, 1.25)), add_socket(root, c, "SOCKET_heat_light", (0, -0.50, 1.25))]
    return AssetBuild("forge_pipe", "environment_prop", "Black-iron forge pipe with copper valve and pulsing heat vent.", root, objects, [*valve_parts, vent], sockets, [Clip("valve_vent_loop", 1, 60, True, "Slow valve rotation and offset heat pulse.")], 15, 2200, placement="ground/wall attachment centre", runtime_notes=["Steam particles are emitted from SOCKET_steam."])


def build_forge_gear(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("forge_gear", "environment_prop", c)
    rig = create_empty("RIG_gear", (0, 0, 1.75), c)
    rig.parent = root
    objects: list[bpy.types.Object] = []
    moving: list[bpy.types.Object] = []
    wheel = create_cylinder("gear_body", (0, 0, 1.75), 1.45, 0.34, p.get("iron"), c, vertices=12, rotation=(math.pi * 0.5, 0, 0), bevel=0.035)
    parent_keep_world(wheel, rig)
    moving.append(wheel)
    objects.append(wheel)
    hub = create_cylinder("gear_hub", (0, -0.22, 1.75), 0.34, 0.48, p.get("copper"), c, vertices=10, rotation=(math.pi * 0.5, 0, 0), bevel=0.025)
    parent_keep_world(hub, rig)
    moving.append(hub)
    objects.append(hub)
    for index in range(10):
        angle = index * math.tau / 10
        tooth = create_box(f"gear_tooth_{index}", (math.cos(angle) * 1.58, 0, 1.75 + math.sin(angle) * 1.58), (0.42, 0.38, 0.54), p.get("iron"), c, rotation=(0, angle, 0), bevel=0.025)
        parent_keep_world(tooth, rig)
        moving.append(tooth)
        objects.append(tooth)
    animate_loop_transform(rig, (1, 60), rotations=((0, 0, 0), (0, math.tau, 0)), interpolation="LINEAR")
    return AssetBuild("forge_gear", "environment_prop", "Large ten-tooth forge gear with copper hub and continuous mechanical loop.", root, objects, moving, [], [Clip("gear_spin_loop", 1, 60, True, "Two-second constant-speed rotation.")], 15, 2600, placement="gear axle centre projected to ground root", runtime_notes=["Reverse playback for meshing neighbouring gears."])


def build_waterfall_frame(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("waterfall_frame", "environment_prop", c)
    objects: list[bpy.types.Object] = [
        create_beam_between("FrameL", (-1.75, 0, 0), (-1.68, 0, 4.20), 0.34, 0.40, p.get("wood_dark"), c, taper_end=0.84, bevel=0.035),
        create_beam_between("FrameR", (1.75, 0, 0), (1.68, 0, 4.20), 0.34, 0.40, p.get("wood_dark"), c, taper_end=0.84, bevel=0.035),
        create_beam_between("FrameTop", (-1.80, 0, 4.10), (1.80, 0, 4.10), 0.38, 0.42, p.get("wood"), c, taper_start=1.05, taper_end=0.95, bevel=0.035),
    ]
    water_a = create_plane("water_front", (0, -0.06, 2.05), (3.10, 3.95), p.get("water"), c, rotation=(math.pi * 0.5, 0, 0))
    water_b = create_plane("water_back", (0.18, 0.02, 2.12), (2.65, 3.90), p.get("water"), c, rotation=(math.pi * 0.5, 0, 0))
    objects.extend([water_a, water_b])
    for index, water in enumerate((water_a, water_b)):
        base = water.location.copy()
        animate_loop_transform(water, (1, 20, 40, 60), locations=((base.x, base.y, base.z + 0.08), (base.x + 0.05 * (1 if index == 0 else -1), base.y, base.z - 0.04), (base.x - 0.04, base.y, base.z + 0.03), (base.x, base.y, base.z + 0.08)), scales=((1, 1, 1.02), (0.98, 1, 0.99), (1.02, 1, 1.01), (1, 1, 1.02)))
    sockets = [add_socket(root, c, "SOCKET_mist", (0, -0.20, 0.30)), add_socket(root, c, "SOCKET_splash", (0, -0.12, 0.08))]
    return AssetBuild("waterfall_frame", "environment_prop", "Timber-framed layered waterfall card with subtle flowing silhouette animation.", root, objects, [water_a, water_b], sockets, [Clip("water_flow_loop", 1, 60, True, "Counter-offset layered flow motion.")], 20, 1000, placement="ground centre at waterfall base", runtime_notes=["Use runtime mist and splash particles at named sockets.", "Material opacity may be tuned in Three.js for the scene background."])


def build_rock_wall_cluster(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("rock_wall_cluster", "environment_prop", c)
    specs = ((-1.45, 0.2, 1.2, 1.55, 0.78, 1.35), (-0.15, 0, 1.65, 1.28, 0.92, 1.85), (1.18, 0.12, 1.05, 1.42, 0.80, 1.25), (0.42, -0.20, 0.48, 0.90, 0.72, 0.62), (-0.90, -0.18, 0.35, 0.72, 0.58, 0.48))
    objects = [make_rock(f"WallRock_{i}", (x, y, z), (sx, sy, sz), p.get("stone" if i % 2 == 0 else "stone_dark"), c, rotation=(i * 0.31, i * 0.47, i * 0.19)) for i, (x, y, z, sx, sy, sz) in enumerate(specs)]
    return AssetBuild("rock_wall_cluster", "environment_prop", "Modular layered rock silhouette for breaking up procedural cavern walls.", root, objects, triangle_budget=900, placement="wall or ground attachment centre", runtime_notes=["Rotate, mirror, and vary scale between 0.85 and 1.15 per instance."])


def build_rail_ballast_cluster(p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root("rail_ballast_cluster", "environment_prop", c)
    objects: list[bpy.types.Object] = []
    positions = ((-0.78, -0.35, 0.12, 0.24), (-0.50, 0.08, 0.11, 0.20), (-0.18, -0.28, 0.10, 0.18), (0.10, 0.16, 0.13, 0.23), (0.42, -0.12, 0.09, 0.17), (0.72, 0.25, 0.12, 0.22), (0.88, -0.30, 0.10, 0.19), (-0.92, 0.28, 0.09, 0.17))
    for index, (x, y, z, s) in enumerate(positions):
        objects.append(make_rock(f"Ballast_{index}", (x, y, z), (s, s * 0.72, s * 0.58), p.get("stone" if index % 3 else "stone_dark"), c, rotation=(index * 0.7, index * 0.4, index * 0.9)))
    objects += [
        create_box("BrokenTieChip", (-0.12, 0.42, 0.14), (0.72, 0.18, 0.12), p.get("wood_dark"), c, rotation=(0.06, 0.22, 0.12), bevel=0.015),
        create_cylinder("LooseBolt", (0.52, 0.02, 0.18), 0.055, 0.24, p.get("iron"), c, vertices=8, rotation=(0.4, 0.7, 0.2)),
    ]
    return AssetBuild("rail_ballast_cluster", "environment_prop", "Small ballast, broken tie wood, and loose hardware for near-camera rail detail.", root, objects, triangle_budget=700, placement="ground edge beside rails", runtime_notes=["Instance along rail shoulders, never in the collision lane centre."])


def _build_support_variant(asset_id: str, variant: str, p: Palette) -> AssetBuild:
    c = ensure_collection("ASSET")
    root = make_root(asset_id, "environment_modular_support", c)
    primary_key = "wood_dark" if variant == "C" else "wood"
    brace_key = "wood" if variant == "C" else "wood_dark"
    objects: list[bpy.types.Object] = []
    objects += [
        create_beam_between("PostL", (-6.88, 0, 0.22), (-6.52, 0, 5.48), 0.70, 0.68, p.get(primary_key), c, taper_start=1.08, taper_end=0.90, bend=(-0.04, 0.015), twist=0.02, bevel=0.05),
        create_beam_between("PostR", (6.88, 0, 0.22), (6.50, 0, 5.50), 0.69, 0.67, p.get(primary_key), c, taper_start=1.06, taper_end=0.91, bend=(0.03, -0.012), twist=-0.018, bevel=0.05),
        create_beam_between("RafterL", (-6.62, 0, 5.36), (0.08, 0, 8.30), 0.65, 0.70, p.get(primary_key), c, taper_end=0.88, twist=0.014, bevel=0.047),
        create_beam_between("RafterR", (6.62, 0, 5.36), (-0.08, 0, 8.30), 0.65, 0.70, p.get(primary_key), c, taper_end=0.90, twist=-0.014, bevel=0.047),
        create_beam_between("Collar", (-3.72, 0.015, 6.66), (3.70, 0.015, 6.66), 0.44, 0.56, p.get(brace_key), c, taper_start=1.04, taper_end=0.96, bevel=0.038),
    ]
    if variant == "B":
        objects += [
            create_beam_between("BraceL_Repaired", (-6.56, 0.02, 3.90), (-4.35, 0.02, 5.52), 0.40, 0.48, p.get("wood_dark"), c, taper_end=0.86, bevel=0.032),
            create_box("RepairPlateL", (-6.65, -0.39, 3.20), (0.82, 0.08, 1.02), p.get("iron"), c, rotation=(0, 0.08, 0), bevel=0.018),
            create_box("RepairPlateLBack", (-6.65, 0.39, 3.20), (0.82, 0.08, 1.02), p.get("iron"), c, rotation=(0, 0.08, 0), bevel=0.018),
        ]
    else:
        objects += [
            create_beam_between("BraceR_Burned", (6.56, -0.02, 4.00), (4.35, -0.02, 5.52), 0.39, 0.47, p.get("wood"), c, taper_end=0.78, twist=-0.04, bevel=0.030),
            create_box("ApexReinforcement", (0, -0.39, 8.10), (1.10, 0.08, 0.78), p.get("iron"), c, rotation=(0, math.radians(45), 0), bevel=0.018),
            create_box("CharMark", (-4.25, -0.37, 6.30), (1.80, 0.035, 0.09), p.get("maw"), c, rotation=(0, -0.42, -0.02)),
        ]
    for side in (-1, 1):
        objects += [
            create_box(f"BaseShoe_{side}", (side * 6.87, 0, 0.22), (0.94, 0.80, 0.40), p.get("iron"), c, bevel=0.022),
            create_box(f"ShoulderBand_{side}", (side * 6.52, 0, 5.34), (0.84, 0.76, 0.16), p.get("iron"), c, bevel=0.010),
        ]
    sockets = [add_socket(root, c, "SOCKET_torch_left", (-6.12, -0.44, 3.12)), add_socket(root, c, "SOCKET_torch_right", (6.12, -0.44, 3.12)), add_socket(root, c, "SOCKET_apex_fx", (0, 0, 8.12))]
    root["clear_width_m"] = 12.0
    root["clear_height_m"] = 6.35
    return AssetBuild(asset_id, "environment_modular_support", f"Timber support variant {variant} with {'left-side repair reinforcement' if variant == 'B' else 'burned timber and apex reinforcement'}.", root, objects, [], sockets, [], 1, 1500, placement="track centreline at ground", runtime_notes=["Same clearance and origin contract as Timber Support Arch A.", "Attach torches and dust to named sockets."])


def build_timber_support_arch_b(p: Palette) -> AssetBuild:
    return _build_support_variant("timber_support_arch_b", "B", p)


def build_timber_support_arch_c(p: Palette) -> AssetBuild:
    return _build_support_variant("timber_support_arch_c", "C", p)


BUILDERS: dict[str, Callable[[Palette], AssetBuild]] = {
    "minecart_hero": build_minecart_hero,
    "rin_vale": build_rin_vale,
    "iron_maw": build_iron_maw,
    "blocker_cart": build_blocker_cart,
    "oncoming_cart": build_oncoming_cart,
    "broken_rail": build_broken_rail,
    "low_beam": build_low_beam,
    "portcullis_gate": build_portcullis_gate,
    "rock_pile": build_rock_pile,
    "fire_jet": build_fire_jet,
    "crystal_spikes": build_crystal_spikes,
    "debris_cluster": build_debris_cluster,
    "powerup_magnet": build_powerup_magnet,
    "powerup_shield": build_powerup_shield,
    "powerup_ghost": build_powerup_ghost,
    "powerup_frenzy": build_powerup_frenzy,
    "powerup_repair": build_powerup_repair,
    "ember_shard": build_ember_shard,
    "prism": build_prism,
    "torch_sconce": build_torch_sconce,
    "crystal_cluster_small": build_crystal_cluster_small,
    "crystal_cluster_large": build_crystal_cluster_large,
    "ravine_tree": build_ravine_tree,
    "forge_pipe": build_forge_pipe,
    "forge_gear": build_forge_gear,
    "waterfall_frame": build_waterfall_frame,
    "rock_wall_cluster": build_rock_wall_cluster,
    "rail_ballast_cluster": build_rail_ballast_cluster,
    "timber_support_arch_b": build_timber_support_arch_b,
    "timber_support_arch_c": build_timber_support_arch_c,
}


def refresh_catalog(repo_root: Path) -> None:
    output_root = repo_root / OUTPUT_ROOT_NAME
    entries: list[dict] = []
    for manifest_path in sorted(output_root.glob("*/asset_manifest.json")):
        try:
            entries.append(json.loads(manifest_path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue

    catalog = {
        "game": GAME_NAME,
        "version": VERSION,
        "assetCount": len(entries),
        "assets": [
            {
                "assetId": entry.get("assetId"),
                "category": entry.get("category", entry.get("type")),
                "folder": entry.get("assetId"),
                "runtime": entry.get("files", {}).get("runtime", entry.get("runtimeFile")),
                "triangles": entry.get("performance", {}).get("triangles"),
                "glbBytes": entry.get("performance", {}).get("glbBytes"),
                "animationClips": [clip.get("name") for clip in entry.get("animation", {}).get("clips", [])],
                "validation": entry.get("qualityGates", {}).get("allPass", entry.get("validation") == "passed"),
            }
            for entry in entries
        ],
    }
    write_json(output_root / "ASSET_CATALOG.json", catalog)

    lines = [
        "# Relic Rails — Ready-to-Use Asset Catalog",
        "",
        f"This folder contains {len(entries)} individually packaged low-poly assets for {GAME_NAME}.",
        "Each asset folder contains a runtime GLB, editable Blender source, preview, manifest, and usage README.",
        "",
        "| Asset | Category | Triangles | GLB | Animation clips | Valid |",
        "|---|---|---:|---:|---|:---:|",
    ]
    for asset in catalog["assets"]:
        clip_text = ", ".join(asset["animationClips"]) if asset["animationClips"] else "Static"
        lines.append(
            f"| `{asset['assetId']}` | {asset['category']} | {asset['triangles'] or '—'} | "
            f"{asset['glbBytes'] or '—'} bytes | {clip_text} | {'✓' if asset['validation'] else '✗'} |"
        )
    lines += [
        "",
        "## Integration rule",
        "",
        "Copy only the `.glb` files required by the current build into the game's served asset directory.",
        "Load each GLB once and clone or instance repeated models. Use the manifest frame ranges to create",
        "Three.js animation subclips from each embedded action library.",
        "",
    ]
    (output_root / "ASSET_CATALOG.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    selected = args.asset or list(BUILDERS)
    unknown = sorted(set(selected) - set(BUILDERS))
    if unknown:
        raise ValueError(f"Unknown asset IDs: {', '.join(unknown)}")

    failures: list[str] = []
    for index, asset_id in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] Generating {asset_id}")
        try:
            clear_scene()
            configure_scene(asset_id)
            palette = Palette()
            build = finalize_build(BUILDERS[asset_id](palette))
            manifest = write_package(build, repo_root, palette, args.no_render)
            perf = manifest["performance"]
            passed = manifest["qualityGates"]["allPass"]
            print(
                f"  {asset_id}: {perf['triangles']} tris, {perf['glbBytes']} bytes, "
                f"{len(manifest['animation']['clips'])} clips, pass={passed}"
            )
            if not passed:
                failures.append(asset_id)
        except Exception as error:
            failures.append(asset_id)
            print(f"  FAILED {asset_id}: {error}")
            raise

    refresh_catalog(repo_root)
    if failures:
        raise RuntimeError(f"Asset quality gates failed: {', '.join(failures)}")
    print(f"Generated {len(selected)} assets. Catalog refreshed.")


if __name__ == "__main__":
    main()
