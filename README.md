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
python pipeline/fetch_firms.py                     # download FIRMS history via the area API (needs FIRMS_MAP_KEY)
python pipeline/inspect_raw.py                     # list data/raw files and print their headers
python pipeline/run_all.py                         # rebuild everything in data/processed from data/raw
python -m pytest                                   # tests run on the SYNTHETIC files in data/sample
```

`data/raw/` holds FIRMS CSVs (not committed): either API chunks written by `fetch_firms.py` under
`data/raw/firms_api/` or Archive Download files. Both formats load the same way. Any file names work. The sensor is
read from the `satellite` column, and SP vs NRT comes from the `version` column or "nrt" in the file name.
The FIRMS API key, if it is used, is read from the `FIRMS_MAP_KEY` environment variable and is never committed.

## Pipeline

| Step | File | What it does |
| --- | --- | --- |
| Download | `pipeline/fetch_firms.py` | Area API in 5-day chunks for one box; resumable, rate-limit aware, SP first then NRT |
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

## Decisions and differences from the plan

- **The area API now allows at most 5 days per call** (`Invalid day range. Expects [1..5]`, checked
  Nov 14, 2026), not 10 as in the plan. It still serves the full SP history, so we download through
  the API in 5-day chunks instead of using the Archive Download.
- **Data availability on Nov 14, 2026** (FIRMS `data_availability`): standard (SP) data runs to
  Jul 31, 2026 for VIIRS and Aug 31, 2026 for MODIS. Later months come from NRT.
- **Volcanoes, gas flares and offshore sources are removed.** SP files mark each detection with a
  `type` (0 vegetation fire, 1 volcano, 2 other static source such as gas flares, 3 offshore), and we
  keep type 0 only. NRT files have no `type`, so an NRT detection is dropped if it falls in a 0.05° cell
  where SP data ever flagged a type 1/2/3 source. The same rule applies to every sensor, so the chain
  stays consistent. In the Indonesia box for Sep 2015, about 12% of MODIS detections were flagged as static.

## Sources

- NASA FIRMS Archive Download: https://firms.modaps.eosdis.nasa.gov/download/
- NASA FIRMS area API: https://firms.modaps.eosdis.nasa.gov/api/area/
- Sensor coverage: MODIS C6.1 from 1 Nov 2000; VIIRS Suomi NPP from 20 Jan 2012 to 2 Nov 2026; VIIRS NOAA-20 from 1 Apr 2018.

## References

Data
- NASA FIRMS active fire data: MODIS Collection 6.1 (MODIS_SP, MODIS_NRT), VIIRS Suomi NPP 375 m
  (VIIRS_SNPP_SP, VIIRS_SNPP_NRT), VIIRS NOAA-20 375 m (VIIRS_NOAA20_SP, VIIRS_NOAA20_NRT).
  Data: NASA FIRMS (MODIS, VIIRS). https://firms.modaps.eosdis.nasa.gov/

Libraries (open source)
- pandas: https://pandas.pydata.org/ (BSD-3)
- NumPy: https://numpy.org/ (BSD-3)
- pyarrow: https://arrow.apache.org/ (Apache-2.0)
- pymannkendall 1.4.3: Hussain & Mahmud (2019), JOSS 4(39), 1556 (MIT)
- requests: https://requests.readthedocs.io/ (Apache-2.0)
- pytest: https://pytest.org/ (MIT)

## Use of SI tools

Code in this repository was generated with assistance from Claude Code (Anthropic), working from
the team's written plan and brief. Each code file carries a header saying so. The team reviewed the
code, the method choices (thresholds, overlap years, the static-source filter) and the outputs.
Synthetic test data in `data/sample/` was generated by a script and is never shown in the app.
