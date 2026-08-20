#!/usr/bin/env python3
"""Fail closed when the price cache is not a completed, coherent US session.

Normal runs require >=16:30 ET. A caller may explicitly set
``ALLOW_PRIOR_SESSION_BACKFILL=true`` to validate an already-completed prior
session before today's close. Workflow names and event types never grant this
exception implicitly.
"""
from __future__ import annotations

import os
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


def prior_session_backfill_allowed() -> bool:
    return os.getenv("ALLOW_PRIOR_SESSION_BACKFILL", "false").strip().lower() in {
        "1", "true", "yes", "on"
    }


def validate_session(
    *,
    now_utc: datetime | None = None,
    price_cache: Path = PRICE_CACHE,
    allow_prior_session_backfill: bool | None = None,
) -> None:
    now_utc = now_utc or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    now_et = now_utc.astimezone(ZoneInfo("America/New_York"))
    minutes_et = now_et.hour * 60 + now_et.minute
    backfill = prior_session_backfill_allowed() if allow_prior_session_backfill is None else allow_prior_session_backfill
    if minutes_et < EARLIEST_PUBLISH_MINUTES_ET and not backfill:
        raise SystemExit(
            f"Refusing publish before completed regular US session: now {now_et.isoformat()}, require >=16:30 ET"
        )

    if not price_cache.exists():
        raise SystemExit(f"Missing canonical price cache: {price_cache}")
    with price_cache.open("rb") as fh:
        price_history: dict[str, pd.DataFrame] = pickle.load(fh)

    spy_date = last_date(price_history.get("SPY"))
    if spy_date is None:
        raise SystemExit("SPY has no valid last session date")

    age = (now_et.date() - spy_date).days
    if age < 0 or age > MAX_STALE_CALENDAR_DAYS:
        raise SystemExit(f"SPY session is stale/inconsistent: {spy_date}, age={age} calendar days")

    if backfill and minutes_et < EARLIEST_PUBLISH_MINUTES_ET and spy_date >= now_et.date():
        raise SystemExit(
            f"Manual pre-close validation may only publish a prior completed session; SPY={spy_date}, today={now_et.date()}"
        )

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

    mode = "manual prior-session backfill" if backfill and minutes_et < EARLIEST_PUBLISH_MINUTES_ET else "normal post-market"
    print(
        f"US session invariant OK ({mode}): SPY={spy_date}; now={now_et.strftime('%Y-%m-%d %H:%M %Z')}; "
        f"universe coherence={mode_count}/{len(dates)} ({coherent:.1%})"
    )


def main() -> None:
    validate_session()


if __name__ == "__main__":
    main()
