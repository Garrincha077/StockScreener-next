from copy import deepcopy

from audit_next_core_invariance import compare_payloads
from compute_legacy_confirmation import attach_legacy_confirmation, compute_legacy_confirmation


def test_missing_legacy_is_explicitly_unavailable():
    result = compute_legacy_confirmation(None)
    assert result["status"] == "UNAVAILABLE"
    assert result["available"] is False
    assert result["provenance"] == "unavailable"
    assert result["source"] is None


def test_observed_legacy_fields_are_normalized_without_reconstruction():
    result = compute_legacy_confirmation(
        {
            "confirmationStatus": "confirmed",
            "score": 87,
            "positionPct": 4.2,
            "daysFromLow": 18,
            "mature": False,
            "pathReason": "observed legacy path",
        }
    )
    assert result == {
        "status": "CONFIRMED",
        "available": True,
        "version": "shadow-v1",
        "provenance": "observed",
        "source": "frozen-legacy",
        "score": 87,
        "positionPct": 4.2,
        "daysFromLow": 18,
        "mature": False,
        "pathReason": "observed legacy path",
    }


def test_unknown_status_is_not_invented():
    result = compute_legacy_confirmation({"status": "BUY", "score": 91})
    assert result["status"] == "UNAVAILABLE"
    assert result["available"] is False
    assert result["provenance"] == "observed"
    assert result["score"] == 91


def test_attach_is_append_only_and_does_not_mutate_candidate():
    candidate = {
        "ticker": "AAA",
        "opportunityScore": 82.0,
        "stage": 2,
        "nested": {"keep": [1, 2, 3]},
    }
    before = deepcopy(candidate)
    enriched = attach_legacy_confirmation(candidate, {"status": "EARLY"})

    assert candidate == before
    assert {k: v for k, v in enriched.items() if k != "legacyConfirmation"} == before
    assert enriched["legacyConfirmation"]["status"] == "EARLY"


def test_shadow_projection_passes_existing_core_invariance_contract():
    before = {
        "chartShards": {"AAA": "charts/A.json"},
        "universe": [
            {
                "ticker": "AAA",
                "opportunityScore": 82.0,
                "emergingLeaderScore": 78.0,
                "maClusterScore": 73.0,
                "groupRank": 65.0,
                "fundamentalEvidenceScore": 61.0,
                "stage": 2,
                "rsRank": 91.0,
                "leadershipScore": 82.0,
            }
        ],
    }
    after = deepcopy(before)
    after["universe"][0] = attach_legacy_confirmation(
        after["universe"][0], {"status": "CONFIRMED", "score": 87}
    )
    assert compare_payloads(before, after) == []
