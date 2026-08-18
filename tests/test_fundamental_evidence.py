from fundamental_evidence import score_fundamentals


def test_strong_growth_and_margins_score_high():
    data = {
        "revenue_yoy_change": 42,
        "eps_yoy_change": 58,
        "revenue_qoq_change": 12,
        "eps_qoq_change": 25,
        "margin_change": 2.2,
        "operating_margin": 22,
        "inventory_qoq_change": 4,
    }
    result = score_fundamentals(data, age_days=2)
    assert result["score"] is not None
    assert result["score"] >= 75
    assert result["label"] == "STRONG"
    assert result["confidencePct"] >= 70
    assert result["affectsOpportunity"] is False


def test_weak_growth_and_contracting_margins_score_low():
    data = {
        "revenue_yoy_change": -18,
        "eps_yoy_change": -35,
        "revenue_qoq_change": -12,
        "eps_qoq_change": -25,
        "margin_change": -3.5,
        "operating_margin": -2,
        "inventory_qoq_change": 12,
    }
    result = score_fundamentals(data, age_days=1)
    assert result["score"] is not None
    assert result["score"] < 40
    assert result["label"] == "WEAK"


def test_missing_metrics_reduce_confidence_not_score_to_zero():
    result = score_fundamentals({"revenue_yoy_change": 35}, age_days=1)
    assert result["score"] is not None
    assert result["score"] > 80
    assert result["coveragePct"] == 25.0
    assert result["confidence"] == "LOW"


def test_staleness_changes_confidence_not_quality_score():
    data = {"revenue_yoy_change": 25, "eps_yoy_change": 30, "margin_change": 1.0}
    fresh = score_fundamentals(data, age_days=2)
    stale = score_fundamentals(data, age_days=45)
    assert fresh["score"] == stale["score"]
    assert fresh["confidencePct"] > stale["confidencePct"]


def test_inventory_growth_faster_than_revenue_is_penalized():
    good = score_fundamentals({
        "revenue_yoy_change": 20,
        "eps_yoy_change": 20,
        "revenue_qoq_change": 15,
        "inventory_qoq_change": 5,
    }, age_days=1)
    bad = score_fundamentals({
        "revenue_yoy_change": 20,
        "eps_yoy_change": 20,
        "revenue_qoq_change": 5,
        "inventory_qoq_change": 25,
    }, age_days=1)
    assert good["groupScores"]["inventory"] > bad["groupScores"]["inventory"]
    assert good["score"] > bad["score"]
