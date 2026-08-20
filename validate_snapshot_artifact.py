#!/usr/bin/env python3
"""Fail-closed validation for StockScout snapshot and Pages artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


class SnapshotValidationError(RuntimeError):
    pass


MAX_CORE_BYTES = 8_000_000


def encoded(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SnapshotValidationError(f"Invalid JSON {path}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SnapshotValidationError(message)


def asset_path(data_root: Path, relative: Any) -> Path:
    root = data_root.resolve()
    path = (root / str(relative or "")).resolve()
    require(path == root or root in path.parents, f"Asset path escapes data root: {relative}")
    return path


def verify_file(data_root: Path, descriptor: dict[str, Any], label: str) -> Path:
    path = asset_path(data_root, descriptor.get("path"))
    require(path.is_file(), f"Missing {label}: {path}")
    raw = path.read_bytes()
    require(len(raw) == descriptor.get("bytes"), f"{label} byte size does not match manifest")
    require(digest(raw) == descriptor.get("sha256"), f"{label} SHA-256 does not match manifest")
    return path


def aggregate(files: list[Path], data_root: Path) -> dict[str, Any]:
    records = [
        {"path": path.relative_to(data_root).as_posix(), "sha256": digest(path.read_bytes())}
        for path in sorted(files)
    ]
    return {
        "sha256": digest(encoded(records)),
        "bytes": sum(path.stat().st_size for path in files),
    }


def verify_aggregate(data_root: Path, descriptor: dict[str, Any], label: str) -> list[Path]:
    directory = asset_path(data_root, descriptor.get("path"))
    require(directory.is_dir(), f"Missing {label} directory: {directory}")
    files = sorted(directory.glob("*.json"))
    require(len(files) == int(descriptor.get("shardCount") or 0), f"{label} shard count does not match manifest")
    actual = aggregate(files, data_root)
    require(actual["bytes"] == descriptor.get("bytes"), f"{label} byte size does not match manifest")
    require(actual["sha256"] == descriptor.get("sha256"), f"{label} SHA-256 does not match manifest")
    return files


def validate_snapshot(
    data_root: Path,
    *,
    site_root: Path | None = None,
    metadata_path: Path | None = None,
    min_chart_coverage: float = 98.0,
    expected_canonical_sha: str | None = None,
    expected_frontend_commit: str | None = None,
) -> dict[str, Any]:
    latest = data_root / "latest.json"
    manifest_path = data_root / "manifest.json"
    require(latest.is_file(), f"Missing canonical recovery snapshot: {latest}")
    require(manifest_path.is_file(), f"Missing manifest: {manifest_path}")
    canonical_bytes = latest.read_bytes()
    canonical_sha = digest(canonical_bytes)
    canonical = read_json(latest)
    manifest = read_json(manifest_path)
    require(manifest.get("manifestVersion") == 2, "Snapshot requires manifest v2")
    source = (manifest.get("provenance") or {}).get("source") or {}
    publication = (manifest.get("provenance") or {}).get("publication") or {}
    require(source.get("sha256") == canonical_sha, "Canonical SHA-256 does not match manifest")
    require(source.get("bytes") == len(canonical_bytes), "Canonical byte size does not match manifest")
    require(publication.get("sourceSha256") == canonical_sha, "Publication provenance does not match canonical SHA-256")
    if expected_canonical_sha:
        require(canonical_sha == expected_canonical_sha, "Canonical SHA-256 changed before deployment")

    assets = manifest.get("assets") or {}
    core_path = verify_file(data_root, assets.get("core") or {}, "core")
    require(core_path.stat().st_size <= MAX_CORE_BYTES, f"Core exceeds {MAX_CORE_BYTES:,} byte publication budget")
    index_path = verify_file(data_root, assets.get("legacyIndex") or {}, "LEGACY index")
    confirmation_path = verify_file(data_root, assets.get("legacyConfirmation") or {}, "LEGACY confirmation")
    detail_files = verify_aggregate(data_root, assets.get("legacyDetails") or {}, "LEGACY details")
    chart_files = verify_aggregate(data_root, assets.get("charts") or {}, "charts")

    core = read_json(core_path)
    index = read_json(index_path)
    canonical_tickers = [str(row.get("ticker") or "").upper() for row in canonical.get("universe") or []]
    core_tickers = [str(row.get("ticker") or "").upper() for row in core.get("universe") or []]
    index_tickers = [str(row.get("ticker") or "").upper() for row in index.get("universe") or []]
    require(len(canonical_tickers) == len(set(canonical_tickers)), "Canonical snapshot contains duplicate tickers")
    require(core_tickers == canonical_tickers, "Core ticker projection is incomplete or reordered")
    require(index_tickers == canonical_tickers, "LEGACY index projection is incomplete or reordered")
    require(manifest.get("universe") == len(canonical_tickers), "Manifest universe count is incorrect")
    require(core.get("generatedAt") == manifest.get("generatedAt") == canonical.get("generatedAt"), "Snapshot timestamps are not aligned")
    for key in ("core", "legacyIndex", "legacyDetails", "legacyConfirmation"):
        descriptor = assets.get(key) or {}
        require(descriptor.get("coverage") == len(canonical_tickers), f"{key} coverage count is incomplete")
        require(float(descriptor.get("coveragePct") or 0) == 100.0, f"{key} coverage percentage is incomplete")

    confirmation = read_json(confirmation_path)
    confirmation_tickers = {str(ticker).upper() for ticker in (confirmation.get("byTicker") or {})}
    require(confirmation.get("total") == len(canonical_tickers), "LEGACY confirmation total is incorrect")
    require(confirmation_tickers == set(canonical_tickers), "LEGACY confirmation ticker coverage is incomplete")

    detail_occurrences: dict[str, int] = {}
    for path in detail_files:
        shard = read_json(path)
        require(isinstance(shard, dict), f"LEGACY detail shard is not an object: {path}")
        for ticker in shard:
            normalized = str(ticker).upper()
            detail_occurrences[normalized] = detail_occurrences.get(normalized, 0) + 1
    require(set(detail_occurrences) == set(canonical_tickers), "LEGACY detail ticker coverage is incomplete")
    require(all(count == 1 for count in detail_occurrences.values()), "A ticker occurs more than once in LEGACY details")

    chart_occurrences: dict[str, list[str]] = {}
    for path in chart_files:
        shard = read_json(path)
        require(isinstance(shard, dict), f"Chart shard is not an object: {path}")
        for ticker, bars in shard.items():
            normalized = str(ticker).upper()
            if isinstance(bars, list) and bars:
                chart_occurrences.setdefault(normalized, []).append(path.name)
    require(all(len(paths) == 1 for paths in chart_occurrences.values()), "A ticker occurs more than once in chart shards")
    mapping = {str(k).upper(): str(v) for k, v in (core.get("chartShards") or {}).items()}
    canonical_set = set(canonical_tickers)
    for ticker, paths in chart_occurrences.items():
        if ticker in canonical_set:
            require(mapping.get(ticker) == paths[0], f"Chart mapping mismatch for {ticker}")
    covered = len(canonical_set & set(chart_occurrences))
    coverage_pct = round(100 * covered / max(1, len(canonical_tickers)), 2)
    chart_asset = assets.get("charts") or {}
    require(chart_asset.get("coverage") == covered, "Chart coverage count does not match manifest")
    require(float(chart_asset.get("coveragePct") or 0) == coverage_pct, "Chart coverage percentage does not match manifest")
    require(coverage_pct >= min_chart_coverage, f"Chart coverage {coverage_pct:.2f}% is below required {min_chart_coverage:.2f}%")

    manifest_sha = digest(manifest_path.read_bytes())
    if metadata_path:
        metadata = read_json(metadata_path)
        require(metadata.get("canonicalSha256") == canonical_sha, "Snapshot metadata canonical SHA-256 mismatch")
        require(metadata.get("manifestSha256") == manifest_sha, "Snapshot metadata manifest SHA-256 mismatch")
        require(metadata.get("generatedAt") == manifest.get("generatedAt"), "Snapshot metadata timestamp mismatch")
        if expected_frontend_commit:
            require(metadata.get("frontendSourceCommit") == expected_frontend_commit, "Frontend source commit changed before deployment")

    if site_root:
        require(not (site_root / "data" / "latest.json").exists(), "Pages artifact contains canonical latest.json")
        site_manifest = site_root / "data" / "manifest.json"
        require(site_manifest.is_file(), "Pages artifact has no manifest")
        require(site_manifest.read_bytes() == manifest_path.read_bytes(), "Pages manifest differs from validated snapshot")
        for key in ("core", "legacyIndex", "legacyConfirmation"):
            descriptor = assets.get(key) or {}
            verify_file(site_root / "data", descriptor, f"Pages {key}")
        verify_aggregate(site_root / "data", assets.get("legacyDetails") or {}, "Pages LEGACY details")
        verify_aggregate(site_root / "data", assets.get("charts") or {}, "Pages charts")

    return {
        "canonicalSha256": canonical_sha,
        "manifestSha256": manifest_sha,
        "generatedAt": manifest.get("generatedAt"),
        "chartCoveragePct": coverage_pct,
        "universe": len(canonical_tickers),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--site-root", type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--min-chart-coverage", type=float, default=98.0)
    parser.add_argument("--expected-canonical-sha")
    parser.add_argument("--expected-frontend-commit")
    args = parser.parse_args()
    try:
        result = validate_snapshot(
            args.data_root,
            site_root=args.site_root,
            metadata_path=args.metadata,
            min_chart_coverage=args.min_chart_coverage,
            expected_canonical_sha=args.expected_canonical_sha,
            expected_frontend_commit=args.expected_frontend_commit,
        )
    except SnapshotValidationError as exc:
        raise SystemExit(f"SNAPSHOT VALIDATION FAILED: {exc}") from exc
    print(
        "SNAPSHOT VALIDATION PASS: "
        f"universe={result['universe']}; charts={result['chartCoveragePct']:.2f}%; "
        f"canonical={result['canonicalSha256']}"
    )


if __name__ == "__main__":
    main()
