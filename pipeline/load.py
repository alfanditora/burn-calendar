# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Read FIRMS CSVs, normalise them to one schema, clean them.

Output columns: latitude, longitude, acq_date, acq_time, daynight, confidence,
sensor (MODIS / SNPP / NOAA20), product (SP / NRT), fire_type, source_file.

Files are read and cleaned one at a time, so millions of rows fit in memory.
"""
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline import config

REQUIRED = ["latitude", "longitude", "acq_date", "satellite", "instrument", "confidence", "daynight"]
OPTIONAL = ["acq_time", "version", "type"]

# FIRMS writes the satellite differently in archive and NRT files.
SATELLITE_TO_SENSOR = {
    "terra": "MODIS", "aqua": "MODIS", "t": "MODIS", "a": "MODIS",
    "n": "SNPP", "npp": "SNPP", "snpp": "SNPP", "suomi npp": "SNPP",
    "1": "NOAA20", "n20": "NOAA20", "j1": "NOAA20", "noaa-20": "NOAA20", "noaa20": "NOAA20",
    "2": "NOAA21", "n21": "NOAA21", "j2": "NOAA21", "noaa-21": "NOAA21", "noaa21": "NOAA21",
}

VIIRS_CONFIDENCE = {"l": "l", "low": "l", "n": "n", "nominal": "n", "h": "h", "high": "h"}


def read_raw_file(path):
    """Read one FIRMS CSV and return it in the normalised schema (not yet cleaned)."""
    path = Path(path)
    df = pd.read_csv(path, dtype=str, usecols=lambda c: c.strip().lower() in REQUIRED + OPTIONAL)
    df.columns = [c.strip().lower() for c in df.columns]
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"{path.name}: missing columns {missing}; found {list(df.columns)}")

    sat = df["satellite"].str.strip().str.lower()
    sensor = sat.map(SATELLITE_TO_SENSOR)
    unknown = sorted(sat[sensor.isna()].unique())
    if unknown:
        raise ValueError(f"{path.name}: unknown satellite values {unknown}")

    version = df["version"].astype(str) if "version" in df.columns else pd.Series("", index=df.index)
    is_nrt = version.str.upper().str.contains("NRT") | ("nrt" in path.name.lower())
    fire_type = pd.to_numeric(df["type"], errors="coerce") if "type" in df.columns else np.nan

    return pd.DataFrame({
        "latitude": pd.to_numeric(df["latitude"]),
        "longitude": pd.to_numeric(df["longitude"]),
        "acq_date": pd.to_datetime(df["acq_date"], format="%Y-%m-%d"),
        "acq_time": df["acq_time"].str.strip() if "acq_time" in df.columns else "",
        "daynight": df["daynight"].str.strip().str.upper(),
        "confidence": df["confidence"].str.strip().str.lower(),
        "sensor": sensor,
        "product": np.where(is_nrt, "NRT", "SP"),
        "fire_type": fire_type,
        "source_file": path.name,
    })


def clean(df):
    """Keep confident detections and the agreed day/night rule; drop sensors outside the chain."""
    df = df[df["sensor"].isin(config.SENSORS)]
    is_modis = df["sensor"] == "MODIS"

    modis_conf = pd.to_numeric(df["confidence"].where(is_modis), errors="coerce")
    viirs_conf = df["confidence"].where(~is_modis).map(VIIRS_CONFIDENCE)
    keep_conf = (
        (is_modis & (modis_conf >= config.MODIS_MIN_CONFIDENCE))
        | (~is_modis & viirs_conf.isin(config.VIIRS_KEEP_CONFIDENCE))
    )
    keep_dn = df["daynight"].isin(config.KEEP_DAYNIGHT)
    return df[keep_conf & keep_dn].reset_index(drop=True)


def _cells(df):
    deg = config.STATIC_MASK_DEG
    return (np.floor(df["latitude"] / deg).astype(int).astype(str) + "_"
            + np.floor(df["longitude"] / deg).astype(int).astype(str))


def static_cells(df):
    """Cells where FIRMS flagged a non-vegetation source (volcano, static land source, offshore)."""
    typed = df["fire_type"].notna() & ~df["fire_type"].isin(config.KEEP_FIRE_TYPES)
    return set(_cells(df[typed]))


def drop_static(df, cells):
    """Drop flagged rows; rows without a type (NRT) are dropped if they fall in a flagged cell."""
    typed = df["fire_type"].notna()
    bad_typed = typed & ~df["fire_type"].isin(config.KEEP_FIRE_TYPES)
    bad_untyped = ~typed & _cells(df).isin(cells) if cells else pd.Series(False, index=df.index)
    return df[~(bad_typed | bad_untyped)].reset_index(drop=True)


def prefer_standard(df):
    """Per sensor, use SP data; use NRT only for dates after the last SP date."""
    parts = []
    for sensor, g in df.groupby("sensor"):
        sp = g[g["product"] == "SP"]
        nrt = g[g["product"] == "NRT"]
        if len(sp):
            nrt = nrt[nrt["acq_date"] > sp["acq_date"].max()]
        parts.append(pd.concat([sp, nrt]))
    if not parts:
        return df.iloc[0:0]
    # Overlapping downloads can repeat detections; drop exact duplicates.
    out = pd.concat(parts, ignore_index=True)
    return out.drop_duplicates(
        subset=["sensor", "latitude", "longitude", "acq_date", "acq_time"]
    ).reset_index(drop=True)


def _file_stats(df):
    return df.groupby(["sensor", "product"]).agg(
        rows=("latitude", "size"), first=("acq_date", "min"), last=("acq_date", "max"),
        confidence_values=("confidence", lambda s: ",".join(sorted(s.unique())[:10])),
    ).reset_index()


def raw_files(raw_dir):
    return sorted(p for p in Path(raw_dir).rglob("*.csv"))


def load_all(raw_dir=None):
    """Read every CSV under raw_dir (recursively); return (cleaned, raw_stats)."""
    raw_dir = Path(raw_dir or config.RAW_DIR)
    files = raw_files(raw_dir)
    if not files:
        raise FileNotFoundError(f"No CSV files in {raw_dir}")

    parts, stats, flagged = [], [], set()
    for f in files:
        raw = read_raw_file(f)
        stats.append(_file_stats(raw))
        flagged |= static_cells(raw)   # from all detections, before confidence cleaning
        parts.append(clean(raw))
    cleaned = pd.concat(parts, ignore_index=True)
    cleaned = prefer_standard(drop_static(cleaned, flagged))
    for col in ["daynight", "confidence", "sensor", "product", "source_file"]:
        cleaned[col] = cleaned[col].astype("category")

    raw_stats = pd.concat(stats).groupby(["sensor", "product"]).agg(
        rows=("rows", "sum"), first=("first", "min"), last=("last", "max"),
        confidence_values=("confidence_values", lambda s: ",".join(sorted(set(",".join(s).split(",")))[:10])),
    ).reset_index()
    return cleaned, raw_stats


def summarize(df):
    """Per-sensor rows, date range and confidence values, as a small table."""
    return _file_stats(df.astype({"sensor": str, "product": str, "confidence": str}))


if __name__ == "__main__":
    cleaned, raw_stats = load_all()
    print("Raw (before cleaning):")
    print(raw_stats.to_string(index=False))
    print("\nCleaned:")
    print(summarize(cleaned).to_string(index=False))
