# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
import pandas as pd
import pytest

from pipeline import calibrate
from tests.make_sample_data import k


def test_factors_recover_ground_truth(sample_counts):
    links = calibrate.calibrate_area(sample_counts, "sample_box")
    assert links["modis_to_snpp"]["factor"] == pytest.approx(4.0)
    assert links["snpp_to_noaa20"]["factor"] == pytest.approx(0.9)
    assert not links["modis_to_snpp"]["drift"]["used_early_only"]
    for link in links.values():
        assert not link["unstable"]
        assert link["validation"]["monthly_mape_pct"] == pytest.approx(0.0)
        assert link["validation"]["holdout_years"] == [2024, 2025]


def test_harmonized_series_is_one_unit(sample_counts):
    links = calibrate.calibrate_area(sample_counts, "sample_box")
    h = calibrate.harmonize(sample_counts, "sample_box", links)
    chosen = h[h["sensor"] == h["source_used"]].set_index(["year", "month"])
    assert chosen.loc[(2011, 9), "source_used"] == "MODIS"
    assert chosen.loc[(2015, 9), "source_used"] == "SNPP"
    assert chosen.loc[(2020, 9), "source_used"] == "NOAA20"
    # Ground truth: harmonized = 18 * k for every month, whatever the sensor.
    for (y, m), row in chosen.iterrows():
        assert row["harmonized_count"] == pytest.approx(18 * k(y, m))


def _counts(rows):
    return pd.DataFrame(rows, columns=["area_id", "year", "month", "sensor", "raw_count"])


def test_drift_check_switches_to_early_years():
    rows = []
    for y in range(2012, 2026):
        modis = 50 if y <= 2018 else 25  # MODIS sees half as much after 2018: big drift
        for m in range(1, 13):
            rows += [("a", y, m, "SNPP", 100), ("a", y, m, "MODIS", modis)]
    link = calibrate.fit_link(_counts(rows), "a", "modis_to_snpp")
    assert link["drift"]["used_early_only"]
    assert link["factor"] == pytest.approx(2.0)
    assert link["fit_years"] == [2012, 2018]


def test_unstable_link_flagged():
    rows = []
    for y in range(2018, 2026):
        n20 = 100 if y % 2 else 300   # ratio swings between 1.0 and 3.0
        for m in range(1, 13):
            rows += [("a", y, m, "SNPP", 100), ("a", y, m, "NOAA20", n20)]
    link = calibrate.fit_link(_counts(rows), "a", "snpp_to_noaa20")
    assert link["unstable"]


def test_percentile_ranks():
    c = _counts([("a", y, 1, "MODIS", v) for y, v in zip(range(2001, 2005), [10, 20, 30, 40])])
    r = calibrate.percentile_ranks(c)
    assert list(r["pct_rank_within_sensor"]) == [25.0, 50.0, 75.0, 100.0]
