import json

from prepare_frontend_payloads import build_core_payload, publish


def sample_payload():
    return {
        "version": 8,
        "generatedAt": "2026-08-19T00:00:00+00:00",
        "market": {"regime": "UP"},
        "layers": {"legacy": {"label": "LEGACY"}, "sharedEvidencePath": "richData"},
        "chartShards": {"AAA": "001.json", "BBB": "002.json"},
        "universe": [
            {
                "ticker": "AAA",
                "opportunityScore": 81,
                "originalBuyScore": 92,
                "originalEngine": {"buy": {"score": 92}, "blob": "x" * 200},
                "richData": {"fundamentals": {"blob": "y" * 200}},
                "stockscout": {"blob": "z" * 100},
            },
            {
                "ticker": "BBB",
                "opportunityScore": 70,
                "originalEngine": {"blob": "x" * 200},
                "richData": {"blob": "y" * 200},
                "stockscout": {"blob": "z" * 100},
            },
        ],
    }


def test_core_projection_strips_only_heavy_nested_row_payloads():
    payload = sample_payload()
    core = build_core_payload(payload)

    assert [row["ticker"] for row in core["universe"]] == ["AAA", "BBB"]
    assert core["universe"][0]["opportunityScore"] == 81
    assert core["universe"][0]["originalBuyScore"] == 92
    assert "originalEngine" not in core["universe"][0]
    assert "richData" not in core["universe"][0]
    assert "stockscout" not in core["universe"][0]
    assert core["chartShards"] == payload["chartShards"]
    assert core["layers"]["legacy"]["lazyFile"] == "full.json"


def test_publish_preserves_full_snapshot_and_writes_smaller_core(tmp_path):
    latest = tmp_path / "latest.json"
    full = tmp_path / "full.json"
    manifest = tmp_path / "manifest.json"
    payload = sample_payload()
    original = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    latest.write_bytes(original)

    meta = publish(latest, full, manifest)
    core = json.loads(latest.read_text())

    assert full.read_bytes() == original
    assert meta["universe"] == 2
    assert meta["coreBytes"] < meta["fullBytes"]
    assert core["fullDataFile"] == "full.json"
    assert len(core["universe"]) == len(payload["universe"])
    assert json.loads(manifest.read_text())["fullFile"] == "full.json"
