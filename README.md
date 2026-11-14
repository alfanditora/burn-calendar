# Burn Calendar

NASA Space Apps 2026: *Harmonization of MODIS and VIIRS Hot Spots*.

Burn Calendar joins NASA FIRMS active-fire hotspots from three sensors (MODIS, VIIRS Suomi NPP,
VIIRS NOAA-20) into one monthly record in **NOAA-20-equivalent hotspots per month**, then shows it
as a pixel-art **Fire Atlas**: a time machine map of 25 years of fire seasons, four games, a story of the
satellite handover, and a Data Lab with the burning-activity calendar, anomaly badge, Mann-Kendall trend test and
CSV download.

**Live app:** https://alfanditora.github.io/burn-calendar/ (the static site lives in `docs/` and GitHub Pages
redeploys it on every push to `main`).

![Burn Calendar: the Fire Time Machine on September 2015](docs/screenshots/hero-indonesia-2015.png)

Deep links work too, e.g. `?area=riau&month=2015-09&tab=story`. More screenshots are in `docs/screenshots/`.

## Run it

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # macOS/Linux: .venv/bin/pip
python pipeline/fetch_firms.py --region indonesia  # download FIRMS history via the area API (needs FIRMS_MAP_KEY)
python pipeline/fetch_firms.py --region north_australia
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
| Borders | `pipeline/regions.py` | Builds `data/external/regions.geojson` (real outlines) from Natural Earth 1:10m admin-1 |
| Bin | `pipeline/bin.py` | Monthly counts per area (inside its real border) and sensor, zero-filled only in fully covered months |
| Calibrate | `pipeline/calibrate.py` | Ratio factors on overlap years, drift check, stability, hold-out validation, harmonized series |
| Trend | `pipeline/trend.py` | Mann-Kendall + Sen's slope (yearly and seasonal), anomaly vs median of earlier years |
| Export | `pipeline/export.py` | `monthly_counts.csv`, `areas/{id}.json` + `.csv`, `areas/index.json` |
| Pixel map | `pipeline/grid.py` | Harmonized counts per 0.25° cell and month + land mask, `grid/{region}.json` for the Time Machine |

### Notes on the monthly_counts table

There is one row per area, month and sensor. `harmonized_count` is that sensor's count converted to
NOAA-20 units. `source_used` names the sensor chosen for the month (NOAA-20, else SNPP, else MODIS),
so the row where `sensor == source_used` is the calendar value. `pct_rank_within_sensor` is the
percentile fallback, which ranks a month within the same calendar month of its own sensor.

## Results (run of Nov 14, 2026)

Areas are counted inside their real borders (Natural Earth 1:10m). Calibration factors and hold-out validation error
(monthly MAPE / yearly error, last two full overlap years held out):

| Area | MODIS → Suomi NPP | Validation | Suomi NPP → NOAA-20 | Validation | Notes |
| --- | --- | --- | --- | --- | --- |
| Indonesia | 5.10 | 19.9% / 10.5% | 1.01 | 8.2% / 6.8% | drift 3.4% |
| Riau Province, Indonesia | 4.87 | 164.9% / 64.4% | 1.02 | 13.8% / 13.0% | drift 34.6%, fitted on 2012–2018, unstable (percentile fallback offered) |
| Central Kalimantan, Indonesia | 5.05 | 51.8% / 25.3% | 0.99 | 19.5% / 4.7% | drift 9.6%, unstable (percentile fallback offered) |
| Northern Australia | 4.52 | 12.1% / 8.5% | 0.99 | 5.7% / 6.4% | drift 1.6% |

- VIIRS detects about **4.5–5.1× more hotspots than MODIS** over the same land, and the two VIIRS sensors agree within
  about 2%. The factors are close in two very different fire regimes: Indonesian peat and forest clearing, and
  Australian savanna burning. That supports one conversion chain for both.
- Small provinces are harder. Riau's fire counts dropped about tenfold after 2015, so its yearly ratios are noisy;
  the drift check fired and the link is flagged unstable. The app shows this and offers per-sensor percentile ranks.

Trend (Mann-Kendall on yearly totals 2001–2025) and the latest complete month (Oct 2026, near-real-time data):

| Area | Long-term trend | Oct 2026 vs median of earlier Octobers |
| --- | --- | --- |
| Indonesia | falling (p = 0.018, Sen's slope -11,151/yr) | Well above normal (+504%) |
| Riau Province, Indonesia | falling (p = 0.004, Sen's slope -1,885/yr) | Below normal (-88%) |
| Central Kalimantan, Indonesia | falling (p = 0.011, Sen's slope -1,828/yr) | Well above normal (+1343%) |
| Northern Australia | no clear trend (p = 0.944, Sen's slope -246/yr) | Below normal (-30%) |

All three sensors independently show the 2026 Indonesian fire season (Aug–Oct); for Indonesia, October 2026 is the
highest October since 2015. The largest year in the record is 2015 (the Southeast Asian haze crisis).

**Why real borders matter:** with a rectangle around Riau, October 2026 looked "Well above normal" (+86%), because
the box also caught fires in neighbouring Jambi, West Sumatra and North Sumatra. Inside Riau Province's real border
the same month is "Below normal" (−88%).

## Limits

- Converted counts are estimates; a single ratio per area cannot capture every seasonal or regional difference.
- Hotspots are fire detections, not burned area. Small, short or cloud-covered fires can be missed.
- Borders come from Natural Earth 1:10m; Northern Australia is defined as Australian land north of 20°S (121–146°E).
- The latest months use near-real-time data, which FIRMS replaces with standard data after about 5 months.
- Static sources are removed with FIRMS type flags (standard data) and a 0.05° mask (near-real-time data).

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
- shapely: https://shapely.readthedocs.io/ (BSD-3), to rasterise the land mask

Other data and assets
- Natural Earth 1:50m land polygons (public domain): https://www.naturalearthdata.com/, for the pixel map land mask
- Natural Earth 1:10m admin-1 states and provinces (public domain), for the area borders
- Fonts: Press Start 2P (CodeMan38) and VT323 (Peter Hull), SIL Open Font License, served by Google Fonts
- Pixel sprites (flames, satellites, icons) are drawn in code in `docs/js/sprites.js`; no external images are used

## Use of SI tools

Code in this repository was generated with assistance from Claude Code (Anthropic), working from
the team's written plan and brief. Each code file carries a header saying so. The team reviewed the
code, the method choices (thresholds, overlap years, the static-source filter) and the outputs.
Synthetic test data in `data/sample/` was generated by a script and is never shown in the app.
