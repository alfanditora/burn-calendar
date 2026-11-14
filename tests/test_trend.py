# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
import numpy as np
import pandas as pd
import pytest

from pipeline import calibrate, trend


def _series(values_by_year):
    rows = [(y, m, float(v), "NOAA20") for y, vals in values_by_year.items() for m, v in enumerate(vals, 1)]
    return pd.DataFrame(rows, columns=["year", "month", "harmonized_count", "source_used"])


def test_labels():
    assert trend.label_for(80) == "Well above normal"
    assert trend.label_for(50) == "Well above normal"
    assert trend.label_for(20) == "Above normal"
    assert trend.label_for(0) == "Normal"
    assert trend.label_for(-15) == "Normal"
    assert trend.label_for(-40) == "Below normal"
    assert trend.label_for(None) == "No baseline"


def test_increasing_and_flat_trends():
    up = _series({y: [10 + 5 * (y - 2001)] * 12 for y in range(2001, 2016)})
    r = trend.trend_test(up)
    assert r["direction"] == "increasing" and r["p_value"] < 0.05
    assert r["slope_per_year"] == pytest.approx(60.0)
    assert r["seasonal"]["direction"] == "increasing"

    rng = np.random.default_rng(0)
    flat = _series({y: list(rng.integers(90, 110, 12)) for y in range(2001, 2016)})
    assert trend.trend_test(flat)["direction"] == "no trend"


def test_anomaly_uses_earlier_complete_years_only():
    s = _series({2001: [10] * 12, 2002: [20] * 12, 2003: [30] * 12})
    s = pd.concat([s, _series({2004: [50]})], ignore_index=True)  # 2004: January only, incomplete
    a = trend.add_anomaly(s)
    jan = a[a["month"] == 1].set_index("year")
    assert np.isnan(jan.loc[2001, "median_same_month"])
    assert jan.loc[2003, "median_same_month"] == 15.0
    assert jan.loc[2004, "median_same_month"] == 20.0
    assert jan.loc[2004, "anomaly_pct"] == pytest.approx(150.0)
    latest = trend.latest(a)
    assert (latest["year"], latest["month"], latest["label"]) == (2004, 1, "Well above normal")
    assert list(trend.yearly_totals(s)["year"]) == [2001, 2002, 2003]


def test_sample_trend_and_latest(sample_counts):
    links = calibrate.calibrate_area(sample_counts, "sample_box")
    series = trend.add_anomaly(trend.selected_series(calibrate.harmonize(sample_counts, "sample_box", links)))
    r = trend.trend_test(series)
    assert r["direction"] == "increasing" and r["years"] == "2010-2025"
    latest = trend.latest(series)
    # March 2026: 18 * k = 90; median of March 2010-2025 = 18 * 2.5 = 45, so +100%
    assert (latest["year"], latest["month"]) == (2026, 3)
    assert latest["count"] == 90.0 and latest["median"] == 45.0
    assert latest["label"] == "Well above normal"
