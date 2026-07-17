"""Re-import a generated GLB in a clean Blender scene and validate its contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_common import clear_scene, count_triangles, object_bounds  # noqa: E402


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--meshes", type=int, required=True)
    parser.add_argument("--materials", type=int, required=True)
    parser.add_argument("--sockets", type=int, required=True)
    return parser.parse_args(args)


def main() -> None:
    args = parse_args()
    glb = args.glb.resolve()
    if not glb.exists():
        raise FileNotFoundError(glb)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    bpy.context.view_layer.update()

    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    empties = [obj for obj in objects if obj.type == "EMPTY"]
    materials = sorted({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material})
    sockets = sorted(obj.name for obj in empties if obj.name.startswith("SOCKET_"))
    root = bpy.data.objects.get(args.root)
    vertices, triangles = count_triangles(meshes)

    checks = {
        "root_present": root is not None,
        "mesh_count": len(meshes) == args.meshes,
        "material_count": len(materials) == args.materials,
        "socket_count": len(sockets) == args.sockets,
        "no_actions": len(bpy.data.actions) == 0,
    }
    result = {
        "glb": str(glb),
        "root": root.name if root else None,
        "root_extras": dict(root.items()) if root else {},
        "meshes": [obj.name for obj in meshes],
        "materials": materials,
        "sockets": sockets,
        "vertices": vertices,
        "triangles": triangles,
        "bounds": object_bounds(meshes),
        "checks": checks,
        "all_pass": all(checks.values()),
    }
    print(json.dumps(result, indent=2))
    if not result["all_pass"]:
        raise RuntimeError("GLB contract validation failed")


if __name__ == "__main__":
    main()
