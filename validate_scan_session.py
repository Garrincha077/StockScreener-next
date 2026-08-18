#!/usr/bin/env python3
"""Fail closed when the nightly price cache is not a completed, coherent US session."""
from __future__ import annotations

import pickle
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

PRICE_CACHE = Path("data/batch_results/price_history_5y.pkl")
MIN_COHERENT_COVERAGE = 0.90
MAX_STALE_CALENDAR_DAYS = 4
EARLIEST_PUBLISH_MINUTES_ET = 16 * 60 + 30


def last_date(frame: pd.DataFrame | None):
    if frame is None or frame.empty:
        return None
    try:
        idx = pd.DatetimeIndex(frame.index)
        if idx.tz is not None:
            idx = idx.tz_convert("America/New_York").tz_localize(None)
        return idx.max().date()
    except Exception:
        return None


def main() -> None:
    now_utc = datetime.now(timezone.utc)
    now_et = now_utc.astimezone(ZoneInfo("America/New_York"))
    minutes_et = now_et.hour * 60 + now_et.minute
    if minutes_et < EARLIEST_PUBLISH_MINUTES_ET:
        raise SystemExit(
            f"Refusing publish before completed regular US session: now {now_et.isoformat()}, require >=16:30 ET"
        )

    if not PRICE_CACHE.exists():
        raise SystemExit(f"Missing canonical price cache: {PRICE_CACHE}")
    with PRICE_CACHE.open("rb") as fh:
        price_history: dict[str, pd.DataFrame] = pickle.load(fh)

    spy_date = last_date(price_history.get("SPY"))
    if spy_date is None:
        raise SystemExit("SPY has no valid last session date")

    age = (now_et.date() - spy_date).days
    if age < 0 or age > MAX_STALE_CALENDAR_DAYS:
        raise SystemExit(f"SPY session is stale/inconsistent: {spy_date}, age={age} calendar days")

    dates = [d for ticker, frame in price_history.items() if ticker != "SPY" for d in [last_date(frame)] if d is not None]
    if not dates:
        raise SystemExit("No stock session dates in canonical price cache")
    mode_date, mode_count = Counter(dates).most_common(1)[0]
    coherent = mode_count / len(dates)
    if mode_date != spy_date:
        raise SystemExit(f"SPY session {spy_date} disagrees with universe modal session {mode_date}")
    if coherent < MIN_COHERENT_COVERAGE:
        raise SystemExit(
            f"Price cache session coherence too low: {mode_count}/{len(dates)} ({coherent:.1%}) on {mode_date}"
        )

    print(
        f"US session invariant OK: SPY={spy_date}; now={now_et.strftime('%Y-%m-%d %H:%M %Z')}; "
        f"universe coherence={mode_count}/{len(dates)} ({coherent:.1%})"
    )


if __name__ == "__main__":
    main()
