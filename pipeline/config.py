# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Every choice that changes results lives here, and is copied into the method notes.

Change a value here, rerun `python pipeline/run_all.py`, and every output follows.
"""
from datetime import date
from pathlib import Path

# --- Paths -------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
SAMPLE_DIR = ROOT / "data" / "sample"
# Natural Earth 1:50m land (public domain), for the pixel map land mask.
LAND_GEOJSON = ROOT / "data" / "external" / "ne_50m_land.geojson"
WEB_DATA_DIR = ROOT / "docs" / "data"    # run_all copies areas/ here; docs/ is the GitHub Pages site

# --- Areas -------------------------------------------------------------------
# bbox = [west, south, east, north] in degrees.
# Boxes, not borders: each area includes some land beyond the named region (labelled
# "region" in the app). Real borders are an optional day-2 upgrade (only bin.py changes).
AREAS = {
    "indonesia": {"name": "Indonesia region", "bbox": [95.0, -11.0, 141.0, 6.0]},
    "riau": {"name": "Riau region, Indonesia", "bbox": [100.0, -1.2, 104.0, 2.9]},
    "central_kalimantan": {"name": "Central Kalimantan region, Indonesia", "bbox": [110.7, -3.6, 116.0, 0.8]},
    # Outside Indonesia, to show the method generalises: Top End, Kimberley, Gulf country, Cape York.
    "north_australia": {"name": "Northern Australia", "bbox": [121.0, -20.0, 146.0, -10.5]},
}

# --- Download (pipeline/fetch_firms.py) ----------------------------------------
# One download box per region; the areas above are cut from these boxes.
# Each region is cached in its own folder: data/raw/firms_api/{region}/{source}/
FETCH_REGIONS = {
    "indonesia": [95.0, -11.0, 141.0, 6.0],
    "north_australia": [121.0, -20.0, 146.0, -10.5],
}
# (standard source, NRT source used only after the last standard date)
FETCH_SOURCES = [
    ("MODIS_SP", "MODIS_NRT"),
    ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"),
    ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
]

# --- Cleaning ----------------------------------------------------------------
MODIS_MIN_CONFIDENCE = 30           # MODIS confidence is 0-100; keep >= this
VIIRS_KEEP_CONFIDENCE = {"n", "h"}  # VIIRS confidence is l / n / h; keep nominal + high
KEEP_DAYNIGHT = {"D", "N"}          # same day/night rule for every sensor

# Non-vegetation sources. FIRMS standard (SP) files have a `type` column:
# 0 = presumed vegetation fire, 1 = active volcano, 2 = other static land source
# (e.g. gas flares, industry), 3 = offshore. We keep type 0 only. NRT files have no
# `type`, so an NRT detection is dropped if it falls in a cell where SP data ever
# flagged a type 1/2/3 source. Same rule for every sensor, so the chain stays consistent.
KEEP_FIRE_TYPES = {0}
STATIC_MASK_DEG = 0.05              # ~5 km cells for the NRT static-source mask

# --- Binning -----------------------------------------------------------------
GRID_DEG = 0.25                     # cell size for the map layer

# --- Sensors -----------------------------------------------------------------
SENSORS = ["MODIS", "SNPP", "NOAA20"]

# Official coverage of each sensor (FIRMS, checked Nov 13, 2026). A month only
# counts for a sensor if it is fully inside this window AND inside the dates
# actually present in data/raw. end=None means "still producing".
SENSOR_COVERAGE = {
    "MODIS": {"start": date(2000, 11, 1), "end": None},
    "SNPP": {"start": date(2012, 1, 20), "end": date(2026, 11, 2)},
    "NOAA20": {"start": date(2018, 4, 1), "end": None},
}

# --- Calibration -------------------------------------------------------------
# Each link converts `source` counts into `target` units, fitted on overlap years.
LINKS = {
    "modis_to_snpp": {"source": "MODIS", "target": "SNPP", "years": (2012, 2025)},
    "snpp_to_noaa20": {"source": "SNPP", "target": "NOAA20", "years": (2018, 2025)},
}
VALIDATION_HOLDOUT_YEARS = 2        # last N full overlap years held out for validation
VALIDATION_MIN_MONTH_COUNT = 10     # months with fewer target hotspots are skipped in MAPE
                                    # (tiny counts make percentage errors meaningless)

# Drift check on MODIS -> SNPP (Terra/Aqua orbit drift).
DRIFT_EARLY_YEARS = (2012, 2018)
DRIFT_LATE_YEARS = (2019, 2025)
DRIFT_MAX_DIFF = 0.20               # > 20% difference -> calibrate on early years only

# A link is "unstable" if the spread of its yearly ratios, (max - min) / median,
# is above this. Then per-sensor percentile ranks are the recommended fallback.
UNSTABLE_SPREAD = 0.50

# --- Anomaly -----------------------------------------------------------------
# anomaly_pct = (count - median) / median * 100, median over earlier complete years.
# Checked top to bottom: the first threshold the anomaly is at or above wins.
ANOMALY_LABELS = [
    (50.0, "Well above normal"),
    (15.0, "Above normal"),
    (-15.0, "Normal"),
    (float("-inf"), "Below normal"),
]
