#!/usr/bin/env python3
"""Publish lightweight StockScout client artifacts beside the canonical snapshot.

The scan pipeline continues to build, validate and persist ``latest.json`` as the
complete canonical/audit snapshot. This presentation-only step derives:

- ``core.json``: lightweight STOCKSCOUT client payload;
- ``shadow/legacy-confirmation.json``: compact read-only LEGACY confirmation;
- ``manifest.json``: snapshot hashes/metadata tying those artifacts together.

No canonical StockScout or frozen LEGACY field is modified by this projection.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

from build_legacy_confirmation_sidecar import build_sidecar

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "frontend" / "public" / "data"
LATEST = DATA_DIR / "latest.json"
CORE = DATA_DIR / "core.json"
MANIFEST = DATA_DIR / "manifest.json"
LEGACY_SIDECAR = DATA_DIR / "shadow" / "legacy-confirmation.json"
MODEL = "stockscout-client-core-v1"
HEAVY_ROW_KEYS = {"originalEngine", "richData", "stockscout"}


def encoded(payload: Any) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_core_payload(
    payload: dict[str, Any],
    confirmation_by_ticker: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build the lightweight client payload and attach only compact shadow fields."""
    core = copy.deepcopy(payload)
    confirmations = confirmation_by_ticker or {}
    rows = []
    for row in payload.get("universe") or []:
        if not isinstance(row, dict):
            continue
        projected = {key: value for key, value in row.items() if key not in HEAVY_ROW_KEYS}
        ticker = str(row.get("ticker") or "").strip().upper()
        confirmation = confirmations.get(ticker)
        if confirmation:
            projected["legacyConfirmationStatus"] = confirmation.get("status")
            projected["legacyConfirmationReasons"] = list(confirmation.get("reasons") or [])
        rows.append(projected)
    core["universe"] = rows
    core["clientPayloadModel"] = MODEL
    core["fullDataFile"] = "latest.json"
    core["legacyConfirmationFile"] = "shadow/legacy-confirmation.json"

    layers = core.get("layers")
    if isinstance(layers, dict):
        legacy = layers.get("legacy")
        if isinstance(legacy, dict):
            legacy["lazyFile"] = "latest.json"
            legacy["confirmationFile"] = "shadow/legacy-confirmation.json"
        layers["sharedEvidenceFile"] = "latest.json"
    return core


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_bytes(data)
    temp.replace(path)


def publish(
    latest: Path = LATEST,
    core_path: Path = CORE,
    manifest: Path = MANIFEST,
    legacy_sidecar_path: Path = LEGACY_SIDECAR,
) -> dict[str, Any]:
    if not latest.exists():
        raise SystemExit(f"Missing validated frontend payload: {latest}")

    full_bytes = latest.read_bytes()
    payload = json.loads(full_bytes)
    if not isinstance(payload, dict) or not payload.get("universe"):
        raise SystemExit("Validated frontend payload has no universe")

    sidecar = build_sidecar(payload)
    sidecar_bytes = encoded(sidecar)
    by_ticker = sidecar.get("byTicker") or {}
    core = build_core_payload(payload, by_ticker)
    core_bytes = encoded(core)

    universe = payload.get("universe") or []
    if len(core.get("universe") or []) != len(universe):
        raise SystemExit("Core payload changed universe cardinality")
    if sidecar.get("total") != len(universe) or len(by_ticker) != len(universe):
        raise SystemExit("LEGACY sidecar changed universe cardinality")
    if sidecar.get("source", {}).get("generatedAt") != payload.get("generatedAt"):
        raise SystemExit("LEGACY sidecar snapshot does not match canonical payload")
    if core.get("chartShards") != payload.get("chartShards"):
        raise SystemExit("Core payload changed chart-shard mapping")
    if len(core_bytes) >= len(full_bytes):
        raise SystemExit(
            f"Core payload did not shrink: core={len(core_bytes):,} full={len(full_bytes):,}"
        )

    for row in core.get("universe") or []:
        ticker = str(row.get("ticker") or "").upper()
        confirmation = by_ticker.get(ticker) or {}
        if row.get("legacyConfirmationStatus") != confirmation.get("status"):
            raise SystemExit(f"LEGACY confirmation mismatch in core projection: {ticker}")

    manifest_payload = {
        "model": MODEL,
        "generatedAt": payload.get("generatedAt"),
        "universe": len(core.get("universe") or []),
        "coreFile": "core.json",
        "fullFile": "latest.json",
        "legacyConfirmationFile": "shadow/legacy-confirmation.json",
        "coreBytes": len(core_bytes),
        "fullBytes": len(full_bytes),
        "legacyConfirmationBytes": len(sidecar_bytes),
        "coreSha256": sha256(core_bytes),
        "fullSha256": sha256(full_bytes),
        "legacyConfirmationSha256": sha256(sidecar_bytes),
        "legacyConfirmationCounts": sidecar.get("counts") or {},
        "strippedRowKeys": sorted(HEAVY_ROW_KEYS),
    }

    atomic_write(core_path, core_bytes)
    atomic_write(legacy_sidecar_path, sidecar_bytes)
    atomic_write(manifest, encoded(manifest_payload) + b"\n")
    if latest.read_bytes() != full_bytes:
        raise SystemExit("Invariant violation: client projection modified canonical latest.json")

    ratio = len(core_bytes) / max(1, len(full_bytes))
    print(
        f"Frontend client payload: core={len(core_bytes)/1024/1024:.2f} MB, "
        f"canonical={len(full_bytes)/1024/1024:.2f} MB ({ratio:.1%} of canonical); "
        f"LEGACY shadow={len(sidecar_bytes)/1024:.1f} KB counts={sidecar.get('counts')}"
    )
    return manifest_payload


if __name__ == "__main__":
    publish()
