from prepare_frontend_payloads import CORE_EXTRA_FIELDS, build_core_payload


FUNDAMENTAL_DIMENSION_FIELDS = {
    "fundamentalGrowthScore",
    "fundamentalMarginScore",
    "fundamentalInventoryScore",
}


def test_detail_fundamental_dimensions_are_published_to_client_core():
    assert FUNDAMENTAL_DIMENSION_FIELDS <= CORE_EXTRA_FIELDS
    payload = {
        "generatedAt": "2026-08-21T00:00:00+00:00",
        "universe": [
            {
                "ticker": "TEST",
                "fundamentalGrowthScore": 77,
                "fundamentalMarginScore": 66,
                "fundamentalInventoryScore": 55,
            }
        ],
    }
    row = build_core_payload(payload)["universe"][0]
    assert row["fundamentalGrowthScore"] == 77
    assert row["fundamentalMarginScore"] == 66
    assert row["fundamentalInventoryScore"] == 55
