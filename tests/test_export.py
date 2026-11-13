import json

import pandas as pd

from pipeline import config, run_all
from tests.conftest import SAMPLE_AREAS


def test_end_to_end_on_sample(tmp_path):
    run_all.run(config.SAMPLE_DIR, tmp_path, SAMPLE_AREAS)
    data = json.loads((tmp_path / "areas" / "sample_box.json").read_text())
    for key in ["area_id", "name", "bbox", "unit", "calendar", "yearly", "trend", "latest", "method"]:
        assert key in data
    assert data["method"]["factors"]["modis_to_snpp"] == 4.0
    assert data["method"]["validation_error_pct"] == 0.0
    assert data["calendar"][0] == {"year": 2010, "month": 1, "count": 18.0, "source": "MODIS",
                                   "median": None, "anomaly_pct": None}
    assert data["latest"]["label"] == "Well above normal"

    mc = pd.read_csv(tmp_path / "monthly_counts.csv")
    assert list(mc.columns[:9]) == ["area_id", "year", "month", "sensor", "raw_count", "harmonized_count",
                                    "source_used", "median_same_month", "anomaly_pct"]
    index = json.loads((tmp_path / "areas" / "index.json").read_text())
    assert index[0]["area_id"] == "sample_box"
