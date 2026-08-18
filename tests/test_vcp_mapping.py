from export_frontend_data import _vcp_quality


def test_vcp_quality_prefers_canonical_source_key():
    assert _vcp_quality({"vcp_quality": 72.5}) == 72.5


def test_vcp_quality_keeps_backward_compatibility():
    assert _vcp_quality({"quality": 61.0}) == 61.0


def test_vcp_quality_defaults_to_zero():
    assert _vcp_quality({}) == 0.0
