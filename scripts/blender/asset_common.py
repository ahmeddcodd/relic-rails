"""Shared deterministic Blender helpers for Relic Rails asset generators."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector


GAME_NAME = "Relic Rails: Abyss Run"


def clear_scene() -> None:
    """Remove all scene datablocks created by a previous interactive run."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def ensure_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for source in list(obj.users_collection):
        source.objects.unlink(obj)
    collection.objects.link(obj)


def make_principled_material(
    name: str,
    base_color: Sequence[float],
    *,
    roughness: float,
    metallic: float = 0.0,
    emission_color: Sequence[float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.diffuse_color = (*base_color[:3], base_color[3] if len(base_color) > 3 else 1.0)
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is None:
        raise RuntimeError(f"Principled BSDF missing from {name}")
    node.inputs["Base Color"].default_value = material.diffuse_color
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Metallic"].default_value = metallic
    if emission_color is not None and "Emission Color" in node.inputs:
        node.inputs["Emission Color"].default_value = (*emission_color[:3], 1.0)
        node.inputs["Emission Strength"].default_value = emission_strength
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def apply_modifier(obj: bpy.types.Object, name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=name)
    obj.select_set(False)


def bevel_mesh(obj: bpy.types.Object, width: float, segments: int = 1) -> None:
    if obj.type != "MESH" or width <= 0:
        return
    modifier = obj.modifiers.new(name="ProductionBevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    apply_modifier(obj, modifier.name)


def triangulate_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    modifier = obj.modifiers.new(name="ExportTriangulate", type="TRIANGULATE")
    modifier.keep_custom_normals = True
    apply_modifier(obj, modifier.name)


def create_box(
    name: str,
    location: Sequence[float],
    dimensions: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    move_to_collection(obj, collection)
    bevel_mesh(obj, bevel)
    return obj


def create_cylinder(
    name: str,
    location: Sequence[float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    vertices: int = 8,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign_material(obj, material)
    move_to_collection(obj, collection)
    bevel_mesh(obj, bevel)
    return obj


def create_cone(
    name: str,
    location: Sequence[float],
    radius1: float,
    radius2: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    vertices: int = 7,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign_material(obj, material)
    move_to_collection(obj, collection)
    bevel_mesh(obj, bevel)
    return obj


def create_ico(
    name: str,
    location: Sequence[float],
    scale: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    subdivisions: int = 1,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions,
        radius=1.0,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    move_to_collection(obj, collection)
    return obj


def create_uv_sphere(
    name: str,
    location: Sequence[float],
    scale: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    segments: int = 10,
    rings: int = 6,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1.0,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    move_to_collection(obj, collection)
    return obj


def create_torus(
    name: str,
    location: Sequence[float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    major_segments: int = 12,
    minor_segments: int = 6,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign_material(obj, material)
    move_to_collection(obj, collection)
    return obj


def create_custom_mesh(
    name: str,
    vertices: Sequence[Sequence[float]],
    faces: Sequence[Sequence[int]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    location: Sequence[float] = (0.0, 0.0, 0.0),
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    collection.objects.link(obj)
    assign_material(obj, material)
    bevel_mesh(obj, bevel)
    return obj


def create_octahedron(
    name: str,
    location: Sequence[float],
    scale: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    sx, sy, sz = scale
    vertices = (
        (sx, 0.0, 0.0),
        (-sx, 0.0, 0.0),
        (0.0, sy, 0.0),
        (0.0, -sy, 0.0),
        (0.0, 0.0, sz),
        (0.0, 0.0, -sz),
    )
    faces = (
        (0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4),
        (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5),
    )
    return create_custom_mesh(
        name,
        vertices,
        faces,
        material,
        collection,
        location=location,
        rotation=rotation,
    )


def create_plane(
    name: str,
    location: Sequence[float],
    size: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[1], 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    move_to_collection(obj, collection)
    return obj


def set_transform_key(
    obj: bpy.types.Object,
    frame: int,
    *,
    location: Sequence[float] | None = None,
    rotation: Sequence[float] | None = None,
    scale: Sequence[float] | None = None,
) -> None:
    if location is not None:
        obj.location = location
        obj.keyframe_insert(data_path="location", frame=frame, group=obj.name)
    if rotation is not None:
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", frame=frame, group=obj.name)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame, group=obj.name)


def set_action_interpolation(obj: bpy.types.Object, interpolation: str = "BEZIER") -> None:
    if not obj.animation_data or not obj.animation_data.action:
        return
    action = obj.animation_data.action
    # Blender 5.x stores new actions in layered channel bags; earlier releases expose
    # Action.fcurves directly. Support both without converting the action.
    if hasattr(action, "fcurves"):
        curves = list(action.fcurves)
    else:
        curves = [
            curve
            for layer in action.layers
            for strip in layer.strips
            for channelbag in strip.channelbags
            for curve in channelbag.fcurves
        ]
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = interpolation
            if interpolation == "BEZIER":
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"


def create_beam_between(
    name: str,
    start: Sequence[float],
    end: Sequence[float],
    width: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    taper_start: float = 1.0,
    taper_mid: float = 1.0,
    taper_end: float = 1.0,
    bend: Sequence[float] = (0.0, 0.0),
    twist: float = 0.0,
    bevel: float = 0.04,
) -> bpy.types.Object:
    """Create a three-ring hand-hewn prism aligned from start to end."""
    p0 = Vector(start)
    p1 = Vector(end)
    direction = p1 - p0
    length = direction.length
    if length <= 1e-5:
        raise ValueError(f"Beam {name} has zero length")

    ring_specs = (
        (-length * 0.5, taper_start, 0.0, 0.0, 0.0),
        (0.0, taper_mid, bend[0], bend[1], twist * 0.5),
        (length * 0.5, taper_end, 0.0, 0.0, twist),
    )
    vertices: list[tuple[float, float, float]] = []
    for z, scale, off_x, off_y, angle in ring_specs:
        half_w = width * scale * 0.5
        half_d = depth * scale * 0.5
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        for x, y in ((-half_w, -half_d), (half_w, -half_d), (half_w, half_d), (-half_w, half_d)):
            rx = x * cos_a - y * sin_a + off_x
            ry = x * sin_a + y * cos_a + off_y
            vertices.append((rx, ry, z))

    faces: list[tuple[int, ...]] = [(0, 3, 2, 1), (8, 9, 10, 11)]
    for ring in range(2):
        a = ring * 4
        b = (ring + 1) * 4
        for side in range(4):
            nxt = (side + 1) % 4
            faces.append((a + side, a + nxt, b + nxt, b + side))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = (p0 + p1) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    assign_material(obj, material)
    bevel_mesh(obj, bevel)
    return obj


def create_empty(
    name: str,
    location: Sequence[float],
    collection: bpy.types.Collection,
    *,
    display_size: float = 0.25,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = display_size
    obj.location = location
    collection.objects.link(obj)
    return obj


def join_meshes_by_material(
    objects: Iterable[bpy.types.Object],
    output_name: str,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    meshes = [obj for obj in objects if obj and obj.type == "MESH"]
    if not meshes:
        raise ValueError(f"No mesh objects supplied for {output_name}")
    if len(meshes) == 1:
        joined = meshes[0]
        joined.name = output_name
        joined.parent = parent
        return joined
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = output_name
    joined.parent = parent
    joined.select_set(False)
    return joined


def parent_objects(objects: Iterable[bpy.types.Object], parent: bpy.types.Object) -> None:
    for obj in objects:
        obj.parent = parent


def look_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def count_triangles(objects: Iterable[bpy.types.Object]) -> tuple[int, int]:
    vertices = 0
    triangles = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        vertices += len(mesh.vertices)
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
    return vertices, triangles


def object_bounds(objects: Iterable[bpy.types.Object]) -> dict[str, list[float]]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        found = True
        # Read final mesh vertices instead of Object.bound_box. Blender can retain a
        # stale local bound box after several modifier/apply/join operations in one
        # headless run, while the exported mesh vertices are authoritative.
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            minimum.x = min(minimum.x, world.x)
            minimum.y = min(minimum.y, world.y)
            minimum.z = min(minimum.z, world.z)
            maximum.x = max(maximum.x, world.x)
            maximum.y = max(maximum.y, world.y)
            maximum.z = max(maximum.z, world.z)
    if not found:
        return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0], "size": [0.0, 0.0, 0.0]}
    size = maximum - minimum
    return {
        "min": [round(v, 4) for v in minimum],
        "max": [round(v, 4) for v in maximum],
        "size": [round(v, 4) for v in size],
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
