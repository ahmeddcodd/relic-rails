"""Re-import every ready-to-use GLB and validate the complete asset pack."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
PACK_ROOT = PROJECT_ROOT / "READY_TO_USE_ASSETS"
REPORT_PATH = PACK_ROOT / "VALIDATION_REPORT.json"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_common import clear_scene, count_triangles, object_bounds  # noqa: E402


def runtime_name(manifest: dict) -> str:
    files = manifest.get("files", {})
    return files.get("runtime") or manifest.get("runtimeFile") or f"{manifest['assetId']}.glb"


def expected_animation(manifest: dict) -> bool:
    return bool(manifest.get("animation", {}).get("clips", []))


def validate_asset(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    asset_id = manifest["assetId"]
    glb = manifest_path.parent / runtime_name(manifest)
    expected_root = asset_id
    expected = manifest.get("performance", {})
    expected_sockets = set(manifest.get("sockets", []))

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    bpy.context.view_layer.update()

    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    empties = [obj for obj in objects if obj.type == "EMPTY"]
    materials = sorted({
        slot.material.name
        for obj in meshes
        for slot in obj.material_slots
        if slot.material
    })
    sockets = {obj.name for obj in empties if obj.name.startswith("SOCKET_")}
    root = bpy.data.objects.get(expected_root)
    vertices, triangles = count_triangles(meshes)
    actions = list(bpy.data.actions)
    action_names = sorted(action.name for action in actions)
    has_actions = bool(actions)
    expects_actions = expected_animation(manifest)
    expected_library = manifest.get("animation", {}).get("library")

    root_asset_id = None
    if root:
        root_asset_id = root.get("asset_id") or root.get("assetId")

    checks = {
        "glbExists": glb.is_file(),
        "rootPresent": root is not None,
        "rootAssetId": root_asset_id in (None, asset_id),
        "meshCount": len(meshes) == expected.get("meshPrimitives", len(meshes)),
        "materialCount": len(materials) == expected.get("materials", len(materials)),
        "triangleCount": triangles == expected.get("triangles", triangles),
        "socketNames": sockets == expected_sockets,
        "animationPresence": has_actions == expects_actions,
        "animationCount": len(actions) == (1 if expects_actions else 0),
        "animationLibraryName": (action_names == [expected_library]) if expects_actions else not action_names,
    }

    return {
        "assetId": asset_id,
        "glb": str(glb.relative_to(PROJECT_ROOT)),
        "imported": {
            "root": root.name if root else None,
            "meshes": len(meshes),
            "materials": len(materials),
            "vertices": vertices,
            "triangles": triangles,
            "sockets": sorted(sockets),
            "actions": len(actions),
            "actionNames": action_names,
            "boundsBlenderMetres": object_bounds(meshes),
        },
        "checks": checks,
        "allPass": all(checks.values()),
    }


def main() -> None:
    manifests = sorted(PACK_ROOT.glob("*/asset_manifest.json"))
    if not manifests:
        raise RuntimeError(f"No asset manifests found below {PACK_ROOT}")

    results = []
    for index, manifest_path in enumerate(manifests, 1):
        result = validate_asset(manifest_path)
        results.append(result)
        print(
            f"[{index:02d}/{len(manifests):02d}] {result['assetId']}: "
            f"{result['imported']['triangles']} tris, "
            f"{result['imported']['actions']} actions, pass={result['allPass']}"
        )

    report = {
        "game": "Relic Rails: Abyss Run",
        "validatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "assetCount": len(results),
        "passed": sum(result["allPass"] for result in results),
        "failed": sum(not result["allPass"] for result in results),
        "allPass": all(result["allPass"] for result in results),
        "assets": results,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("assetCount", "passed", "failed", "allPass")}, indent=2))

    if not report["allPass"]:
        failed = [result["assetId"] for result in results if not result["allPass"]]
        raise RuntimeError(f"Asset pack validation failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
