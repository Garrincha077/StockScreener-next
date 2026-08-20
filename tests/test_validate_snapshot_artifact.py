import json
import shutil

import pytest

from prepare_frontend_payloads import publish, shard_number
from validate_snapshot_artifact import SnapshotValidationError, digest, validate_snapshot


def source_payload():
    rows = []
    for ticker in ("AAA", "BBB"):
        rows.append({
            "ticker": ticker,
            "opportunityScore": 80,
            "originalBuyScore": 75,
            "originalEngine": {
                "model": "original-signal-engine-v1",
                "completeSourceCaptureModel": "legacy-complete-source-capture-v1",
                "buy": {"score": 75, "emittedByOriginalRun": False},
                "sell": {"emittedByOriginalRun": False},
                "minervini": {"passes": False},
                "vcp": {"isVcp": False},
                "breakout": {"is_breakout": False},
            },
        })
    return {
        "version": 8,
        "generatedAt": "2026-08-20T21:00:00+00:00",
        "market": {"scanDate": "2026-08-20", "originalSignalGate": {"gate": {}}},
        "layers": {"legacy": {}},
        "chartShardCount": 128,
        "chartShards": {ticker: f"{shard_number(ticker):03d}.json" for ticker in ("AAA", "BBB")},
        "originalEngineModel": "original-signal-engine-v1",
        "legacyCompleteSourceCaptureModel": "legacy-complete-source-capture-v1",
        "universe": rows,
    }


def build_snapshot(tmp_path, chart_tickers=("AAA", "BBB")):
    data = tmp_path / "data"
    data.mkdir()
    payload = source_payload()
    (data / "latest.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    chart_dir = data / "charts"
    chart_dir.mkdir()
    by_shard = {}
    for ticker in chart_tickers:
        by_shard.setdefault(payload["chartShards"][ticker], {})[ticker] = [["2026-08-20", 1, 2, 1, 2, 100, 1]]
    for shard in {f"{index:03d}.json" for index in range(128)}:
        (chart_dir / shard).write_text(json.dumps(by_shard.get(shard, {}), separators=(",", ":")), encoding="utf-8")
    publish(data / "latest.json", data / "core.json", data / "manifest.json", data / "shadow" / "legacy-confirmation.json")
    site = tmp_path / "site"
    shutil.copytree(data, site / "data")
    (site / "data" / "latest.json").unlink()
    metadata = tmp_path / "snapshot-metadata.json"
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    metadata.write_text(json.dumps({
        "canonicalSha256": manifest["provenance"]["source"]["sha256"],
        "manifestSha256": digest((data / "manifest.json").read_bytes()),
        "generatedAt": manifest["generatedAt"],
        "scanSourceCommit": "scan-sha",
        "frontendSourceCommit": "frontend-sha",
    }), encoding="utf-8")
    return data, site, metadata


def test_valid_snapshot_and_pages_artifact_pass(tmp_path):
    data, site, metadata = build_snapshot(tmp_path)
    result = validate_snapshot(
        data,
        site_root=site,
        metadata_path=metadata,
        expected_canonical_sha=json.loads(metadata.read_text())["canonicalSha256"],
        expected_frontend_commit="frontend-sha",
    )
    assert result["chartCoveragePct"] == 100.0


def test_corrupted_snapshot_is_blocked(tmp_path):
    data, _, _ = build_snapshot(tmp_path)
    (data / "core.json").write_text("{}", encoding="utf-8")
    with pytest.raises(SnapshotValidationError, match="core (byte size|SHA-256)"):
        validate_snapshot(data)


def test_chart_coverage_below_98_percent_is_blocked(tmp_path):
    data, _, _ = build_snapshot(tmp_path, chart_tickers=("AAA",))
    with pytest.raises(SnapshotValidationError, match="below required 98.00%"):
        validate_snapshot(data)


def test_changed_canonical_sha_is_blocked(tmp_path):
    data, _, _ = build_snapshot(tmp_path)
    with pytest.raises(SnapshotValidationError, match="changed before deployment"):
        validate_snapshot(data, expected_canonical_sha="0" * 64)
