# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Turn the harmonized monthly record into answers: when is the fire season, and does an
above-normal start predict an above-normal peak?

Works on an area's calendar ([{year, month, count}, ...] in NOAA-20 units), so it runs inside
export.build_area during the full rebuild, and also on its own over existing outputs:

    python pipeline/insights.py      # refresh season + early_warning in the area JSONs and cell names in the grids

season         typical monthly medians, the fire-season months (shortest run of consecutive months
               holding config.SEASON_SHARE of a typical year), and the peak window
early_warning  a hindcast: for each year, the lead months (just before the peak) and the peak months
               as % vs the median of EARLIER complete years only (what was known at the time), then how
               often an above-normal lead was followed by an above-normal peak, a rank correlation and
               a permutation p-value. A historical pattern, not a forecast.
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import config  # noqa: E402

MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _table(calendar):
    """{year: {month: count}} and the sorted list of complete years."""
    t = {}
    for c in calendar:
        t.setdefault(int(c["year"]), {})[int(c["month"])] = float(c["count"])
    return t, sorted(y for y, ms in t.items() if len(ms) == 12)


def _run_label(months):
    return MONTH_ABBR[months[0] - 1] if len(months) == 1 else f"{MONTH_ABBR[months[0] - 1]}–{MONTH_ABBR[months[-1] - 1]}"


def season_profile(calendar, share=None, peak_n=None):
    share = config.SEASON_SHARE if share is None else share
    peak_n = peak_n or config.PEAK_WINDOW_MONTHS
    t, full = _table(calendar)
    if len(full) < config.MIN_BASELINE_YEARS:
        return None
    med = np.array([np.median([t[y][m] for y in full]) for m in range(1, 13)])
    total = med.sum()
    if total <= 0:
        return None
    # Shortest run of consecutive months (wrapping over the new year) reaching `share`; ties -> larger sum.
    best = None
    for length in range(1, 13):
        for start in range(12):
            idx = [(start + k) % 12 for k in range(length)]
            s = med[idx].sum()
            if s >= share * total and (best is None or s > best[1]):
                best = (idx, s)
        if best:
            break
    season = [i + 1 for i in best[0]]
    # Peak: the peak_n consecutive months (no wrap) with the highest median sum.
    starts = range(0, 13 - peak_n)
    p0 = max(starts, key=lambda s: med[s:s + peak_n].sum())
    peak = list(range(p0 + 1, p0 + peak_n + 1))
    return {
        "method": (f"Monthly medians over complete years; fire season = the shortest run of consecutive months holding "
                   f"at least {share:.0%} of a typical year; peak = the {peak_n} consecutive months with the highest medians."),
        "years": [full[0], full[-1]],
        "monthly_median": [round(float(v), 1) for v in med],
        "monthly_share_pct": [round(float(v / total * 100), 1) for v in med],
        "season_months": season,
        "season_label": _run_label(season),
        "season_share_pct": round(float(best[1] / total * 100), 1),
        "peak_months": peak,
        "peak_label": _run_label(peak),
        "peak_share_pct": round(float(med[p0:p0 + peak_n].sum() / total * 100), 1),
    }


def _ranks(x):
    """Average ranks (ties share the mean rank)."""
    x = np.asarray(x, dtype=float)
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    r[order] = np.arange(1, len(x) + 1)
    for v in np.unique(x):
        same = x == v
        if same.sum() > 1:
            r[same] = r[same].mean()
    return r


def spearman(a, b):
    ra, rb = _ranks(a), _ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def permutation_p(a, b, n=None, seed=0):
    """One-sided p-value for a positive rank correlation: share of shuffles with rho >= observed."""
    n = n or config.PERMUTATIONS
    obs = spearman(a, b)
    if not np.isfinite(obs):
        return None
    rng = np.random.default_rng(seed)
    b = np.asarray(b, dtype=float)
    hits = sum(spearman(a, rng.permutation(b)) >= obs - 1e-12 for _ in range(n))
    return (hits + 1) / (n + 1)


def early_warning(calendar, profile, lead_n=None, above=None):
    lead_n = lead_n or config.LEAD_MONTHS
    above = config.EARLY_WARNING_ABOVE_PCT if above is None else above
    if not profile or profile["peak_months"][0] - lead_n < 1:
        return None
    peak = profile["peak_months"]
    lead = list(range(peak[0] - lead_n, peak[0]))
    t, full = _table(calendar)

    def window(year, months):
        ms = t.get(year, {})
        return sum(ms[m] for m in months) if all(m in ms for m in months) else None

    def anomaly(year, months):
        v = window(year, months)
        base = [window(y, months) for y in full if y < year]
        if v is None or len(base) < config.MIN_BASELINE_YEARS:
            return None
        med = float(np.median(base))
        return round((v - med) / med * 100, 1) if med > 0 else None

    years = []
    for y in sorted(t):
        la = anomaly(y, lead)
        if la is None:
            continue
        years.append({"year": y, "lead_anomaly_pct": la, "peak_anomaly_pct": anomaly(y, peak)})
    scored = [r for r in years if r["peak_anomaly_pct"] is not None]
    lead_up = [r["lead_anomaly_pct"] >= above for r in scored]
    peak_up = [r["peak_anomaly_pct"] >= above for r in scored]
    a = sum(l and p for l, p in zip(lead_up, peak_up))
    b = sum(l and not p for l, p in zip(lead_up, peak_up))
    c = sum(p and not l for l, p in zip(lead_up, peak_up))
    d = sum(not l and not p for l, p in zip(lead_up, peak_up))
    la = [r["lead_anomaly_pct"] for r in scored]
    pa = [r["peak_anomaly_pct"] for r in scored]
    rho = spearman(la, pa) if len(scored) >= 3 else float("nan")
    return {
        "method": (f"Hindcast: lead = the {lead_n} months before the {len(peak)}-month peak; each window is compared "
                   f"with the median of the same window in earlier complete years (at least {config.MIN_BASELINE_YEARS}); "
                   f"above normal = at least +{above:g}%. Spearman rank correlation with a one-sided permutation test "
                   f"({config.PERMUTATIONS} shuffles, seed 0). A historical pattern, not a forecast."),
        "lead_months": lead, "lead_label": _run_label(lead),
        "peak_months": peak, "peak_label": _run_label(peak),
        "above_pct": above,
        "years_scored": [scored[0]["year"], scored[-1]["year"]] if scored else None,
        "n": len(scored),
        "lead_above_peak_above": a, "lead_above_peak_not": b,
        "lead_not_peak_above": c, "lead_not_peak_not": d,
        "hit_rate_pct": round(a / (a + b) * 100, 1) if a + b else None,
        "base_rate_pct": round((a + c) / len(scored) * 100, 1) if scored else None,
        "quiet_rate_pct": round(d / (c + d) * 100, 1) if c + d else None,
        "spearman": round(rho, 3) if np.isfinite(rho) else None,
        "p_value": round(permutation_p(la, pa), 4) if len(scored) >= 3 and np.isfinite(rho) else None,
        "years": years,
    }


def add_insights(area_json):
    profile = season_profile(area_json["calendar"])
    area_json["season"] = profile
    area_json["early_warning"] = early_warning(area_json["calendar"], profile)
    return area_json


def refresh(out_dir=None, web_dir=None):
    """Recompute insights and cell names over existing outputs (no raw data needed)."""
    from pipeline import grid
    out_dir = Path(out_dir or config.PROCESSED_DIR)
    for path in sorted((out_dir / "areas").glob("*.json")):
        if path.name == "index.json":
            continue
        data = add_insights(json.loads(path.read_text(encoding="utf-8")))
        path.write_text(json.dumps(data, indent=1), encoding="utf-8")
        ew = data["early_warning"] or {}
        print(f"{data['area_id']:20s} season {data['season']['season_label']} peak {data['season']['peak_label']}; "
              f"early signal {ew.get('lead_label')}: {ew.get('lead_above_peak_above')}/{(ew.get('lead_above_peak_above') or 0) + (ew.get('lead_above_peak_not') or 0)} "
              f"rho {ew.get('spearman')} p {ew.get('p_value')}")
    for path in sorted((out_dir / "grid").glob("*.json")):
        g = json.loads(path.read_text(encoding="utf-8"))
        g["names"], g["cell_name"] = grid.cell_names(g["bbox"], g["w"], g["h"], g["deg"])
        path.write_text(json.dumps(g, separators=(",", ":")), encoding="utf-8")
    if web_dir:
        for sub in ["areas", "grid"]:
            target = Path(web_dir) / sub
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(out_dir / sub, target)


if __name__ == "__main__":
    refresh(web_dir=config.WEB_DATA_DIR)
