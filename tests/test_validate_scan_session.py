import pickle
from datetime import datetime, timezone

import pandas as pd
import pytest

from validate_scan_session import prior_session_backfill_allowed, validate_session


def cache_for(tmp_path, session="2026-08-20"):
    frame = pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime([session]))
    path = tmp_path / "price_history_5y.pkl"
    with path.open("wb") as handle:
        pickle.dump({"SPY": frame, "AAA": frame, "BBB": frame}, handle)
    return path


def test_pre_close_daily_run_fails_closed(tmp_path):
    with pytest.raises(SystemExit, match="before completed regular US session"):
        validate_session(
            now_utc=datetime(2026, 8, 21, 14, 0, tzinfo=timezone.utc),
            price_cache=cache_for(tmp_path),
            allow_prior_session_backfill=False,
        )


def test_explicit_prior_session_backfill_passes_pre_close(tmp_path):
    validate_session(
        now_utc=datetime(2026, 8, 21, 14, 0, tzinfo=timezone.utc),
        price_cache=cache_for(tmp_path),
        allow_prior_session_backfill=True,
    )


def test_pre_close_backfill_rejects_current_session(tmp_path):
    with pytest.raises(SystemExit, match="prior completed session"):
        validate_session(
            now_utc=datetime(2026, 8, 21, 14, 0, tzinfo=timezone.utc),
            price_cache=cache_for(tmp_path, "2026-08-21"),
            allow_prior_session_backfill=True,
        )


def test_backfill_is_only_enabled_by_explicit_environment(monkeypatch):
    monkeypatch.setenv("GITHUB_WORKFLOW", "StockScout Full Validation")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "push")
    monkeypatch.delenv("ALLOW_PRIOR_SESSION_BACKFILL", raising=False)
    assert prior_session_backfill_allowed() is False
    monkeypatch.setenv("ALLOW_PRIOR_SESSION_BACKFILL", "true")
    assert prior_session_backfill_allowed() is True
