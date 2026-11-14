# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Write monthly_counts.csv, one JSON + CSV per area, and an index for the web app."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline import calibrate, config, trend

UNIT = "NOAA-20-equivalent hotspots per month"


def _config_notes():
    return (
        f"Cleaning: MODIS confidence >= {config.MODIS_MIN_CONFIDENCE}, VIIRS confidence in "
        f"{sorted(config.VIIRS_KEEP_CONFIDENCE)}, day/night kept: {sorted(config.KEEP_DAYNIGHT)}. "
        f"Factor = sum(target)/sum(source) over overlap months. Validation holds out the last "
        f"{config.VALIDATION_HOLDOUT_YEARS} full overlap years; monthly MAPE skips months with "
        f"< {config.VALIDATION_MIN_MONTH_COUNT} target hotspots. Anomaly = vs median of the same "
        f"month in earlier complete years. Counts are hotspots, not burned area."
    )


def build_area(counts, area_id, area):
    """Return (area_json, monthly_rows) for one area."""
    links = calibrate.calibrate_area(counts, area_id)
    h = calibrate.harmonize(counts, area_id, links)
    series = trend.add_anomaly(trend.selected_series(h))

    rows = h.merge(series[["year", "month", "median_same_month", "anomaly_pct"]],
                   on=["year", "month"], how="left")
    rows = calibrate.percentile_ranks(rows)

    errors = [l["validation"]["monthly_mape_pct"] for l in links.values()
              if l["validation"].get("monthly_mape_pct") is not None]
    notes = [_config_notes()] + [n for l in links.values() for n in l["notes"]]

    data = {
        "area_id": area_id,
        "name": area["name"],
        "bbox": area["bbox"],
        "unit": UNIT,
        "calendar": [
            {"year": int(r.year), "month": int(r.month),
             "count": round(float(r.harmonized_count), 1), "source": r.source_used,
             "median": None if pd.isna(r.median_same_month) else round(float(r.median_same_month), 1),
             "anomaly_pct": None if pd.isna(r.anomaly_pct) else round(float(r.anomaly_pct), 1)}
            for r in series.itertuples()
        ],
        "yearly": [{"year": int(r.year), "count": round(float(r.count), 1)}
                   for r in trend.yearly_totals(series).itertuples()],
        "trend": trend.trend_test(series),
        "latest": trend.latest(series) if len(series) else None,
        "method": {
            "factors": {name: l["factor"] for name, l in links.items()},
            # Headline = the worse of the two links, so we never overstate accuracy.
            "validation_error_pct": max(errors) if errors else None,
            "links": links,
            "fallback_percentiles_recommended": any(l["unstable"] for l in links.values()),
            "notes": " ".join(notes),
        },
    }
    return data, rows


def _clean_json(obj):
    if isinstance(obj, dict):
        return {str(k): _clean_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean_json(v) for v in obj]
    if isinstance(obj, float) and not np.isfinite(obj):
        return None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return _clean_json(float(obj))
    return obj


def export_all(counts, out_dir=None, areas=None):
    areas = areas or config.AREAS
    out_dir = Path(out_dir or config.PROCESSED_DIR)
    (out_dir / "areas").mkdir(parents=True, exist_ok=True)

    all_rows, index = [], []
    for area_id, area in areas.items():
        data, rows = build_area(counts, area_id, area)
        with open(out_dir / "areas" / f"{area_id}.json", "w", encoding="utf-8") as f:
            json.dump(_clean_json(data), f, indent=1)
        rows.to_csv(out_dir / "areas" / f"{area_id}.csv", index=False)
        all_rows.append(rows)
        index.append({"area_id": area_id, "name": data["name"], "bbox": data["bbox"]})

    cols = ["area_id", "year", "month", "sensor", "raw_count", "harmonized_count", "source_used",
            "median_same_month", "anomaly_pct", "pct_rank_within_sensor"]
    pd.concat(all_rows)[cols].to_csv(out_dir / "monthly_counts.csv", index=False)
    with open(out_dir / "areas" / "index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)
    return out_dir
