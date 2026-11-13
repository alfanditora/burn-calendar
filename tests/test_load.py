import pandas as pd
import pytest

from pipeline import load


def test_sensors_and_products(sample_loaded):
    cleaned, raw = sample_loaded
    assert set(raw["sensor"]) == {"MODIS", "SNPP", "NOAA20"}
    assert set(raw.loc[raw["source_file"].str.contains("nrt"), "product"]) == {"NRT"}
    assert set(cleaned["sensor"]) == {"MODIS", "SNPP", "NOAA20"}


def test_low_confidence_dropped(sample_loaded):
    cleaned, raw = sample_loaded
    assert "l" not in set(cleaned.loc[cleaned["sensor"] != "MODIS", "confidence"])
    modis_conf = pd.to_numeric(cleaned.loc[cleaned["sensor"] == "MODIS", "confidence"])
    assert modis_conf.min() >= 30
    assert len(cleaned) < len(raw)


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
