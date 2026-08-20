"""Read-only LEGACY confirmation projection for StockScout Next shadow mode.

This module deliberately does not implement or reinterpret the frozen LEGACY
methodology. It only normalizes already-observed LEGACY confirmation output and
attaches it to a copy of a StockScout candidate.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

LEGACY_CONFIRMATION_VERSION = "shadow-v1"
LEGACY_CONFIRMATION_STATUSES = frozenset(
    {"CONFIRMED", "EARLY", "NEUTRAL", "CONFLICT", "RISK"}
)
OBSERVED_FIELDS = ("score", "positionPct", "daysFromLow", "mature", "pathReason")


def _normalize_status(value: Any) -> str:
    if not isinstance(value, str):
        return "UNAVAILABLE"
    status = value.strip().upper()
    return status if status in LEGACY_CONFIRMATION_STATUSES else "UNAVAILABLE"


def compute_legacy_confirmation(
    observed: Mapping[str, Any] | None,
    *,
    source: str = "frozen-legacy",
) -> dict[str, Any]:
    """Build an append-only projection from already-observed LEGACY fields.

    No score, threshold, or status is reconstructed here. If an accepted LEGACY
    status was not observed, the projection remains ``UNAVAILABLE``.
    """
    result: dict[str, Any] = {
        "status": "UNAVAILABLE",
        "available": False,
        "version": LEGACY_CONFIRMATION_VERSION,
        "provenance": "unavailable",
        "source": None,
        "score": None,
        "positionPct": None,
        "daysFromLow": None,
        "mature": None,
        "pathReason": None,
    }
    if not observed:
        return result

    result["provenance"] = "observed"
    result["source"] = source
    status = _normalize_status(
        observed.get("status")
        or observed.get("confirmationStatus")
        or observed.get("legacyConfirmationStatus")
    )
    result["status"] = status
    result["available"] = status != "UNAVAILABLE"

    for field in OBSERVED_FIELDS:
        if field in observed:
            result[field] = deepcopy(observed[field])

    return result


def attach_legacy_confirmation(
    candidate: Mapping[str, Any],
    observed: Mapping[str, Any] | None,
    *,
    source: str = "frozen-legacy",
) -> dict[str, Any]:
    """Return a deep-copied candidate with one append-only shadow projection."""
    enriched = deepcopy(dict(candidate))
    enriched["legacyConfirmation"] = compute_legacy_confirmation(observed, source=source)
    return enriched
