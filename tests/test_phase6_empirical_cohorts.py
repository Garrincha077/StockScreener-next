from copy import deepcopy

from phase6_empirical_cohorts import (
    COHORT_CONFIRMED,
    COHORT_EARLY,
    COHORT_LEGACY_BUY_LOW,
    COHORT_RISK,
    append_unique_observations,
    build_snapshot_observations,
    classify_row,
    is_low_stockscout,
    is_strong_stockscout,
)


def row(**overrides):
    base = {
        "ticker": "AAA",
        "price": 42.5,
        "opportunityScore": 84.0,
        "opportunityRank": 94,
        "opportunityTier": "READY",
        "extended": False,
        "legacyConfirmationStatus": "NEUTRAL",
        "originalRunBuySignal": False,
        "originalRunSellSignal": False,
        "stage": 2,
        "rsRank": 91,
        "breakoutPct": -1.2,
        "originalBreakoutVolumeConfirmed": False,
    }
    base.update(overrides)
    return base


def test_strong_stockscout_reuses_phase5_contract():
    assert is_strong_stockscout(row()) is True
    assert is_strong_stockscout(row(opportunityScore=79.9)) is False
    assert is_strong_stockscout(row(opportunityRank=89)) is False
    assert is_strong_stockscout(row(extended=True)) is False


def test_low_stockscout_is_existing_pass_tier_only():
    assert is_low_stockscout(row(opportunityTier="PASS", opportunityScore=54.9)) is True
    assert is_low_stockscout(row(opportunityTier="EARLY", opportunityScore=55)) is False


def test_confirmed_roadmap_cohort():
    assert classify_row(row(legacyConfirmationStatus="CONFIRMED")) == (COHORT_CONFIRMED,)


def test_early_roadmap_cohort_does_not_absorb_neutral_or_conflict():
    assert classify_row(row(legacyConfirmationStatus="EARLY")) == (COHORT_EARLY,)
    assert classify_row(row(legacyConfirmationStatus="NEUTRAL")) == ()
    assert classify_row(row(legacyConfirmationStatus="CONFLICT")) == ()


def test_legacy_buy_low_stockscout_uses_captured_buy_and_pass_tier():
    candidate = row(
        opportunityScore=50,
        opportunityRank=30,
        opportunityTier="PASS",
        originalRunBuySignal=True,
        legacyConfirmationStatus="CONFIRMED",
    )
    assert classify_row(candidate) == (COHORT_LEGACY_BUY_LOW,)


def test_raw_legacy_buy_without_emitted_original_run_is_not_cohort_three():
    candidate = row(
        opportunityScore=50,
        opportunityRank=30,
        opportunityTier="PASS",
        originalRunBuySignal=False,
        originalBuy=True,
    )
    assert classify_row(candidate) == ()


def test_risk_roadmap_cohort_requires_strong_stockscout():
    assert classify_row(row(legacyConfirmationStatus="RISK")) == (COHORT_RISK,)
    assert classify_row(
        row(legacyConfirmationStatus="RISK", opportunityScore=74, opportunityRank=95)
    ) == ()


def test_snapshot_projection_is_deterministic_and_does_not_mutate_payload():
    payload = {
        "generatedAt": "2026-08-21T00:00:00+00:00",
        "universe": [
            row(ticker="CCC", legacyConfirmationStatus="RISK"),
            row(ticker="AAA", legacyConfirmationStatus="CONFIRMED"),
            row(ticker="BBB", legacyConfirmationStatus="EARLY"),
            row(
                ticker="DDD",
                opportunityScore=49,
                opportunityRank=20,
                opportunityTier="PASS",
                originalRunBuySignal=True,
            ),
        ],
    }
    before = deepcopy(payload)
    first = build_snapshot_observations(payload)
    second = build_snapshot_observations(payload)
    assert payload == before
    assert first == second
    assert first["cohortCounts"] == {
        COHORT_CONFIRMED: 1,
        COHORT_EARLY: 1,
        COHORT_LEGACY_BUY_LOW: 1,
        COHORT_RISK: 1,
    }
    assert [(item["cohort"], item["ticker"]) for item in first["observations"]] == [
        (COHORT_CONFIRMED, "AAA"),
        (COHORT_EARLY, "BBB"),
        (COHORT_LEGACY_BUY_LOW, "DDD"),
        (COHORT_RISK, "CCC"),
    ]
    assert first["definitions"]["legacyConfirmationAffectsStockScout"] is False


def test_missing_or_invalid_rows_do_not_create_observations():
    projection = build_snapshot_observations(
        {"generatedAt": "2026-08-21T00:00:00+00:00", "universe": [None, {}, row(ticker="")]}
    )
    assert projection["observations"] == []
    assert sum(projection["cohortCounts"].values()) == 0


def test_append_unique_observations_is_idempotent():
    item = {"generatedAt": "g1", "ticker": "AAA", "cohort": COHORT_CONFIRMED, "entryPrice": 10}
    updated = {**item, "entryPrice": 11}
    other = {"generatedAt": "g2", "ticker": "AAA", "cohort": COHORT_CONFIRMED, "entryPrice": 12}
    merged = append_unique_observations([item], [updated, other, {"ticker": "BAD"}])
    assert len(merged) == 2
    assert merged[0]["entryPrice"] == 11
    assert merged[1]["entryPrice"] == 12
