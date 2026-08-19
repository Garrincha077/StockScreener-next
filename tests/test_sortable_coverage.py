from __future__ import annotations

import json
from pathlib import Path

import audit_sortable_coverage as audit


def row(ticker: str, complete: bool = True) -> dict:
    values = {field: 1.0 for field in audit.CRITICAL_FIELDS}
    values.update({"ticker": ticker, "ema10d20dState": "BULL", "sma10w20wState": "BULL"})
    if not complete:
        values["rsRank"] = None
    return values


def payload(rows: list[dict]) -> dict:
    return {
        "universe": rows,
        "market": {
            "maCrossCoverage": {
                "daily": {"eligible": len(rows), "complete": len(rows), "coveragePct": 100.0},
                "weekly": {"eligible": len(rows), "complete": len(rows), "coveragePct": 100.0},
            }
        },
    }


def test_valid_does_not_treat_null_or_nan_as_data():
    assert not audit.valid(None)
    assert not audit.valid(float("nan"))
    assert not audit.valid("")
    assert audit.valid(0.0)
    assert audit.valid(False)


def test_build_report_passes_complete_core(monkeypatch):
    monkeypatch.setattr(audit, "frontend_fields", lambda: [{"id": "rsRank", "label": "RS", "kind": "number"}])
    report = audit.build_report(payload([row("AAA"), row("BBB")]))
    assert report["status"] == "PASS"
    assert report["allCriticalCompletePct"] == 100.0
    assert report["critical"]["rsRank"]["coveragePct"] == 100.0


def test_build_report_fails_real_missing_core(monkeypatch):
    monkeypatch.setattr(audit, "frontend_fields", lambda: [{"id": "rsRank", "label": "RS", "kind": "number"}])
    rows = [row(f"T{i:03d}") for i in range(99)] + [row("BAD", complete=False)]
    report = audit.build_report(payload(rows))
    assert report["status"] == "FAIL"
    assert any("rsRank" in failure for failure in report["failures"])
    assert report["critical"]["rsRank"]["sampleMissing"] == ["BAD"]


def test_audit_embeds_report_without_zero_coercion(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(audit, "frontend_fields", lambda: [{"id": "rsRank", "label": "RS", "kind": "number"}])
    dataset = tmp_path / "latest.json"
    report_path = tmp_path / "quality.json"
    dataset.write_text(json.dumps(payload([row("AAA")])), encoding="utf-8")
    report = audit.audit(dataset, report_path, fail_on_gate=True)
    saved = json.loads(dataset.read_text(encoding="utf-8"))
    assert report["status"] == "PASS"
    assert saved["market"]["dataQuality"]["model"] == audit.MODEL
    assert report_path.exists()
