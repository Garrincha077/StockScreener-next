"""Enhanced fundamentals fetcher for quarterly financial data.

The upstream StockScout implementation uses yfinance quarterly statements. This
fork keeps that source and every legacy metric, while exposing additional
cash-flow/balance-sheet evidence already available from the same Ticker object.
New fields are additive and do not alter legacy screening/scoring behavior.
"""

import logging
import math
from datetime import datetime
from typing import Dict

import pandas as pd
import yfinance as yf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def _finite(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except Exception:
        return None


def _series(frame: pd.DataFrame, *names: str) -> pd.Series | None:
    """Return the first matching quarterly statement row, sorted oldest->newest."""
    if frame is None or frame.empty:
        return None
    for name in names:
        if name in frame.index:
            return pd.to_numeric(frame.loc[name], errors="coerce").sort_index()
    return None


def _pct_change(values: pd.Series | None, periods: int = 1, abs_denominator: bool = False):
    if values is None:
        return None
    clean = values.dropna()
    if len(clean) <= periods:
        return None
    now = _finite(clean.iloc[-1])
    old = _finite(clean.iloc[-1 - periods])
    if now is None or old in (None, 0):
        return None
    denominator = abs(old) if abs_denominator else old
    return (now - old) / denominator * 100.0


def _latest(values: pd.Series | None):
    if values is None:
        return None
    clean = values.dropna()
    return _finite(clean.iloc[-1]) if len(clean) else None


def _add_extended_metrics(
    result: Dict[str, object],
    quarterly_income: pd.DataFrame,
    quarterly_balance: pd.DataFrame,
    quarterly_cashflow: pd.DataFrame,
) -> None:
    """Add unused upstream yfinance evidence without changing legacy fields."""
    result["fundamental_data_source"] = "yfinance"

    revenue = _series(quarterly_income, "Total Revenue")
    ocf = _series(
        quarterly_cashflow,
        "Operating Cash Flow",
        "Total Cash From Operating Activities",
    )
    capex = _series(
        quarterly_cashflow,
        "Capital Expenditure",
        "Capital Expenditures",
    )
    direct_fcf = _series(quarterly_cashflow, "Free Cash Flow")

    if ocf is not None:
        result["quarterly_operating_cash_flow"] = ocf.to_dict()
        result["operating_cash_flow_qoq_change"] = _pct_change(ocf, 1, abs_denominator=True)
        result["operating_cash_flow_yoy_change"] = _pct_change(ocf, 4, abs_denominator=True)

    if capex is not None:
        result["quarterly_capex"] = capex.to_dict()

    fcf = direct_fcf
    if fcf is None and ocf is not None and capex is not None:
        aligned = pd.concat([ocf.rename("ocf"), capex.rename("capex")], axis=1).dropna()
        if not aligned.empty:
            # Yahoo generally reports capex as a negative cash-flow item.
            fcf = aligned["ocf"] + aligned["capex"]
    if fcf is not None:
        result["quarterly_free_cash_flow"] = fcf.to_dict()
        result["free_cash_flow_qoq_change"] = _pct_change(fcf, 1, abs_denominator=True)
        result["free_cash_flow_yoy_change"] = _pct_change(fcf, 4, abs_denominator=True)
        latest_fcf = _latest(fcf)
        latest_rev = _latest(revenue)
        result["free_cash_flow_margin"] = (
            latest_fcf / latest_rev * 100.0
            if latest_fcf is not None and latest_rev not in (None, 0)
            else None
        )

    cash = _series(
        quarterly_balance,
        "Cash Cash Equivalents And Short Term Investments",
        "Cash And Cash Equivalents",
        "Cash",
    )
    debt = _series(
        quarterly_balance,
        "Total Debt",
        "Long Term Debt And Capital Lease Obligation",
        "Long Term Debt",
    )
    shares = _series(
        quarterly_balance,
        "Ordinary Shares Number",
        "Share Issued",
    )

    latest_cash = _latest(cash)
    latest_debt = _latest(debt)
    if cash is not None:
        result["quarterly_cash"] = cash.to_dict()
        result["cash_latest"] = latest_cash
    if debt is not None:
        result["quarterly_total_debt"] = debt.to_dict()
        result["total_debt_latest"] = latest_debt
        result["total_debt_qoq_change"] = _pct_change(debt, 1, abs_denominator=True)
        result["total_debt_yoy_change"] = _pct_change(debt, 4, abs_denominator=True)
    if latest_cash is not None or latest_debt is not None:
        result["net_debt_latest"] = (latest_debt or 0.0) - (latest_cash or 0.0)

    if shares is not None:
        result["quarterly_shares_outstanding"] = shares.to_dict()
        result["shares_outstanding_latest"] = _latest(shares)
        result["share_dilution_yoy_change"] = _pct_change(shares, 4, abs_denominator=True)

    periods = set()
    for frame in (quarterly_income, quarterly_balance, quarterly_cashflow):
        if frame is not None and not frame.empty:
            for value in frame.columns:
                try:
                    periods.add(pd.Timestamp(value).date().isoformat())
                except Exception:
                    periods.add(str(value))
    result["fundamental_periods"] = sorted(periods)


def fetch_quarterly_financials(ticker: str) -> Dict[str, object]:
    """Fetch quarterly financial data using the original yfinance source."""
    try:
        stock = yf.Ticker(ticker)
        quarterly_income = stock.quarterly_financials
        quarterly_balance = stock.quarterly_balance_sheet
        quarterly_cashflow = stock.quarterly_cashflow

        if quarterly_income.empty:
            logger.warning("No quarterly income data for %s", ticker)
            return {}

        result: Dict[str, object] = {
            "ticker": ticker,
            "fetch_date": datetime.now().isoformat(),
        }

        # Legacy upstream metrics: intentionally preserved.
        if "Total Revenue" in quarterly_income.index:
            revenues = quarterly_income.loc["Total Revenue"].sort_index()
            result["quarterly_revenue"] = revenues.to_dict()
            if len(revenues) >= 2:
                latest_rev = revenues.iloc[-1]
                prev_rev = revenues.iloc[-2]
                if not math.isnan(latest_rev) and not math.isnan(prev_rev) and prev_rev != 0 and latest_rev != 0:
                    result["revenue_qoq_change"] = ((latest_rev - prev_rev) / prev_rev * 100)
                else:
                    result["revenue_qoq_change"] = None
            if len(revenues) >= 5:
                latest_rev = revenues.iloc[-1]
                yoy_rev = revenues.iloc[-5]
                if not math.isnan(latest_rev) and not math.isnan(yoy_rev) and yoy_rev != 0 and latest_rev != 0:
                    result["revenue_yoy_change"] = ((latest_rev - yoy_rev) / yoy_rev * 100)
                else:
                    result["revenue_yoy_change"] = None

        eps_key = None
        if "Diluted EPS" in quarterly_income.index:
            eps_key = "Diluted EPS"
        elif "Basic EPS" in quarterly_income.index:
            eps_key = "Basic EPS"
        if eps_key:
            eps_values = quarterly_income.loc[eps_key].sort_index()
            result["quarterly_eps"] = eps_values.to_dict()
            if len(eps_values) >= 2:
                latest_eps = eps_values.iloc[-1]
                prev_eps = eps_values.iloc[-2]
                if not math.isnan(latest_eps) and not math.isnan(prev_eps) and prev_eps != 0 and latest_eps != 0:
                    result["eps_qoq_change"] = ((latest_eps - prev_eps) / abs(prev_eps) * 100)
                else:
                    result["eps_qoq_change"] = None
            if len(eps_values) >= 5:
                latest_eps = eps_values.iloc[-1]
                yoy_eps = eps_values.iloc[-5]
                if not math.isnan(latest_eps) and not math.isnan(yoy_eps) and yoy_eps != 0:
                    result["eps_yoy_change"] = ((latest_eps - yoy_eps) / abs(yoy_eps) * 100)
                else:
                    result["eps_yoy_change"] = None

        if "Gross Profit" in quarterly_income.index and "Total Revenue" in quarterly_income.index:
            gross_profit = quarterly_income.loc["Gross Profit"].sort_index()
            revenue = quarterly_income.loc["Total Revenue"].sort_index()
            if len(gross_profit) > 0 and len(revenue) > 0:
                latest_margin = (gross_profit.iloc[-1] / revenue.iloc[-1] * 100) if revenue.iloc[-1] != 0 else 0
                result["gross_margin"] = round(latest_margin, 2)
                if len(gross_profit) >= 2:
                    prev_margin = (gross_profit.iloc[-2] / revenue.iloc[-2] * 100) if revenue.iloc[-2] != 0 else 0
                    result["margin_change"] = round(latest_margin - prev_margin, 2)

        if "Operating Income" in quarterly_income.index and "Total Revenue" in quarterly_income.index:
            operating_income = quarterly_income.loc["Operating Income"].sort_index()
            revenue = quarterly_income.loc["Total Revenue"].sort_index()
            if len(operating_income) > 0 and len(revenue) > 0:
                latest_op_margin = (operating_income.iloc[-1] / revenue.iloc[-1] * 100) if revenue.iloc[-1] != 0 else 0
                result["operating_margin"] = round(latest_op_margin, 2)

        if not quarterly_balance.empty and "Inventory" in quarterly_balance.index:
            inventory = quarterly_balance.loc["Inventory"].sort_index()
            result["quarterly_inventory"] = inventory.to_dict()
            if len(inventory) >= 2:
                latest_inv = inventory.iloc[-1]
                prev_inv = inventory.iloc[-2]
                if not math.isnan(latest_inv) and not math.isnan(prev_inv) and prev_inv != 0 and latest_inv != 0:
                    result["inventory_qoq_change"] = round(((latest_inv - prev_inv) / prev_inv * 100), 2)
                else:
                    result["inventory_qoq_change"] = None
            if "Total Revenue" in quarterly_income.index:
                revenues = quarterly_income.loc["Total Revenue"].sort_index()
                if len(revenues) > 0:
                    latest_inv = inventory.iloc[-1]
                    latest_rev = revenues.iloc[-1]
                    inv_to_sales = (latest_inv / latest_rev) if latest_rev != 0 else 0
                    result["inventory_to_sales_ratio"] = round(inv_to_sales, 3)

        result["inventory_breakdown_available"] = False

        # Additive fork-only metrics from statements already fetched above.
        _add_extended_metrics(result, quarterly_income, quarterly_balance, quarterly_cashflow)
        return result

    except Exception as exc:
        logger.error("Error fetching quarterly financials for %s: %s", ticker, exc)
        return {}


def create_fundamental_snapshot(ticker: str, quarterly_data: Dict) -> str:
    """Create a concise legacy-compatible fundamental snapshot summary."""
    if not quarterly_data:
        return f"FUNDAMENTAL SNAPSHOT - {ticker}\nNo data available"

    snapshot = f"\n{'='*60}\nFUNDAMENTAL SNAPSHOT - {ticker}\n{'='*60}\n"
    yoy = quarterly_data.get("revenue_yoy_change")
    qoq = quarterly_data.get("revenue_qoq_change")
    qrev = quarterly_data.get("quarterly_revenue", {})

    if yoy is not None:
        qoq_str = f"{qoq:+.1f}%" if qoq is not None else "N/A"
        if yoy > 20:
            snapshot += f"✓ Revenue: ACCELERATING strongly (YoY: +{yoy:.1f}%, QoQ: {qoq_str})\n"
        elif yoy > 10:
            snapshot += f"✓ Revenue: Growing well (YoY: +{yoy:.1f}%, QoQ: {qoq_str})\n"
        elif yoy > 0:
            snapshot += f"• Revenue: Modest growth (YoY: +{yoy:.1f}%, QoQ: {qoq_str})\n"
        else:
            snapshot += f"✗ Revenue: DETERIORATING (YoY: {yoy:.1f}%, QoQ: {qoq_str})\n"
    else:
        snapshot += "• Revenue: Data not available\n"

    if qrev and len(qrev) >= 4:
        rev_series = pd.Series(qrev).sort_index()
        qoq_trends = []
        for i in range(len(rev_series)-1, max(len(rev_series)-5, 0), -1):
            if i > 0:
                curr, prev = rev_series.iloc[i], rev_series.iloc[i-1]
                qoq_trends.append(f"{((curr-prev)/prev)*100:+.1f}%" if prev != 0 and not pd.isna(curr) and not pd.isna(prev) else "N/A")
        if qoq_trends:
            snapshot += f"  QoQ Trend (last 4Q): {' → '.join(reversed(qoq_trends))}\n"

    eps_yoy = quarterly_data.get("eps_yoy_change")
    eps_qoq = quarterly_data.get("eps_qoq_change")
    qeps = quarterly_data.get("quarterly_eps", {})
    if eps_yoy is not None:
        eps_qoq_str = f"{eps_qoq:+.1f}%" if eps_qoq is not None else "N/A"
        if eps_yoy > 25:
            snapshot += f"✓ EPS: STRONG growth (YoY: +{eps_yoy:.1f}%, QoQ: {eps_qoq_str})\n"
        elif eps_yoy > 10:
            snapshot += f"✓ EPS: Growing (YoY: +{eps_yoy:.1f}%, QoQ: {eps_qoq_str})\n"
        elif eps_yoy > 0:
            snapshot += f"• EPS: Slight growth (YoY: +{eps_yoy:.1f}%, QoQ: {eps_qoq_str})\n"
        else:
            snapshot += f"✗ EPS: DECLINING (YoY: {eps_yoy:.1f}%, QoQ: {eps_qoq_str})\n"
    else:
        snapshot += "• EPS: Data not available\n"

    if qeps and len(qeps) >= 4:
        eps_series = pd.Series(qeps).sort_index()
        qoq_trends = []
        for i in range(len(eps_series)-1, max(len(eps_series)-5, 0), -1):
            if i > 0:
                curr, prev = eps_series.iloc[i], eps_series.iloc[i-1]
                qoq_trends.append(f"{((curr-prev)/abs(prev))*100:+.1f}%" if prev != 0 and not pd.isna(curr) and not pd.isna(prev) else "N/A")
        if qoq_trends:
            snapshot += f"  QoQ Trend (last 4Q): {' → '.join(reversed(qoq_trends))}\n"

    if "gross_margin" in quarterly_data:
        margin = quarterly_data["gross_margin"]
        margin_change = quarterly_data.get("margin_change", 0)
        if margin_change > 1:
            snapshot += f"✓ Margins: EXPANDING ({margin:.1f}%, +{margin_change:.1f}pp QoQ)\n"
        elif margin_change > 0:
            snapshot += f"• Margins: Stable/slightly up ({margin:.1f}%, +{margin_change:.1f}pp QoQ)\n"
        elif margin_change > -1:
            snapshot += f"• Margins: Flat ({margin:.1f}%, {margin_change:.1f}pp QoQ)\n"
        else:
            snapshot += f"✗ Margins: CONTRACTING ({margin:.1f}%, {margin_change:.1f}pp QoQ)\n"

    inv_change = quarterly_data.get("inventory_qoq_change")
    inv_to_sales = quarterly_data.get("inventory_to_sales_ratio", 0)
    if inv_change is not None:
        if inv_change > 10:
            snapshot += f"⚠ Inventory: BUILDING (+{inv_change:.1f}% QoQ, ratio: {inv_to_sales:.2f})\n  → Potential demand weakness or production ramp\n"
        elif inv_change > 5:
            snapshot += f"• Inventory: Moderate build (+{inv_change:.1f}% QoQ, ratio: {inv_to_sales:.2f})\n"
        elif inv_change > 0:
            snapshot += f"• Inventory: Slight increase (+{inv_change:.1f}% QoQ, ratio: {inv_to_sales:.2f})\n"
        elif inv_change > -5:
            snapshot += f"• Inventory: Slight draw ({inv_change:.1f}% QoQ, ratio: {inv_to_sales:.2f})\n"
        else:
            snapshot += f"✓ Inventory: DRAWING ({inv_change:.1f}% QoQ, ratio: {inv_to_sales:.2f})\n  → Strong demand signal\n"
        if not quarterly_data.get("inventory_breakdown_available", False):
            snapshot += "  Note: Detailed breakdown (raw/WIP/finished) not available via API\n"

    snapshot += "\nOverall Assessment:\n"
    supports_breakout = True
    concerns = []
    if quarterly_data.get("revenue_yoy_change", 0) < 0:
        supports_breakout = False
        concerns.append("revenue declining")
    if quarterly_data.get("eps_yoy_change", 0) < 0:
        supports_breakout = False
        concerns.append("EPS declining")
    if quarterly_data.get("margin_change", 0) < -2:
        concerns.append("margins contracting")
    if quarterly_data.get("inventory_qoq_change", 0) > 15:
        concerns.append("inventory building rapidly")
    if supports_breakout and not concerns:
        snapshot += "✓ Fundamentals SUPPORT technical breakout\n"
    elif concerns:
        snapshot += f"⚠ Some concerns: {', '.join(concerns)}\n"
        if not supports_breakout:
            snapshot += "✗ Fundamentals CONTRADICT technical breakout\n"
    return snapshot


def analyze_fundamentals_for_signal(quarterly_data: Dict) -> Dict[str, object]:
    """Analyze the original upstream fundamental fields for legacy scoring."""
    if not quarterly_data:
        return {
            "revenue_trend": "unknown",
            "eps_trend": "unknown",
            "inventory_signal": "unknown",
            "supports_breakout": False,
            "penalty_points": 10,
        }

    revenue_yoy = quarterly_data.get("revenue_yoy_change", 0)
    revenue_qoq = quarterly_data.get("revenue_qoq_change", 0)
    eps_yoy = quarterly_data.get("eps_yoy_change", 0)
    inv_change = quarterly_data.get("inventory_qoq_change", 0)

    if revenue_yoy > 10:
        revenue_trend = "accelerating"
    elif revenue_yoy > 0:
        revenue_trend = "growing"
    elif revenue_yoy > -5:
        revenue_trend = "flat"
    else:
        revenue_trend = "deteriorating"

    if eps_yoy > 10:
        eps_trend = "accelerating"
    elif eps_yoy > 0:
        eps_trend = "growing"
    elif eps_yoy > -5:
        eps_trend = "flat"
    else:
        eps_trend = "deteriorating"

    if inv_change > 15:
        inventory_signal = "negative"
    elif inv_change > 5:
        inventory_signal = "caution"
    else:
        inventory_signal = "neutral"

    sequential_revenue_declining = revenue_qoq is not None and revenue_qoq < -2
    supports_breakout = (
        revenue_trend in ["accelerating", "growing"]
        and eps_trend in ["accelerating", "growing"]
        and inventory_signal != "negative"
        and not sequential_revenue_declining
    )

    penalty = 0
    if revenue_trend == "deteriorating":
        penalty += 5
    if eps_trend == "deteriorating":
        penalty += 5
    if inventory_signal == "negative":
        penalty += 5
    if sequential_revenue_declining:
        penalty += 15

    return {
        "revenue_trend": revenue_trend,
        "revenue_qoq": revenue_qoq,
        "sequential_revenue_declining": sequential_revenue_declining,
        "eps_trend": eps_trend,
        "inventory_signal": inventory_signal,
        "supports_breakout": supports_breakout,
        "penalty_points": penalty,
    }
