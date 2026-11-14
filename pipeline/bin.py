# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Count cleaned hotspots per area, sensor and month (and per grid cell for the map).

A month counts for a sensor only if the whole month is covered, both by the sensor's
official lifetime (config.SENSOR_COVERAGE) and by the data we actually loaded.
Inside covered months a missing count is a real zero; outside them it is missing.
"""
import numpy as np
import pandas as pd

from pipeline import config


def covered_months(df, coverage=None):
    """Return {sensor: [(year, month), ...]} of fully covered months."""
    coverage = coverage or config.SENSOR_COVERAGE
    out = {}
    for sensor in config.SENSORS:
        dates = df.loc[df["sensor"].astype(str) == sensor, "acq_date"]
        if dates.empty:
            out[sensor] = []
            continue
        start = max(pd.Timestamp(coverage[sensor]["start"]), dates.min())
        end = dates.max()
        if coverage[sensor]["end"] is not None:
            end = min(end, pd.Timestamp(coverage[sensor]["end"]))
        months = pd.period_range(start, end, freq="M")
        full = [p for p in months if p.start_time >= start and p.end_time.normalize() <= end]
        out[sensor] = [(p.year, p.month) for p in full]
    return out


def in_bbox(df, bbox):
    west, south, east, north = bbox
    return df["longitude"].between(west, east) & df["latitude"].between(south, north)


def monthly_counts(df, areas=None, coverage=None):
    """Long table: area_id, year, month, sensor, raw_count. Zero-filled inside covered months."""
    areas = areas or config.AREAS
    months = covered_months(df, coverage)
    df = df.assign(year=df["acq_date"].dt.year, month=df["acq_date"].dt.month)

    rows = []
    for area_id, area in areas.items():
        counts = df[in_bbox(df, area["bbox"])].groupby(["sensor", "year", "month"], observed=True).size()
        for sensor, ym in months.items():
            for year, month in ym:
                rows.append((area_id, year, month, sensor, int(counts.get((sensor, year, month), 0))))
    return pd.DataFrame(rows, columns=["area_id", "year", "month", "sensor", "raw_count"])


def grid_counts(df, grid_deg=None):
    """Non-zero counts per grid cell (lower-left corner), sensor and month."""
    grid_deg = grid_deg or config.GRID_DEG
    cells = df.assign(
        cell_lat=np.floor(df["latitude"] / grid_deg) * grid_deg,
        cell_lon=np.floor(df["longitude"] / grid_deg) * grid_deg,
        year=df["acq_date"].dt.year,
        month=df["acq_date"].dt.month,
    )
    return (
        cells.groupby(["cell_lat", "cell_lon", "sensor", "year", "month"], observed=True)
        .size().rename("raw_count").reset_index()
    )
