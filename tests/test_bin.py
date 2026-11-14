# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
import pandas as pd

from pipeline import bin as binning
from tests.make_sample_data import k


def test_covered_months_are_full_months_only(sample_loaded):
    cleaned, _ = sample_loaded
    m = binning.covered_months(cleaned)
    assert m["SNPP"][0] == (2012, 2)        # Jan 2012 starts on the 20th: partial, excluded
    assert m["NOAA20"][0] == (2018, 4)
    assert m["NOAA20"][-1] == (2026, 3)     # NRT extends SP
    assert m["MODIS"][0] == (2010, 1) and m["MODIS"][-1] == (2025, 12)


def test_monthly_counts_match_ground_truth(sample_counts):
    c = sample_counts.set_index(["sensor", "year", "month"])["raw_count"]
    for y, mo in [(2010, 1), (2015, 9), (2025, 12)]:
        assert c[("MODIS", y, mo)] == 5 * k(y, mo)
    assert c[("SNPP", 2015, 9)] == 20 * k(2015, 9)
    assert c[("NOAA20", 2020, 9)] == 18 * k(2020, 9)
    assert c[("NOAA20", 2026, 2)] == 18 * k(2026, 2)
    # Dec 2025 is in both the SP and NRT files and must not be double counted.
    assert c[("NOAA20", 2025, 12)] == 18 * k(2025, 12)


def test_zero_fill_inside_coverage():
    df = pd.DataFrame({
        "latitude": [1.0, 1.0], "longitude": [101.0, 101.0],
        "acq_date": pd.to_datetime(["2020-01-01", "2020-03-31"]), "sensor": ["NOAA20", "NOAA20"],
    })
    out = binning.monthly_counts(df, {"a": {"name": "a", "bbox": [100, 0, 102, 2]}})
    assert list(out["raw_count"]) == [1, 0, 1]  # February had no fires: a real zero


def test_grid_counts():
    df = pd.DataFrame({
        "latitude": [0.10, 0.20, 0.30], "longitude": [100.10, 100.20, 100.30],
        "acq_date": pd.to_datetime(["2020-01-01"] * 3), "sensor": ["SNPP"] * 3,
    })
    g = binning.grid_counts(df, 0.25)
    assert sorted(g["raw_count"]) == [1, 2]
