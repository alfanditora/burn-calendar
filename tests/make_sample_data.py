"""Generate SYNTHETIC FIRMS-like CSVs in data/sample/ for tests. Never shown in the app.

Ground truth, built in so tests can check exact answers:
  * Area "sample_box" = [100, 0, 102, 2]. Activity index k(year, month) = 1 + SEASON[month] + (year - 2010) // 4
  * Confident detections inside the box per month: SNPP = 20k, MODIS = 5k, NOAA-20 = 18k
    -> modis_to_snpp = 4.0, snpp_to_noaa20 = 0.9, harmonized count = 18k for every month.
  * Noise that cleaning must remove: low-confidence rows inside the box.
  * Confident rows OUTSIDE the box on the first and last day of each month (also mark full coverage).
  * NOAA-20 NRT file overlaps the SP file in Dec 2025 (must be dropped) and extends to Mar 2026.

Run:  python tests/make_sample_data.py
"""
import calendar
import csv
from datetime import date
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "data" / "sample"
BOX = (100.0, 0.0, 102.0, 2.0)
SEASON = [0, 0, 0, 0, 1, 2, 3, 5, 6, 3, 1, 0]   # peak in September, like a dry season

MODIS_COLS = ["latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time", "satellite",
              "instrument", "confidence", "version", "bright_t31", "frp", "daynight", "type"]
VIIRS_COLS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite",
              "instrument", "confidence", "version", "bright_ti5", "frp", "daynight", "type"]


def k(year, month):
    return 1 + SEASON[month - 1] + (year - 2010) // 4


def months(start, end):
    y, m = start
    while (y, m) <= end:
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def row(rng, cols, d, lat, lon, sat, instr, conf, version, nrt=False):
    r = {
        "latitude": f"{lat:.5f}", "longitude": f"{lon:.5f}",
        "brightness": "320.1", "bright_ti4": "330.2", "scan": "1.0", "track": "1.0",
        "acq_date": d.isoformat(), "acq_time": f"{rng.integers(0, 2400):04d}",
        "satellite": sat, "instrument": instr, "confidence": conf, "version": version,
        "bright_t31": "295.0", "bright_ti5": "290.0", "frp": f"{rng.uniform(1, 50):.1f}",
        "daynight": rng.choice(["D", "N"]), "type": "0",
    }
    return [r[c] for c in cols if not (nrt and c == "type")]


def write(name, cols, rows, nrt=False):
    cols = [c for c in cols if not (nrt and c == "type")]
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)


def sensor_rows(rng, cols, span, per_k, sats, instr, good_conf, bad_conf, version,
                first_day=None, nrt=False):
    rows = []
    for y, m in months(*span):
        last = calendar.monthrange(y, m)[1]
        lo = first_day.day if (first_day and (y, m) == (first_day.year, first_day.month)) else 1
        n = per_k * k(y, m)
        for i in range(n):
            d = date(y, m, int(rng.integers(lo, last + 1)))
            lat, lon = rng.uniform(BOX[1] + 0.01, BOX[3] - 0.01), rng.uniform(BOX[0] + 0.01, BOX[2] - 0.01)
            rows.append(row(rng, cols, d, lat, lon, sats[i % len(sats)], instr, good_conf(rng), version, nrt))
        for _ in range(2):  # low confidence inside the box: must be dropped
            d = date(y, m, int(rng.integers(lo, last + 1)))
            rows.append(row(rng, cols, d, 1.0, 101.0, sats[0], instr, bad_conf(rng), version, nrt))
        for day in (lo, last):  # confident, outside the box: kept but not counted in the area
            rows.append(row(rng, cols, date(y, m, day), 10.0, 120.0, sats[0], instr, good_conf(rng), version, nrt))
    return rows


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(42)
    modis_good = lambda r: str(int(r.integers(30, 101)))
    modis_bad = lambda r: str(int(r.integers(0, 30)))
    viirs_good = lambda r: str(r.choice(["n", "h"]))
    viirs_bad = lambda r: "l"

    write("SYNTHETIC_fire_archive_M-C61.csv", MODIS_COLS, sensor_rows(
        rng, MODIS_COLS, ((2010, 1), (2025, 12)), 5, ["Terra", "Aqua"], "MODIS", modis_good, modis_bad, "6.1"))
    write("SYNTHETIC_fire_archive_SV-C2.csv", VIIRS_COLS, sensor_rows(
        rng, VIIRS_COLS, ((2012, 1), (2025, 12)), 20, ["N"], "VIIRS", viirs_good, viirs_bad, "2",
        first_day=date(2012, 1, 20)))
    write("SYNTHETIC_fire_archive_J1V-C2.csv", VIIRS_COLS, sensor_rows(
        rng, VIIRS_COLS, ((2018, 4), (2025, 12)), 18, ["1"], "VIIRS", viirs_good, viirs_bad, "2"))
    write("SYNTHETIC_fire_nrt_J1V-C2.csv", VIIRS_COLS, sensor_rows(
        rng, VIIRS_COLS, ((2025, 12), (2026, 3)), 18, ["N20"], "VIIRS", viirs_good, viirs_bad, "2.0NRT",
        nrt=True), nrt=True)
    print(f"Wrote synthetic sample files to {OUT}")


if __name__ == "__main__":
    main()
