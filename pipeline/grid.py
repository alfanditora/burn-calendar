# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Pixel-map data: harmonized hotspot counts per grid cell and month, plus a land mask.

For each download region (config.FETCH_REGIONS) that is also an area, writes
grid/{region}.json for the web map:

  w, h, deg, bbox      grid size; cell index = row * w + col, row 0 = northern edge
  land                 string of "0"/"1", one char per cell (Natural Earth land, or any cell with fire)
  months               ["2000-11", ...] in the same order as the calendar
  fires                one flat list per month: [cell, count, cell, count, ...]
  names, cell_name     province/state names, and one index into names per cell (-1 = none), so the
                       unusual-places list can say "near Riau"

Counts use the same sensor and factor as the area calendar for that month
(NOAA-20 > SNPP x f2 > MODIS x f1 x f2), so the map and the calendar agree.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shapely

from pipeline import config


def land_mask(bbox, deg, geojson_path=None):
    """Boolean array (h, w): True where the cell centre is on land."""
    west, south, east, north = bbox
    w, h = round((east - west) / deg), round((north - south) / deg)
    with open(geojson_path or config.LAND_GEOJSON, encoding="utf-8") as f:
        gj = json.load(f)
    box = shapely.box(west, south, east, north)
    shapes = [shapely.geometry.shape(feat["geometry"]) for feat in gj["features"]]
    land = shapely.union_all([s for s in shapes if s.intersects(box)]).intersection(box)
    cols, rows = np.meshgrid(np.arange(w), np.arange(h))
    x = west + (cols + 0.5) * deg
    y = north - (rows + 0.5) * deg
    return shapely.contains_xy(land, x, y)


def cell_index(df, bbox, deg):
    west, south, east, north = bbox
    w = round((east - west) / deg)
    h = round((north - south) / deg)
    col = np.clip(np.floor((df["longitude"].to_numpy() - west) / deg).astype(int), 0, w - 1)
    row = np.clip(np.floor((north - df["latitude"].to_numpy()) / deg).astype(int), 0, h - 1)
    return row * w + col


def region_grid(cleaned, bbox, area_json, deg=None):
    """Build the pixel-map dict for one region from cleaned hotspots and its area JSON."""
    deg = deg or config.GRID_DEG
    west, south, east, north = bbox
    w, h = round((east - west) / deg), round((north - south) / deg)

    f = area_json["method"]["factors"]
    to_n20 = {"NOAA20": 1.0, "SNPP": f["snpp_to_noaa20"], "MODIS": f["modis_to_snpp"] * f["snpp_to_noaa20"]}
    source = {(c["year"], c["month"]): c["source"] for c in area_json["calendar"]}

    inside = (cleaned["longitude"].between(west, east) & cleaned["latitude"].between(south, north))
    df = cleaned.loc[inside, ["latitude", "longitude", "acq_date", "sensor"]].copy()
    df["year"], df["month"] = df["acq_date"].dt.year, df["acq_date"].dt.month
    df["sensor"] = df["sensor"].astype(str)
    chosen = pd.Series([source.get((y, m)) for y, m in zip(df["year"], df["month"])], index=df.index)
    df = df[df["sensor"] == chosen]
    df["cell"] = cell_index(df, bbox, deg)

    counts = df.groupby(["year", "month", "sensor", "cell"]).size().rename("n").reset_index()
    counts["value"] = counts["n"] * counts["sensor"].map(to_n20)

    land = land_mask(bbox, deg).ravel()
    land[counts["cell"].unique()] = True  # a fire pixel is land, even if the coastline is coarse

    fires = []
    by_month = {k: g for k, g in counts.groupby(["year", "month"])}
    for c in area_json["calendar"]:
        g = by_month.get((c["year"], c["month"]))
        flat = []
        if g is not None:
            for cell, v in zip(g["cell"], g["value"]):
                flat += [int(cell), max(1, int(round(v)))]
        fires.append(flat)

    return {
        "region": area_json["area_id"], "bbox": bbox, "deg": deg, "w": w, "h": h,
        "unit": area_json["unit"],
        "land": "".join("1" if v else "0" for v in land),
        "months": [f"{c['year']}-{c['month']:02d}" for c in area_json["calendar"]],
        "fires": fires,
    }


def cell_names(bbox, w, h, deg, geojson_path=None, max_distance=0.5):
    """Name each cell by the province/state containing its centre, else the nearest within max_distance degrees."""
    path = Path(geojson_path or config.ADMIN1_GEOJSON)
    if not path.exists():
        return [], [-1] * (w * h)
    feats = json.loads(path.read_text(encoding="utf-8"))["features"]
    west, south, east, north = bbox
    box = shapely.box(west, south, east, north)
    feats = [(f["properties"]["name"], shapely.geometry.shape(f["geometry"])) for f in feats]
    feats = [(n, g) for n, g in feats if g.intersects(box)]
    if not feats:
        return [], [-1] * (w * h)
    names = [n for n, _ in feats]
    tree = shapely.STRtree([g for _, g in feats])
    cols, rows = np.meshgrid(np.arange(w), np.arange(h))
    pts = shapely.points(west + (cols.ravel() + 0.5) * deg, north - (rows.ravel() + 0.5) * deg)
    out = np.full(w * h, -1)
    pairs = tree.query_nearest(pts, max_distance=max_distance, all_matches=False)
    out[pairs[0]] = pairs[1]
    return names, [int(v) for v in out]


def area_masks(bbox, w, h, deg, areas):
    """For each area with a real outline inside this map: "0"/"1" per cell, 1 where the cell touches the outline.
    The web map uses it to draw a pixel border and dim cells outside the selected area (display only)."""
    from pipeline import bin as binning
    west, south, east, north = bbox
    cols, rows = np.meshgrid(np.arange(w), np.arange(h))
    x0 = (west + cols * deg).ravel()
    y1 = (north - rows * deg).ravel()
    cells = shapely.box(x0, y1 - deg, x0 + deg, y1)
    out = {}
    for area_id, area in areas.items():
        a = area["bbox"]
        if not (a[0] >= west and a[1] >= south and a[2] <= east and a[3] <= north):
            continue
        geom = binning.area_geometry(area) or shapely.box(*a)
        hit = shapely.intersects(geom, cells)
        out[area_id] = "".join("1" if v else "0" for v in hit)
    return out


def export_grids(cleaned, out_dir, regions=None, areas=None):
    out_dir = Path(out_dir)
    regions = regions or config.FETCH_REGIONS
    (out_dir / "grid").mkdir(parents=True, exist_ok=True)
    written = []
    for region, bbox in regions.items():
        area_file = out_dir / "areas" / f"{region}.json"
        if not area_file.exists():
            continue
        data = region_grid(cleaned, bbox, json.loads(area_file.read_text(encoding="utf-8")))
        data["areas"] = area_masks(bbox, data["w"], data["h"], data["deg"], areas or config.AREAS)
        data["names"], data["cell_name"] = cell_names(bbox, data["w"], data["h"], data["deg"])
        path = out_dir / "grid" / f"{region}.json"
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        written.append(path)
    return written
