#!/usr/bin/env python3
"""Publish a lightweight StockScout client payload beside the canonical snapshot.

The nightly pipeline continues to build, validate and persist ``latest.json`` as
the complete canonical/audit snapshot. This presentation-only step derives
``core.json`` by removing nested duplicate/heavy row payloads that the default
STOCKSCOUT terminal does not render. LEGACY and rich source evidence remain in
``latest.json`` and are loaded only when those views are opened.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "frontend" / "public" / "data"
LATEST = DATA_DIR / "latest.json"
CORE = DATA_DIR / "core.json"
MANIFEST = DATA_DIR / "manifest.json"
MODEL = "stockscout-client-core-v1"
HEAVY_ROW_KEYS = {"originalEngine", "richData", "stockscout"}


def encoded(payload: Any) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_core_payload(payload: dict[str, Any]) -> dict[str, Any]:
    core = copy.deepcopy(payload)
    rows = []
    for row in payload.get("universe") or []:
        if not isinstance(row, dict):
            continue
        rows.append({key: value for key, value in row.items() if key not in HEAVY_ROW_KEYS})
    core["universe"] = rows
    core["clientPayloadModel"] = MODEL
    core["fullDataFile"] = "latest.json"

    layers = core.get("layers")
    if isinstance(layers, dict):
        legacy = layers.get("legacy")
        if isinstance(legacy, dict):
            legacy["lazyFile"] = "latest.json"
        layers["sharedEvidenceFile"] = "latest.json"
    return core


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_bytes(data)
    temp.replace(path)


def publish(latest: Path = LATEST, core_path: Path = CORE, manifest: Path = MANIFEST) -> dict[str, Any]:
    if not latest.exists():
        raise SystemExit(f"Missing validated frontend payload: {latest}")

    full_bytes = latest.read_bytes()
    payload = json.loads(full_bytes)
    if not isinstance(payload, dict) or not payload.get("universe"):
        raise SystemExit("Validated frontend payload has no universe")

    core = build_core_payload(payload)
    core_bytes = encoded(core)
    if len(core.get("universe") or []) != len(payload.get("universe") or []):
        raise SystemExit("Core payload changed universe cardinality")
    if core.get("chartShards") != payload.get("chartShards"):
        raise SystemExit("Core payload changed chart-shard mapping")
    if len(core_bytes) >= len(full_bytes):
        raise SystemExit(
            f"Core payload did not shrink: core={len(core_bytes):,} full={len(full_bytes):,}"
        )

    manifest_payload = {
        "model": MODEL,
        "generatedAt": payload.get("generatedAt"),
        "universe": len(core.get("universe") or []),
        "coreFile": "core.json",
        "fullFile": "latest.json",
        "coreBytes": len(core_bytes),
        "fullBytes": len(full_bytes),
        "coreSha256": sha256(core_bytes),
        "fullSha256": sha256(full_bytes),
        "strippedRowKeys": sorted(HEAVY_ROW_KEYS),
    }

    atomic_write(core_path, core_bytes)
    atomic_write(manifest, encoded(manifest_payload) + b"\n")
    if latest.read_bytes() != full_bytes:
        raise SystemExit("Invariant violation: client projection modified canonical latest.json")

    ratio = len(core_bytes) / max(1, len(full_bytes))
    print(
        f"Frontend client payload: core={len(core_bytes)/1024/1024:.2f} MB, "
        f"canonical={len(full_bytes)/1024/1024:.2f} MB ({ratio:.1%} of canonical)"
    )
    return manifest_payload


if __name__ == "__main__":
    publish()
