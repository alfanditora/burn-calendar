# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
import numpy as np
import pandas as pd
import pytest

from pipeline import load


def test_sensors_and_products(sample_loaded):
    cleaned, raw_stats = sample_loaded
    assert set(raw_stats["sensor"]) == {"MODIS", "SNPP", "NOAA20"}
    nrt_files = cleaned.loc[cleaned["source_file"].astype(str).str.contains("nrt"), "product"]
    assert set(nrt_files.astype(str)) == {"NRT"}
    assert set(cleaned["sensor"].astype(str)) == {"MODIS", "SNPP", "NOAA20"}


def test_low_confidence_dropped(sample_loaded):
    cleaned, raw_stats = sample_loaded
    assert "l" not in set(cleaned.loc[cleaned["sensor"] != "MODIS", "confidence"].astype(str))
    modis_conf = pd.to_numeric(cleaned.loc[cleaned["sensor"] == "MODIS", "confidence"].astype(str))
    assert modis_conf.min() >= 30
    assert len(cleaned) < raw_stats["rows"].sum()


def test_nrt_only_after_last_sp_date(sample_loaded):
    cleaned, _ = sample_loaded
    n20 = cleaned[cleaned["sensor"] == "NOAA20"]
    last_sp = n20.loc[n20["product"] == "SP", "acq_date"].max()
    assert (n20.loc[n20["product"] == "NRT", "acq_date"] > last_sp).all()
    assert n20["acq_date"].max() == pd.Timestamp("2026-03-31")


def test_normalises_alternative_labels(tmp_path):
    f = tmp_path / "x.csv"
    f.write_text(
        "Latitude,Longitude,acq_date,acq_time,satellite,instrument,confidence,version,daynight\n"
        "1,101,2020-01-05,0130,N20,VIIRS,nominal,2.0NRT,n\n"
        "1,101,2020-01-05,0131,T,MODIS,80,6.1NRT,D\n"
        "1,101,2020-01-05,0132,N21,VIIRS,h,2.0NRT,D\n"
    )
    df = load.read_raw_file(f)
    assert list(df["sensor"]) == ["NOAA20", "MODIS", "NOAA21"]
    assert set(df["product"]) == {"NRT"}
    cleaned = load.clean(df)
    assert list(cleaned["sensor"]) == ["NOAA20", "MODIS"]  # NOAA-21 is not in the chain


def test_missing_columns_and_unknown_satellite(tmp_path):
    f = tmp_path / "bad.csv"
    f.write_text("latitude,longitude\n1,2\n")
    with pytest.raises(ValueError, match="missing columns"):
        load.read_raw_file(f)
    g = tmp_path / "sat.csv"
    g.write_text("latitude,longitude,acq_date,satellite,instrument,confidence,daynight\n"
                 "1,2,2020-01-01,ZZ,VIIRS,n,D\n")
    with pytest.raises(ValueError, match="unknown satellite"):
        load.read_raw_file(g)


def test_static_sources_dropped_with_nrt_mask():
    df = pd.DataFrame({
        "latitude": [1.00, 1.01, 1.02, 3.0], "longitude": [101.00, 101.01, 101.02, 103.0],
        "fire_type": [2, 0, np.nan, np.nan],   # flare (SP), vegetation (SP), NRT near flare, NRT elsewhere
    })
    out = load.drop_static(df, load.static_cells(df))
    assert list(out["fire_type"].fillna(-1)) == [0, -1]
    assert list(out["latitude"]) == [1.01, 3.0]
