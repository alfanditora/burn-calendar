# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Any-province view: hotspots go to the province that contains them and add up to the area total."""
import json

import pandas as pd
import shapely

from pipeline import grid


def test_province_series_known_answer(tmp_path):
    poly = lambda x0, x1: {"type": "Polygon", "coordinates": [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]]}  # noqa: E731
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "West", "country": "XXX"}, "geometry": poly(0, 1)},
        {"type": "Feature", "properties": {"name": "East", "country": "XXX"}, "geometry": poly(1, 2)},
        {"type": "Feature", "properties": {"name": "Abroad", "country": "YYY"}, "geometry": poly(2, 3)}]}
    path = tmp_path / "admin1.geojson"
    path.write_text(json.dumps(gj))
    rows = [  # lon, lat, date, sensor
        (0.5, 0.5, "2020-01-03", "NOAA20"), (0.6, 0.5, "2020-01-04", "NOAA20"),  # West, Jan: 2
        (1.5, 0.5, "2020-01-05", "NOAA20"),                                      # East, Jan: 1
        (1.5, 0.5, "2020-01-06", "SNPP"),        # not the sensor used in Jan: ignored
        (0.5, 0.5, "2020-02-01", "SNPP"),        # West, Feb: 1 x 1.5
        (1.0, 1.0004, "2020-02-02", "SNPP"),     # on the area edge, outside both outlines: nearest province
        (2.5, 0.5, "2020-02-03", "SNPP"),        # outside the area outline: not counted
    ]
    cleaned = pd.DataFrame(rows, columns=["longitude", "latitude", "acq_date", "sensor"])
    cleaned["acq_date"] = pd.to_datetime(cleaned["acq_date"])
    area_json = {"area_id": "box", "name": "Box", "unit": "u",
                 "method": {"factors": {"snpp_to_noaa20": 1.5, "modis_to_snpp": 2.0}},
                 "calendar": [{"year": 2020, "month": 1, "source": "NOAA20", "count": 3.0},
                              {"year": 2020, "month": 2, "source": "SNPP", "count": 3.0},
                              {"year": 2020, "month": 3, "source": "SNPP", "count": None}]}
    area = {"bbox": [0, 0, 3, 1.001], "geometry": shapely.box(0, 0, 2, 1.001)}
    out = grid.province_series(cleaned, [0, 0, 3, 1.001], area_json, area, "XXX", geojson_path=path)
    assert out["names"] == ["West", "East"]
    west, east = out["counts"]
    assert west[0] == 2 and east[0] == 1
    assert west[1] + east[1] == 3.0          # both February points, 1.5 each
    assert west[2] is None                   # a month without data stays missing
    for k in range(2):                       # provinces add up to the area calendar
        assert west[k] + east[k] == area_json["calendar"][k]["count"]
    assert grid.province_series(cleaned, [0, 0, 3, 1.001], area_json, area, "ZZZ", geojson_path=path) is None
