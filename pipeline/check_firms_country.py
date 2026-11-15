# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Independent check: our Indonesia yearly counts against FIRMS's own Country Yearly Summary.

FIRMS publishes, per country and year, every standard-processing hotspot it assigns to that country
(https://firms.modaps.eosdis.nasa.gov/country/). We stream those files (nothing is saved), apply the
same cleaning as the pipeline (confidence, fire type 0), count per year, and compare with our raw
counts inside Indonesia's border (data/processed/monthly_counts.csv). Differences come from the
border used (FIRMS's country polygons vs Natural Earth) and from our near-real-time / static-source
handling; they should be small.

    python pipeline/check_firms_country.py   -> data/processed/firms_country_check.csv
"""
import csv
import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import config  # noqa: E402

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
SOURCES = {"MODIS": ("modis", range(2001, 2026)), "NOAA20": ("viirs-jpss1", range(2019, 2026))}


def firms_count(prefix, year, sensor):
    """Cleaned hotspot count in FIRMS's Indonesia file for one year, streamed line by line."""
    url = f"{BASE}/{prefix}/{year}/{prefix}_{year}_Indonesia.csv"
    with requests.get(url, stream=True, timeout=300, headers={"User-Agent": "burn-calendar-check"}) as r:
        r.raise_for_status()
        r.encoding = "utf-8"
        reader = csv.DictReader(r.iter_lines(decode_unicode=True))
        n = 0
        for row in reader:
            if row.get("type", "0").strip() not in {str(t) for t in config.KEEP_FIRE_TYPES}:
                continue
            if row["daynight"].strip().upper() not in config.KEEP_DAYNIGHT:
                continue
            c = row["confidence"].strip().lower()
            if sensor == "MODIS":
                if not c.isdigit() or int(c) < config.MODIS_MIN_CONFIDENCE:
                    continue
            elif c[:1] not in config.VIIRS_KEEP_CONFIDENCE:
                continue
            n += 1
    return n


def main():
    ours = pd.read_csv(config.ROOT / "data" / "processed" / "monthly_counts.csv")
    ours = ours[ours["area_id"] == "indonesia"].groupby(["sensor", "year"])["raw_count"].sum()
    rows = []
    for sensor, (prefix, years) in SOURCES.items():
        for y in years:
            f = firms_count(prefix, y, sensor)
            o = int(ours.get((sensor, y), 0))
            rows.append({"sensor": sensor, "year": y, "firms_country_summary": f, "burn_calendar": o,
                         "difference_pct": round((o - f) / f * 100, 2) if f else None})
            print(rows[-1], flush=True)
    out = pd.DataFrame(rows)
    path = config.ROOT / "data" / "processed" / "firms_country_check.csv"
    out.to_csv(path, index=False)
    for sensor, g in out.groupby("sensor"):
        tot_f, tot_o = g["firms_country_summary"].sum(), g["burn_calendar"].sum()
        print(f"{sensor}: total FIRMS {tot_f:,} vs ours {tot_o:,} ({(tot_o - tot_f) / tot_f * 100:+.2f}%), "
              f"yearly difference median {g['difference_pct'].abs().median():.2f}%, max {g['difference_pct'].abs().max():.2f}%")
    print(path)


if __name__ == "__main__":
    main()
