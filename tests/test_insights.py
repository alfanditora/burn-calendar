# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Fire season profile, early-signal hindcast and cell naming, on hand-made data with known answers."""
import json

from pipeline import export, grid, insights
from tests.conftest import SAMPLE_AREAS

SHAPE = {7: 20, 8: 100, 9: 100, 10: 20}  # a typical year: peak in Aug-Sep


def calendar(scale_by_year, shape=SHAPE, base=1.0, years=range(2005, 2020)):
    """Monthly counts = shape x the year's scale (1 outside the season)."""
    return [{"year": y, "month": m, "count": shape.get(m, base) * scale_by_year.get(y, 1.0)}
            for y in years for m in range(1, 13)]


def test_season_is_shortest_run_holding_the_share():
    p = insights.season_profile(calendar({}), peak_n=2)
    # medians: 100 + 100 + 20 + 20 + 8 x 1 = 248; Aug-Sep alone hold 200 / 248 = 81% >= 80%
    assert p["season_months"] == [8, 9]
    assert p["season_label"] == "Aug–Sep"
    assert p["peak_months"] == [8, 9]
    assert round(sum(p["monthly_share_pct"])) == 100


def test_season_can_wrap_over_new_year():
    p = insights.season_profile(calendar({}, shape={12: 100, 1: 100}))
    assert p["season_months"] == [12, 1]
    assert p["season_label"] == "Dec–Jan"


def test_season_needs_enough_years():
    assert insights.season_profile(calendar({}, years=range(2015, 2018))) is None


def test_early_warning_hindcast_known_answer():
    # Lead (Jun-Jul) and peak (Aug-Sep) scale together, so a big run-up always means a big peak.
    shape = {6: 10, 7: 10, 8: 100, 9: 100}
    scale = {2012: 2.0, 2014: 3.0, 2016: 0.5, 2017: 2.5, 2019: 4.0}
    cal = calendar(scale, shape=shape)
    p = insights.season_profile(cal, peak_n=2)
    e = insights.early_warning(cal, p)
    assert e["lead_months"] == [6, 7] and e["peak_months"] == [8, 9]
    # Baseline = earlier complete years only, at least 5: first scored year is 2005 + 5.
    assert e["years_scored"] == [2010, 2019] and e["n"] == 10
    assert e["lead_above_peak_above"] == 4          # 2012, 2014, 2017, 2019
    assert e["lead_above_peak_not"] == 0
    assert e["hit_rate_pct"] == 100.0
    assert e["spearman"] > 0.9
    assert e["p_value"] < 0.05
    for r in e["years"]:  # with the same shape the two anomalies are equal
        assert abs(r["lead_anomaly_pct"] - r["peak_anomaly_pct"]) < 0.2


def test_early_warning_reports_a_lead_without_a_peak_yet():
    cal = calendar({}, shape={6: 10, 7: 10, 8: 100, 9: 100})
    cal = [c for c in cal if not (c["year"] == 2019 and c["month"] >= 8)]  # season still running
    e = insights.early_warning(cal, insights.season_profile(cal, peak_n=2))
    last = e["years"][-1]
    assert last["year"] == 2019 and last["peak_anomaly_pct"] is None
    assert e["years_scored"][-1] == 2018


def test_spearman_and_ties():
    assert insights.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert insights.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    assert list(insights._ranks([5, 1, 5])) == [2.5, 1.0, 2.5]


def test_cell_names(tmp_path):
    gj = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "Box"},
          "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}}]}
    path = tmp_path / "admin1.geojson"
    path.write_text(json.dumps(gj))
    # 4 x 1 cells of 1 degree from lon 0 to 4: inside, near (0.5 deg away), far, far
    names, idx = grid.cell_names([0, 0, 4, 1], 4, 1, 1.0, geojson_path=path, max_distance=0.6)
    assert names == ["Box"]
    assert idx == [0, 0, -1, -1]


def test_area_json_has_insight_keys(sample_counts):
    data, _ = export.build_area(sample_counts, "sample_box", SAMPLE_AREAS["sample_box"])
    assert "season" in data and "early_warning" in data
