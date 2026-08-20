from copy import deepcopy

from build_legacy_confirmation_sidecar import build_sidecar


def row(ticker: str):
    return {
        "ticker": ticker,
        "originalRunBuySignal": False,
        "originalRunSellSignal": False,
        "originalBuy": False,
        "originalMarketQualifiedBuy": False,
        "originalSell": False,
        "originalEngine": {
            "model": "original-signal-engine-v1",
            "completeSourceCaptureModel": "legacy-complete-source-capture-v1",
            "buy": {"isBuy": False, "marketQualified": False, "emittedByOriginalRun": False},
            "sell": {"isSell": False, "emittedByOriginalRun": False, "reasons": []},
            "minervini": {"passes": False},
            "vcp": {"isVcp": False},
            "breakout": {"is_breakout": False},
        },
    }


def market():
    return {
        "originalSignalGate": {
            "spy": {"phase": 2, "trend": "Bullish"},
            "gate": {"should_generate_buys": True, "should_generate_sells": False},
        }
    }


def test_sidecar_is_compact_and_does_not_mutate_canonical():
    buy = row("BUY")
    buy["originalRunBuySignal"] = True
    buy["originalEngine"]["buy"]["emittedByOriginalRun"] = True
    early = row("EARLY")
    early["originalEngine"]["vcp"]["isVcp"] = True
    canonical = {
        "generatedAt": "2026-08-20T00:00:00Z",
        "market": market(),
        "universe": [buy, early],
    }
    before = deepcopy(canonical)
    sidecar = build_sidecar(canonical)
    assert canonical == before
    assert sidecar["affectsStockScout"] is False
    assert sidecar["counts"] == {"CONFIRMED": 1, "EARLY": 1}
    assert sidecar["byTicker"]["BUY"] == {
        "status": "CONFIRMED",
        "available": True,
        "reasons": ["ORIGINAL_RUN_BUY"],
    }
    assert "evidence" not in sidecar["byTicker"]["EARLY"]


def test_sidecar_rejects_duplicate_tickers():
    candidate = row("AAA")
    try:
        build_sidecar({"market": market(), "universe": [candidate, deepcopy(candidate)]})
    except AssertionError as exc:
        assert "Duplicate ticker" in str(exc)
    else:
        raise AssertionError("duplicate ticker should fail")
