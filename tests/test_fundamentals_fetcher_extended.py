import math

import pandas as pd

from src.data import fundamentals_fetcher as ff


def _frame(rows):
    cols = pd.to_datetime([
        "2025-03-31",
        "2025-06-30",
        "2025-09-30",
        "2025-12-31",
        "2026-03-31",
    ])
    return pd.DataFrame(rows, columns=cols).T.T


class FakeTicker:
    def __init__(self):
        self.quarterly_financials = _frame({
            "Total Revenue": [100, 110, 120, 130, 150],
            "Diluted EPS": [1.0, 1.1, 1.2, 1.3, 1.5],
            "Gross Profit": [40, 45, 50, 55, 66],
            "Operating Income": [10, 11, 12, 13, 18],
        })
        self.quarterly_balance_sheet = _frame({
            "Inventory": [20, 21, 22, 22, 21],
            "Cash Cash Equivalents And Short Term Investments": [30, 32, 35, 38, 40],
            "Total Debt": [50, 49, 47, 45, 42],
            "Ordinary Shares Number": [100, 100, 101, 101, 102],
        })
        self.quarterly_cashflow = _frame({
            "Operating Cash Flow": [15, 17, 18, 20, 25],
            "Capital Expenditure": [-4, -4, -5, -5, -6],
        })


def test_extended_fundamentals_are_additive_and_legacy_metrics_stay_stable(monkeypatch):
    monkeypatch.setattr(ff.yf, "Ticker", lambda ticker: FakeTicker())
    data = ff.fetch_quarterly_financials("TEST")

    # Original upstream formulas remain unchanged.
    assert data["revenue_qoq_change"] == (150 - 130) / 130 * 100
    assert data["revenue_yoy_change"] == 50.0
    assert data["eps_qoq_change"] == (1.5 - 1.3) / 1.3 * 100
    assert data["eps_yoy_change"] == 50.0
    assert data["gross_margin"] == 44.0
    assert data["margin_change"] == round(44.0 - (55 / 130 * 100), 2)
    assert data["operating_margin"] == 12.0
    assert data["inventory_qoq_change"] == round((21 - 22) / 22 * 100, 2)
    assert data["inventory_to_sales_ratio"] == round(21 / 150, 3)

    # New fields use statement data already fetched by the upstream code path.
    assert data["fundamental_data_source"] == "yfinance"
    assert data["operating_cash_flow_yoy_change"] == (25 - 15) / 15 * 100
    assert data["free_cash_flow_yoy_change"] == (19 - 11) / 11 * 100
    assert data["free_cash_flow_margin"] == 19 / 150 * 100
    assert data["total_debt_latest"] == 42
    assert data["cash_latest"] == 40
    assert data["net_debt_latest"] == 2
    assert data["total_debt_yoy_change"] == (42 - 50) / 50 * 100
    assert data["share_dilution_yoy_change"] == 2.0
    assert len(data["fundamental_periods"]) == 5


def test_missing_extended_rows_do_not_break_original_fetch(monkeypatch):
    fake = FakeTicker()
    fake.quarterly_cashflow = pd.DataFrame()
    fake.quarterly_balance_sheet = _frame({"Inventory": [20, 21, 22, 22, 21]})
    monkeypatch.setattr(ff.yf, "Ticker", lambda ticker: fake)

    data = ff.fetch_quarterly_financials("TEST")

    assert data["revenue_yoy_change"] == 50.0
    assert data["inventory_qoq_change"] is not None
    assert data["fundamental_data_source"] == "yfinance"
    assert "free_cash_flow_yoy_change" not in data
    assert "total_debt_latest" not in data
    assert "share_dilution_yoy_change" not in data


def test_direct_free_cash_flow_is_preferred_over_derived(monkeypatch):
    fake = FakeTicker()
    fake.quarterly_cashflow.loc["Free Cash Flow"] = [12, 14, 15, 17, 22]
    monkeypatch.setattr(ff.yf, "Ticker", lambda ticker: fake)

    data = ff.fetch_quarterly_financials("TEST")
    assert data["free_cash_flow_yoy_change"] == (22 - 12) / 12 * 100
    assert math.isclose(data["free_cash_flow_margin"], 22 / 150 * 100)
