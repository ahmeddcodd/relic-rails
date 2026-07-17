"""Generate the Relic Rails Timber Support Arch A asset.

Run from the repository root:
    blender --background --python scripts/blender/generate_timber_support_arch.py

The script writes an editable .blend, a selected-object .glb, a preview PNG, and a
machine-readable validation report. Generation is deterministic.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_common import (  # noqa: E402
    GAME_NAME,
    clear_scene,
    count_triangles,
    create_beam_between,
    create_box,
    create_cylinder,
    create_empty,
    ensure_collection,
    join_meshes_by_material,
    look_at,
    make_principled_material,
    move_to_collection,
    object_bounds,
    triangulate_mesh,
    write_json,
)


ASSET_ID = "timber_support_arch"
ASSET_VERSION = "1.0.0"
GENERATOR_NAME = Path(__file__).name


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=SCRIPT_DIR.parents[1],
        help="Relic Rails repository root. Defaults to the generator's repository.",
    )
    parser.add_argument("--no-render", action="store_true", help="Skip preview rendering.")
    return parser.parse_args(args)


def configure_scene() -> None:
    scene = bpy.context.scene
    # Generators overwrite their own output intentionally; do not accumulate .blend1
    # backups in source control on every reproducible headless build.
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    # Blender 5.x exposes the current Eevee renderer through BLENDER_EEVEE.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("RelicRailsPreviewWorld") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.009, 0.005, 0.003, 1.0)
    background.inputs["Strength"].default_value = 0.22


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "wood": make_principled_material(
            "MAT_Wood_Primary",
            (0.255, 0.115, 0.040, 1.0),
            roughness=0.88,
        ),
        "wood_dark": make_principled_material(
            "MAT_Wood_Dark",
            (0.075, 0.029, 0.010, 1.0),
            roughness=0.94,
        ),
        "iron": make_principled_material(
            "MAT_Iron_Dark",
            (0.085, 0.078, 0.071, 1.0),
            roughness=0.60,
            metallic=0.78,
        ),
    }


def build_asset() -> tuple[bpy.types.Object, list[bpy.types.Object], list[bpy.types.Object]]:
    asset_collection = ensure_collection("ASSET")
    materials = make_materials()

    root = bpy.data.objects.new(ASSET_ID, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.45
    asset_collection.objects.link(root)
    root["asset_id"] = ASSET_ID
    root["asset_version"] = ASSET_VERSION
    root["game"] = GAME_NAME
    root["asset_type"] = "environment_modular_support"
    root["animation_mode"] = "static_runtime_fx_sockets"
    root["generator"] = GENERATOR_NAME
    root["blender_forward"] = "-Y"
    root["threejs_forward"] = "+Z"
    root["clear_width_m"] = 12.0
    root["clear_height_m"] = 6.35

    wood: list[bpy.types.Object] = []
    dark_wood: list[bpy.types.Object] = []
    iron: list[bpy.types.Object] = []

    # Primary posts: a subtle inward lean and different taper at each end keep the
    # silhouette hand-built while preserving a safe, symmetric gameplay opening.
    wood.append(
        create_beam_between(
            "POST_Left",
            (-6.86, 0.00, 0.24),
            (-6.52, 0.00, 5.48),
            0.68,
            0.66,
            materials["wood"],
            asset_collection,
            taper_start=1.08,
            taper_mid=0.97,
            taper_end=0.91,
            bend=(-0.035, 0.018),
            twist=0.018,
            bevel=0.055,
        )
    )
    wood.append(
        create_beam_between(
            "POST_Right",
            (6.86, 0.00, 0.24),
            (6.50, 0.00, 5.50),
            0.70,
            0.68,
            materials["wood"],
            asset_collection,
            taper_start=1.05,
            taper_mid=0.99,
            taper_end=0.90,
            bend=(0.028, -0.012),
            twist=-0.015,
            bevel=0.055,
        )
    )

    # Pointed rafters create the reference-defining mine profile and remain well below
    # the generated cavern ceiling.
    wood.append(
        create_beam_between(
            "RAFTER_Left",
            (-6.63, 0.00, 5.36),
            (0.10, 0.00, 8.30),
            0.64,
            0.72,
            materials["wood"],
            asset_collection,
            taper_start=1.00,
            taper_mid=0.96,
            taper_end=0.89,
            bend=(0.00, 0.018),
            twist=0.012,
            bevel=0.050,
        )
    )
    wood.append(
        create_beam_between(
            "RAFTER_Right",
            (6.62, 0.00, 5.36),
            (-0.10, 0.00, 8.30),
            0.66,
            0.70,
            materials["wood"],
            asset_collection,
            taper_start=1.02,
            taper_mid=0.95,
            taper_end=0.90,
            bend=(0.00, -0.016),
            twist=-0.014,
            bevel=0.050,
        )
    )

    # The collar and braces use darker replacement timber. The bottom of the collar is
    # above 6.35 m, so it never reads as a duck obstacle.
    dark_wood.append(
        create_beam_between(
            "COLLAR_High",
            (-3.72, 0.015, 6.66),
            (3.70, 0.015, 6.66),
            0.45,
            0.58,
            materials["wood_dark"],
            asset_collection,
            taper_start=1.02,
            taper_mid=0.96,
            taper_end=1.00,
            bend=(0.0, -0.012),
            twist=0.009,
            bevel=0.040,
        )
    )
    dark_wood.append(
        create_beam_between(
            "BRACE_Left",
            (-6.58, 0.02, 4.14),
            (-4.62, 0.02, 5.46),
            0.38,
            0.50,
            materials["wood_dark"],
            asset_collection,
            taper_start=1.00,
            taper_mid=0.94,
            taper_end=0.97,
            bend=(0.0, 0.012),
            twist=0.014,
            bevel=0.035,
        )
    )
    dark_wood.append(
        create_beam_between(
            "BRACE_Right",
            (6.58, -0.02, 4.12),
            (4.58, -0.02, 5.48),
            0.39,
            0.49,
            materials["wood_dark"],
            asset_collection,
            taper_start=0.98,
            taper_mid=0.95,
            taper_end=1.01,
            bend=(0.0, -0.010),
            twist=-0.012,
            bevel=0.035,
        )
    )

    # Iron shoes keep the base visually planted.
    for side in (-1, 1):
        x = side * 6.86
        iron.append(
            create_box(
                f"IRON_BaseShoe_{'L' if side < 0 else 'R'}",
                (x, 0.0, 0.23),
                (0.96, 0.82, 0.42),
                materials["iron"],
                asset_collection,
                bevel=0.025,
            )
        )
        for z in (1.28, 4.80):
            iron.append(
                create_box(
                    f"IRON_PostBand_{'L' if side < 0 else 'R'}_{z:.2f}",
                    (side * (6.79 - z * 0.045), 0.0, z),
                    (0.79, 0.75, 0.16),
                    materials["iron"],
                    asset_collection,
                    bevel=0.008,
                )
            )

    # Front/back gusset plates and one through-bolt at each important joint.
    joint_specs = (
        ("ShoulderL", -6.49, 5.38, -0.42),
        ("ShoulderR", 6.48, 5.38, 0.42),
        ("Apex", 0.0, 8.17, math.radians(45.0)),
    )
    for label, x, z, tilt in joint_specs:
        for y in (-0.385, 0.385):
            iron.append(
                create_box(
                    f"IRON_Gusset_{label}_{'Front' if y < 0 else 'Back'}",
                    (x, y, z),
                    (0.86 if label != "Apex" else 0.72, 0.075, 0.74),
                    materials["iron"],
                    asset_collection,
                    rotation=(0.0, tilt, 0.0),
                    bevel=0.012,
                )
            )

        bolt_offsets = ((-0.18, -0.14), (0.18, 0.14)) if label == "Apex" else ((0.0, -0.17), (0.0, 0.17))
        for index, (dx, dz) in enumerate(bolt_offsets):
            iron.append(
                create_cylinder(
                    f"IRON_Bolt_{label}_{index}",
                    (x + dx, 0.0, z + dz),
                    0.078,
                    0.91,
                    materials["iron"],
                    asset_collection,
                    vertices=8,
                    rotation=(math.pi * 0.5, 0.0, 0.0),
                    # The eight-sided bolt already has a faceted low-poly edge; an
                    # additional bevel is invisible at gameplay distance and costly
                    # across every repeated support.
                    bevel=0.0,
                )
            )

    # Thin dark marks add large readable grain/cracks without a texture atlas. They sit
    # slightly above the front surface to avoid z-fighting.
    mark_specs = (
        ("MARK_LeftLow", (-6.82, -0.347, 1.55), (-6.72, -0.347, 2.58), 0.060),
        ("MARK_LeftHigh", (-6.62, -0.347, 3.38), (-6.55, -0.347, 4.20), 0.045),
        ("MARK_RightMid", (6.72, -0.354, 2.45), (6.61, -0.354, 3.65), 0.058),
        ("MARK_Collar", (-2.75, -0.302, 6.665), (-0.65, -0.302, 6.665), 0.045),
        ("MARK_RafterL", (-5.05, -0.374, 6.03), (-3.55, -0.374, 6.70), 0.047),
        ("MARK_RafterR", (4.92, -0.364, 6.08), (3.72, -0.364, 6.62), 0.042),
    )
    for label, start, end, width in mark_specs:
        dark_wood.append(
            create_beam_between(
                label,
                start,
                end,
                width,
                0.025,
                materials["wood_dark"],
                asset_collection,
                taper_start=0.45,
                taper_mid=1.0,
                taper_end=0.18,
                bend=(0.012, 0.0),
                bevel=0.0,
            )
        )

    # Joining by material produces the production hierarchy and caps the repeating
    # arch at three mesh primitives/draw calls.
    geo_wood = join_meshes_by_material(wood, "GEO_wood_primary", root)
    geo_dark = join_meshes_by_material(dark_wood, "GEO_wood_dark", root)
    geo_iron = join_meshes_by_material(iron, "GEO_iron", root)
    geometry = [geo_wood, geo_dark, geo_iron]
    for obj in geometry:
        triangulate_mesh(obj)
        for polygon in obj.data.polygons:
            polygon.use_smooth = False

    sockets = [
        create_empty("SOCKET_torch_left", (-6.15, -0.44, 3.12), asset_collection),
        create_empty("SOCKET_torch_right", (6.15, -0.44, 3.12), asset_collection),
        create_empty("SOCKET_dust_left", (-5.72, 0.0, 5.72), asset_collection),
        create_empty("SOCKET_dust_right", (5.70, 0.0, 5.72), asset_collection),
        create_empty("SOCKET_apex_fx", (0.0, 0.0, 8.12), asset_collection),
    ]
    for socket in sockets:
        socket.parent = root
        socket["runtime_fx_only"] = True

    return root, geometry, sockets


def build_preview_stage(asset_geometry: list[bpy.types.Object]) -> None:
    preview = ensure_collection("PREVIEW_ONLY")
    ground_material = make_principled_material(
        "PREVIEW_Ground",
        (0.030, 0.018, 0.010, 1.0),
        roughness=0.98,
    )
    rail_material = make_principled_material(
        "PREVIEW_Rail",
        (0.18, 0.16, 0.14, 1.0),
        roughness=0.38,
        metallic=0.82,
    )
    tie_material = make_principled_material(
        "PREVIEW_Tie",
        (0.13, 0.060, 0.020, 1.0),
        roughness=0.95,
    )

    create_box(
        "PREVIEW_Ground",
        (0.0, 1.0, -0.20),
        (18.0, 14.0, 0.40),
        ground_material,
        preview,
        bevel=0.08,
    )
    for lane in (-2.2, 0.0, 2.2):
        for rail_offset in (-0.55, 0.55):
            create_box(
                f"PREVIEW_Rail_{lane}_{rail_offset}",
                (lane + rail_offset, 1.0, 0.08),
                (0.12, 13.5, 0.16),
                rail_material,
                preview,
                bevel=0.025,
            )
    for index in range(14):
        y = -5.3 + index * 0.95
        create_box(
            f"PREVIEW_Tie_{index:02d}",
            (0.0, y, 0.0),
            (7.75, 0.27, 0.12),
            tie_material,
            preview,
            bevel=0.018,
        )

    # Warm key light plus a cool rim reproduces the intended mine lighting language.
    bpy.ops.object.light_add(type="AREA", location=(-5.5, -6.0, 8.8))
    key = bpy.context.object
    key.name = "PREVIEW_Key_Warm"
    key.data.energy = 1150
    key.data.shape = "DISK"
    key.data.size = 5.0
    key.data.color = (1.0, 0.38, 0.12)
    look_at(key, (0.0, 0.0, 3.8))
    move_to_collection(key, preview)

    bpy.ops.object.light_add(type="AREA", location=(7.5, 1.0, 7.0))
    rim = bpy.context.object
    rim.name = "PREVIEW_Rim_Cool"
    rim.data.energy = 920
    rim.data.shape = "DISK"
    rim.data.size = 4.5
    rim.data.color = (0.22, 0.36, 0.68)
    look_at(rim, (0.0, 0.0, 4.3))
    move_to_collection(rim, preview)

    bpy.ops.object.light_add(type="POINT", location=(-5.7, -2.8, 3.1))
    practical = bpy.context.object
    practical.name = "PREVIEW_Practical"
    practical.data.energy = 420
    practical.data.color = (1.0, 0.16, 0.025)
    practical.data.shadow_soft_size = 2.0
    move_to_collection(practical, preview)

    bpy.ops.object.camera_add(location=(13.4, -20.5, 10.4))
    camera = bpy.context.object
    camera.name = "PREVIEW_Camera"
    camera.data.lens = 54
    camera.data.sensor_width = 36
    look_at(camera, (0.0, 0.25, 4.0))
    move_to_collection(camera, preview)
    bpy.context.scene.camera = camera

    for obj in asset_geometry:
        obj.visible_camera = True


def export_glb(root: bpy.types.Object, geometry: list[bpy.types.Object], sockets: list[bpy.types.Object], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *geometry, *sockets]:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_animations=False,
        export_yup=True,
        export_materials="EXPORT",
    )
    bpy.ops.object.select_all(action="DESELECT")


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    blend_path = repo_root / "art" / "blender" / ASSET_ID / f"{ASSET_ID}.blend"
    glb_path = repo_root / "art" / "exports" / ASSET_ID / f"{ASSET_ID}.glb"
    preview_path = repo_root / "art" / "previews" / f"{ASSET_ID}.png"
    report_path = repo_root / "art" / "reports" / f"{ASSET_ID}.json"
    for path in (blend_path, glb_path, preview_path, report_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    configure_scene()
    root, geometry, sockets = build_asset()
    build_preview_stage(geometry)
    bpy.context.view_layer.update()

    export_glb(root, geometry, sockets, glb_path)

    if not args.no_render:
        bpy.context.scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    vertices, triangles = count_triangles(geometry)
    bounds = object_bounds(geometry)
    report = {
        "asset_id": ASSET_ID,
        "asset_version": ASSET_VERSION,
        "game": GAME_NAME,
        "generator": GENERATOR_NAME,
        "animation_mode": "static_runtime_fx_sockets",
        "animation_clips": [],
        "geometry": {
            "mesh_primitives": len(geometry),
            "vertices": vertices,
            "triangles": triangles,
            "bounds_blender_metres": bounds,
            "clear_width_m": 12.0,
            "clear_height_m": 6.35,
        },
        "materials": ["MAT_Wood_Primary", "MAT_Wood_Dark", "MAT_Iron_Dark"],
        "sockets": [socket.name for socket in sockets],
        "outputs": {
            "blend": str(blend_path.relative_to(repo_root)).replace("\\", "/"),
            "glb": str(glb_path.relative_to(repo_root)).replace("\\", "/"),
            "preview": str(preview_path.relative_to(repo_root)).replace("\\", "/"),
            "glb_bytes": glb_path.stat().st_size,
        },
        "quality_gates": {
            "triangle_budget_max": 1400,
            "triangle_budget_pass": triangles <= 1400,
            "material_budget_max": 3,
            "material_budget_pass": len({slot.material.name for obj in geometry for slot in obj.material_slots if slot.material}) <= 3,
            "glb_recommended_bytes_max": 512 * 1024,
            "glb_size_pass": glb_path.stat().st_size <= 512 * 1024,
            "static_animation_pass": root.get("animation_mode") == "static_runtime_fx_sockets",
        },
    }
    report["quality_gates"]["all_pass"] = all(
        value for key, value in report["quality_gates"].items() if key.endswith("_pass")
    )
    write_json(report_path, report)
    print(f"Generated {ASSET_ID}: {triangles} triangles, {glb_path.stat().st_size} byte GLB")


if __name__ == "__main__":
    main()
