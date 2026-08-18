from emerging_leader import score_row
from lateral_base import score_row as score_lateral_base


def base_row(**overrides):
    row = {
        "ticker": "TEST",
        "stage": 2,
        "stage2AgeWeeks": 4,
        "rsRank": 75,
        "rsAcceleration": 0.55,
        "rsFromHigh": -3.0,
        "volumeRatio": 1.2,
        "distance10w": 4.0,
        "distance30w": 8.0,
        "breakoutPct": -2.0,
        "baseWeeks": 36,
        "baseDepthPct": 20.0,
        "tightRange20": 8.0,
        "tightRange60": 20.0,
        "atrCompression": 55.0,
        "contraction": 60.0,
        "vcpScore": 65.0,
        "volumeDryUp": 0.82,
        "return5y": 10.0,
        "return3y": 5.0,
        "return2y": 5.0,
        "prior9mReturn": 10.0,
        "extended": False,
    }
    row.update(overrides)
    return row


def score_full(row):
    row.update(score_lateral_base(row))
    row.update(score_row(row))
    return row


def test_real_reset_plus_rs_awakening_scores_high_and_is_candidate():
    row = score_full(base_row())
    assert row["emergingLeaderScore"] >= 68
    assert row["emergingEvidenceCount"] == 5
    assert row["emergingLeaderCandidate"] is True
    assert row["aPlusEmergingSetup"] is True
    assert row["opportunityScore"] == row["emergingLeaderScore"]
    assert row["confluence"] == row["emergingEvidenceCount"]


def test_explosive_rs_without_a_base_is_hard_capped():
    row = score_full(base_row(
        stage=1,
        baseWeeks=1,
        baseDepthPct=70,
        tightRange20=25,
        tightRange60=45,
        distance10w=-24,
        distance30w=12,
        breakoutPct=-60,
        rsRank=95,
        rsAcceleration=3.0,
        volumeRatio=3.5,
        return5y=300,
        return3y=200,
        return2y=150,
        prior9mReturn=140,
    ))
    assert row["emergingLeaderScore"] <= 50
    assert row["emergingLeaderCandidate"] is False
    assert "Base too young" in row["emergingReasons"]


def test_extended_setup_cannot_rank_as_emerging_leader():
    row = score_full(base_row(distance10w=22, distance30w=28, extended=True))
    assert row["emergingLeaderScore"] <= 35
    assert row["emergingLeaderCandidate"] is False
    assert row["aPlusEmergingSetup"] is False


def test_negative_rs_acceleration_cannot_be_candidate():
    row = score_full(base_row(rsAcceleration=-0.4))
    assert row["emergingLeaderScore"] <= 55
    assert row["emergingLeaderCandidate"] is False
    assert row["emergingEvidenceFlags"]["RS waking"] is False


def test_mature_stage2_loses_fresh_stage_evidence():
    row = score_full(base_row(stage2AgeWeeks=30))
    assert row["stageFreshnessScore"] == 15.0
    assert row["emergingEvidenceFlags"]["Fresh stage"] is False
    assert row["aPlusEmergingSetup"] is False
