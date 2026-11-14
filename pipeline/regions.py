# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Area outlines (real borders) used to count hotspots.

Build once from Natural Earth 1:10m admin-1 states/provinces (public domain):

    python pipeline/regions.py

writes data/external/regions.geojson (small, committed). The large Natural Earth source
file is not committed; download it from
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson

Outlines:
  indonesia            all Indonesian provinces (union)
  riau                 Riau Province (ISO 3166-2 ID-RI)
  central_kalimantan   Central Kalimantan Province (ID-KT)
  north_australia      Australian land north of 20°S, within the downloaded box (121-146°E)

It also writes data/external/admin1.geojson: Indonesian provinces and Australian states inside the
download boxes (English names), used to name map cells ("near Riau") in the unusual-places list.
"""
import json
import sys
from functools import lru_cache
from pathlib import Path

import shapely

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import config  # noqa: E402

SOURCE = config.ROOT / "data" / "external" / "ne_10m_admin_1_states_provinces.geojson"
SIMPLIFY_DEG = 0.005   # ~500 m; far finer than the 0.25° map cells


def build(source=SOURCE, out=None):
    out = Path(out or config.REGIONS_GEOJSON)
    feats = json.loads(Path(source).read_text(encoding="utf-8"))["features"]
    shape = lambda f: shapely.geometry.shape(f["geometry"])  # noqa: E731
    by_iso = {f["properties"].get("iso_3166_2"): f for f in feats}
    country = lambda a3: shapely.union_all([shape(f) for f in feats if f["properties"].get("adm0_a3") == a3])  # noqa: E731

    regions = {
        "indonesia": (country("IDN").intersection(shapely.box(*config.FETCH_REGIONS["indonesia"])),
                      "All Indonesian provinces"),
        "riau": (shape(by_iso["ID-RI"]), "Riau Province (ID-RI)"),
        "central_kalimantan": (shape(by_iso["ID-KT"]), "Central Kalimantan Province (ID-KT)"),
        "north_australia": (country("AUS").intersection(shapely.box(*config.FETCH_REGIONS["north_australia"])),
                            "Australian land north of 20°S, 121-146°E"),
    }
    features = []
    for rid, (geom, desc) in regions.items():
        geom = shapely.simplify(geom, SIMPLIFY_DEG, preserve_topology=True)
        features.append({"type": "Feature", "properties": {"id": rid, "description": desc,
                         "source": "Natural Earth 1:10m admin-1 (public domain)"},
                         "geometry": shapely.geometry.mapping(geom)})
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    build_admin1(feats)
    return out


def build_admin1(feats, out=None, simplify_deg=0.02):
    """Provinces/states of the two countries inside the download boxes, for naming map cells."""
    out = Path(out or config.ADMIN1_GEOJSON)
    boxes = {"IDN": config.FETCH_REGIONS["indonesia"], "AUS": config.FETCH_REGIONS["north_australia"]}
    features = []
    for f in feats:
        p = f["properties"]
        if p.get("adm0_a3") not in boxes:
            continue
        geom = shapely.geometry.shape(f["geometry"]).intersection(shapely.box(*boxes[p["adm0_a3"]]))
        if geom.is_empty:
            continue
        geom = shapely.simplify(geom, simplify_deg, preserve_topology=True)
        features.append({"type": "Feature", "properties": {"name": p.get("name_en") or p["name"], "country": p["adm0_a3"]},
                         "geometry": shapely.geometry.mapping(geom)})
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    return out


@lru_cache(maxsize=None)
def _load(path):
    feats = json.loads(Path(path).read_text(encoding="utf-8"))["features"]
    return {f["properties"]["id"]: shapely.geometry.shape(f["geometry"]) for f in feats}


def geometry(boundary_id, path=None):
    """Shapely geometry for an outline id from regions.geojson (prepared for fast point tests)."""
    g = _load(str(path or config.REGIONS_GEOJSON))[boundary_id]
    shapely.prepare(g)
    return g


if __name__ == "__main__":
    path = build()
    for rid, g in _load(str(path)).items():
        print(f"{rid:20s} bounds {[round(v, 2) for v in g.bounds]}  area {g.area:.2f} deg²")
    print(f"Wrote {path} ({path.stat().st_size / 1e3:.0f} kB)")
