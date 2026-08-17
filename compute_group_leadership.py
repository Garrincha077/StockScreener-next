#!/usr/bin/env python3
"""Add data-first sector/industry proxy leadership to the frontend dataset.

Stocks are mapped to liquid ETF proxies by correlation of SPY-relative daily
returns over roughly six months. These are behavioural proxies, not official
GICS classifications. Proxy ranks combine 1M/3M/6M performance relative to SPY.
"""
from __future__ import annotations

import json
import math
import pickle
from pathlib import Path
from statistics import median
from typing import Dict

import pandas as pd

from src.screening.group_proxies import SECTOR_PROXIES, INDUSTRY_PROXIES

DATA = Path("frontend/public/data/latest.json")
PRICE_CACHE = Path("data/batch_results/price_history_5y.pkl")


def finite(value, default=0.0):
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except Exception:
        return default


def close_series(frame: pd.DataFrame | None) -> pd.Series:
    if frame is None or frame.empty or "Close" not in frame.columns:
        return pd.Series(dtype=float)
    out = frame["Close"].astype(float).dropna().copy()
    if isinstance(out.index, pd.DatetimeIndex) and out.index.tz is not None:
        out.index = out.index.tz_localize(None)
    return out[~out.index.duplicated(keep="last")].sort_index()


def relative_perf(close: pd.Series, spy: pd.Series, periods: int) -> float:
    joined = pd.concat([close.rename("asset"), spy.rename("spy")], axis=1).dropna()
    if len(joined) < 2:
        return 0.0
    p = min(periods, len(joined) - 1)
    asset0, asset1 = float(joined.asset.iloc[-p - 1]), float(joined.asset.iloc[-1])
    spy0, spy1 = float(joined.spy.iloc[-p - 1]), float(joined.spy.iloc[-1])
    if not asset0 or not spy0:
        return 0.0
    return ((asset1 / asset0 - 1.0) - (spy1 / spy0 - 1.0)) * 100.0


def residual_returns(close: pd.Series, spy: pd.Series, periods: int = 126) -> pd.Series:
    joined = pd.concat([close.rename("asset"), spy.rename("spy")], axis=1).dropna().tail(periods + 2)
    if len(joined) < 20:
        return pd.Series(dtype=float)
    ret = joined.pct_change().dropna()
    return (ret.asset - ret.spy).rename("residual")


def proxy_stats(price_history: Dict[str, pd.DataFrame], spy: pd.Series, mapping: Dict[str, str]):
    stats = {}
    for ticker, name in mapping.items():
        close = close_series(price_history.get(ticker))
        if close.empty:
            continue
        r1 = relative_perf(close, spy, 20)
        r3 = relative_perf(close, spy, 63)
        r6 = relative_perf(close, spy, 126)
        stats[ticker] = {
            "ticker": ticker,
            "name": name,
            "rel1m": round(r1, 2),
            "rel3m": round(r3, 2),
            "rel6m": round(r6, 2),
            "composite": r1 * 0.25 + r3 * 0.35 + r6 * 0.40,
            "residual": residual_returns(close, spy),
        }
    order = sorted(stats, key=lambda t: stats[t]["composite"])
    den = max(1, len(order) - 1)
    for i, ticker in enumerate(order):
        stats[ticker]["rank"] = int(round(1 + 98 * i / den))
    return stats


def proxy_matrix(stats: dict) -> pd.DataFrame:
    series = {ticker: item["residual"] for ticker, item in stats.items() if not item["residual"].empty}
    return pd.DataFrame(series).sort_index() if series else pd.DataFrame()


def best_proxy(stock_close: pd.Series, spy: pd.Series, matrix: pd.DataFrame, min_corr: float):
    stock = residual_returns(stock_close, spy)
    if stock.empty or matrix.empty:
        return None, 0.0
    joined = matrix.join(stock.rename("__stock"), how="inner")
    if len(joined) < 60:
        return None, 0.0
    cols = [c for c in matrix.columns if joined[[c, "__stock"]].dropna().shape[0] >= 60]
    if not cols:
        return None, 0.0
    correlations = joined[cols].corrwith(joined["__stock"]).dropna()
    if correlations.empty:
        return None, 0.0
    ticker = str(correlations.idxmax())
    corr = finite(correlations.loc[ticker])
    return (ticker, corr) if corr >= min_corr else (None, corr)


def stock_early(row: dict) -> bool:
    stage = int(finite(row.get("stage")))
    return (
        stage in (1, 2)
        and finite(row.get("rsRank")) >= 70
        and finite(row.get("rsAcceleration")) > 0
        and -8 <= finite(row.get("distance10w")) <= 10
        and not bool(row.get("extended"))
        and (stage == 1 or finite(row.get("stage2AgeWeeks")) <= 12)
    )


def summarize(mapping: Dict[str, str], stats: dict, rows: list[dict], ticker_field: str):
    buckets = {ticker: [] for ticker in mapping}
    for row in rows:
        ticker = row.get(ticker_field)
        if ticker in buckets:
            buckets[ticker].append(row)
    out = []
    for ticker, name in mapping.items():
        item = stats.get(ticker)
        if not item:
            continue
        members = buckets[ticker]
        opportunities = [finite(r.get("opportunityScore", r.get("score", 0))) for r in members]
        top = sorted(members, key=lambda r: (finite(r.get("leadershipScore")), finite(r.get("opportunityScore")), finite(r.get("rsRank"))), reverse=True)[:8]
        out.append({
            "ticker": ticker,
            "name": name,
            "rank": item["rank"],
            "rel1m": item["rel1m"],
            "rel3m": item["rel3m"],
            "rel6m": item["rel6m"],
            "stocks": len(members),
            "stage2Pct": round(sum(int(finite(r.get("stage"))) == 2 for r in members) / len(members) * 100.0, 1) if members else 0.0,
            "earlyLeaders": sum(stock_early(r) for r in members),
            "medianOpportunity": round(median(opportunities), 1) if opportunities else 0.0,
            "topTickers": [r.get("ticker") for r in top if r.get("ticker")],
        })
    return sorted(out, key=lambda x: (x["rank"], x["earlyLeaders"], x["medianOpportunity"]), reverse=True)


def main():
    if not DATA.exists() or not PRICE_CACHE.exists():
        print("Group leadership skipped: dataset or price cache missing")
        return
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    rows = payload.get("universe") or []
    with PRICE_CACHE.open("rb") as fh:
        price_history: Dict[str, pd.DataFrame] = pickle.load(fh)
    spy = close_series(price_history.get("SPY"))
    if spy.empty:
        print("Group leadership skipped: SPY missing")
        return

    sector_stats = proxy_stats(price_history, spy, SECTOR_PROXIES)
    industry_stats = proxy_stats(price_history, spy, INDUSTRY_PROXIES)
    sectors_matrix = proxy_matrix(sector_stats)
    industries_matrix = proxy_matrix(industry_stats)

    sector_covered = industry_covered = 0
    for row in rows:
        close = close_series(price_history.get(str(row.get("ticker", "")).upper()))
        if close.empty:
            continue
        sector_ticker, sector_corr = best_proxy(close, spy, sectors_matrix, 0.10)
        industry_ticker, industry_corr = best_proxy(close, spy, industries_matrix, 0.12)

        sector_rank = 50
        if sector_ticker:
            item = sector_stats[sector_ticker]
            row.update(sectorProxyTicker=sector_ticker, sectorProxy=item["name"], sectorCorrelation=round(sector_corr, 3), sectorRank=item["rank"])
            sector_rank = item["rank"]
            sector_covered += 1
        else:
            row.update(sectorProxyTicker=None, sectorProxy="Broad / Unclassified", sectorCorrelation=round(sector_corr, 3), sectorRank=50)

        industry_rank = 50
        if industry_ticker:
            item = industry_stats[industry_ticker]
            row.update(industryProxyTicker=industry_ticker, industryProxy=item["name"], industryCorrelation=round(industry_corr, 3), industryRank=item["rank"])
            industry_rank = item["rank"]
            industry_covered += 1
        else:
            row.update(industryProxyTicker=None, industryProxy="Broad / Unclassified", industryCorrelation=round(industry_corr, 3), industryRank=50)

        group_leadership = round(sector_rank * 0.45 + industry_rank * 0.55)
        row["groupLeadership"] = group_leadership
        individual = finite(row.get("opportunityScore", row.get("score", 0)))
        row["leadershipScore"] = int(round(max(0.0, min(100.0, individual * 0.80 + group_leadership * 0.20))))

    sectors = summarize(SECTOR_PROXIES, sector_stats, rows, "sectorProxyTicker")
    industries = summarize(INDUSTRY_PROXIES, industry_stats, rows, "industryProxyTicker")
    payload["groups"] = {
        "method": "behavioral-proxy-v1",
        "description": "ETF proxy assignment from 6M SPY-relative return correlation; ranks use 1M/3M/6M relative momentum.",
        "sectorCoverage": sector_covered,
        "industryCoverage": industry_covered,
        "sectors": sectors,
        "industries": industries,
    }
    market = payload.setdefault("market", {})
    market.update(groupModel="behavioral-proxy-v1", sectorCoverage=sector_covered, industryCoverage=industry_covered)
    if sectors:
        market.update(topSector=sectors[0]["name"], topSectorRank=sectors[0]["rank"])
    if industries:
        market.update(topIndustry=industries[0]["name"], topIndustryRank=industries[0]["rank"])
    payload["version"] = max(5, int(payload.get("version", 1) or 1))
    DATA.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Group leadership: sectors {sector_covered:,}/{len(rows):,}, industries {industry_covered:,}/{len(rows):,}; top sector={market.get('topSector','—')}, top industry={market.get('topIndustry','—')}")


if __name__ == "__main__":
    main()
