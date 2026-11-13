# Burn Calendar

NASA Space Apps 2026: *Harmonization of MODIS and VIIRS Hot Spots*.

Burn Calendar joins NASA FIRMS active-fire hotspots from three sensors (MODIS, VIIRS Suomi NPP,
VIIRS NOAA-20) into one monthly record in **NOAA-20-equivalent hotspots per month**, then shows it
as a burning-activity calendar with an anomaly badge, a Mann-Kendall trend test and a CSV download.

> Work in progress. Method details, limits and validation results will be filled in from the real run.

## Run it

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # macOS/Linux: .venv/bin/pip
python pipeline/inspect_raw.py                     # list data/raw files and print their headers
python pipeline/run_all.py                         # rebuild everything in data/processed from data/raw
python -m pytest                                   # tests run on the SYNTHETIC files in data/sample
```

`data/raw/` holds FIRMS Archive Download CSVs (not committed). Any file names work. The sensor is
read from the `satellite` column, and SP vs NRT comes from the `version` column or "nrt" in the file name.
The FIRMS API key, if it is used, is read from the `FIRMS_MAP_KEY` environment variable and is never committed.

## Pipeline

| Step | File | What it does |
| --- | --- | --- |
| Settings | `pipeline/config.py` | Areas, thresholds, overlap years: every choice that changes results |
| Load | `pipeline/load.py` | Normalise columns, map satellites to MODIS/SNPP/NOAA20, drop low confidence, prefer SP over NRT |
| Bin | `pipeline/bin.py` | Monthly counts per area and sensor (zero-filled only in fully covered months); 0.25° grid |
| Calibrate | `pipeline/calibrate.py` | Ratio factors on overlap years, drift check, stability, hold-out validation, harmonized series |
| Trend | `pipeline/trend.py` | Mann-Kendall + Sen's slope (yearly and seasonal), anomaly vs median of earlier years |
| Export | `pipeline/export.py` | `monthly_counts.csv`, `areas/{id}.json` + `.csv`, `areas/index.json` |

### Notes on the monthly_counts table

There is one row per area, month and sensor. `harmonized_count` is that sensor's count converted to
NOAA-20 units. `source_used` names the sensor chosen for the month (NOAA-20, else SNPP, else MODIS),
so the row where `sensor == source_used` is the calendar value. `pct_rank_within_sensor` is the
percentile fallback, which ranks a month within the same calendar month of its own sensor.

## Sources

- NASA FIRMS Archive Download: https://firms.modaps.eosdis.nasa.gov/download/
- NASA FIRMS area API: https://firms.modaps.eosdis.nasa.gov/api/area/
- Sensor coverage: MODIS C6.1 from 1 Nov 2000; VIIRS Suomi NPP from 20 Jan 2012 to 2 Nov 2026; VIIRS NOAA-20 from 1 Apr 2018.
