# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Fit the sensor links on overlap years, validate them, and build one NOAA-20-unit series.

Ratio method: factor = sum(target counts) / sum(source counts) over the overlap months
where BOTH sensors are covered. Simple, explainable, and robust to zero months.
"""
import numpy as np
import pandas as pd

from pipeline import config


def _paired(counts, area_id, source, target, years):
    """Monthly source/target counts for one area, only months both sensors cover."""
    a = counts[(counts["area_id"] == area_id) & counts["year"].between(*years)]
    wide = a.pivot_table(index=["year", "month"], columns="sensor", values="raw_count")
    if source not in wide or target not in wide:
        return pd.DataFrame(columns=["year", "month", "source", "target"])
    pair = wide[[source, target]].dropna().reset_index()
    return pair.rename(columns={source: "source", target: "target"})


def ratio(pair):
    s = pair["source"].sum()
    return float(pair["target"].sum() / s) if s > 0 else float("nan")


def yearly_ratios(pair):
    out = {}
    for year, g in pair.groupby("year"):
        r = ratio(g)
        if np.isfinite(r):
            out[int(year)] = round(r, 4)
    return out


def spread(yearly):
    """(max - min) / median of the yearly ratios; NaN with fewer than 2 years."""
    vals = np.array(list(yearly.values()))
    if len(vals) < 2:
        return float("nan")
    return float((vals.max() - vals.min()) / np.median(vals))


def validate(pair, holdout_years, train_pair=None):
    """Refit without the last N full years, predict them, report the errors.

    train_pair: fit the factor on another area's pair instead (the parent area), still
    leaving out the held-out years, then predict this area's held-out months.
    """
    years = sorted(pair.loc[pair.groupby("year")["month"].transform("size") == 12, "year"].unique())
    if len(years) <= holdout_years:
        return {"holdout_years": [], "monthly_mape_pct": None, "yearly_error_pct": None,
                "note": "not enough full overlap years to validate"}
    held = years[-holdout_years:]
    source = pair if train_pair is None else train_pair
    train = source[~source["year"].isin(held)]
    test = pair[pair["year"].isin(held)].copy()
    factor = ratio(train)
    test["pred"] = test["source"] * factor

    big = test[test["target"] >= config.VALIDATION_MIN_MONTH_COUNT]
    mape = (
        float((abs(big["pred"] - big["target"]) / big["target"]).mean() * 100) if len(big) else None
    )
    by_year = test.groupby("year")[["pred", "target"]].sum()
    by_year = by_year[by_year["target"] > 0]
    yearly_err = (
        float((abs(by_year["pred"] - by_year["target"]) / by_year["target"]).mean() * 100)
        if len(by_year) else None
    )
    return {
        "holdout_years": [int(y) for y in held],
        "train_factor": round(factor, 4),
        "monthly_mape_pct": None if mape is None else round(mape, 1),
        "months_scored": int(len(big)),
        "yearly_error_pct": None if yearly_err is None else round(yearly_err, 1),
    }


def cross_validate(pair, train_pair=None):
    """Leave-one-year-out: for each full overlap year, fit on the other years, predict that year.

    Errors are count-weighted (sum |error| / sum observed), so quiet years with a handful of
    hotspots do not dominate the way they do in a plain percentage error.
    """
    full = pair.groupby("year")["month"].transform("size") == 12
    years = sorted(pair.loc[full, "year"].unique())
    if len(years) < 3:
        return {"years": [], "monthly_wape_pct": None, "yearly_wape_pct": None}
    source = pair if train_pair is None else train_pair
    abs_m = obs_m = abs_y = obs_y = 0.0
    for y in years:
        f = ratio(source[source["year"] != y])
        test = pair[pair["year"] == y]
        pred = test["source"] * f
        abs_m += float((pred - test["target"]).abs().sum())
        obs_m += float(test["target"].sum())
        abs_y += abs(float(pred.sum() - test["target"].sum()))
        obs_y += float(test["target"].sum())
    return {
        "years": [int(years[0]), int(years[-1])],
        "monthly_wape_pct": round(abs_m / obs_m * 100, 1) if obs_m else None,
        "yearly_wape_pct": round(abs_y / obs_y * 100, 1) if obs_y else None,
    }


def fit_link(counts, area_id, link_name):
    link = config.LINKS[link_name]
    years = link["years"]
    pair = _paired(counts, area_id, link["source"], link["target"], years)
    notes = []

    if link_name == "modis_to_snpp":
        early = ratio(_paired(counts, area_id, "MODIS", "SNPP", config.DRIFT_EARLY_YEARS))
        late = ratio(_paired(counts, area_id, "MODIS", "SNPP", config.DRIFT_LATE_YEARS))
        diff = abs(late - early) / early if np.isfinite(early) and early > 0 and np.isfinite(late) else float("nan")
        drift = {"early_ratio": round(early, 4) if np.isfinite(early) else None,
                 "late_ratio": round(late, 4) if np.isfinite(late) else None,
                 "diff_pct": round(diff * 100, 1) if np.isfinite(diff) else None,
                 "used_early_only": bool(np.isfinite(diff) and diff > config.DRIFT_MAX_DIFF)}
        if drift["used_early_only"]:
            years = config.DRIFT_EARLY_YEARS
            pair = _paired(counts, area_id, "MODIS", "SNPP", years)
            notes.append(f"MODIS-SNPP ratio drifted {drift['diff_pct']}% between "
                         f"{config.DRIFT_EARLY_YEARS} and {config.DRIFT_LATE_YEARS}; "
                         f"calibrated on {years[0]}-{years[1]} only.")
    else:
        drift = None

    factor = ratio(pair)
    yearly = yearly_ratios(pair)
    sp = spread(yearly)
    unstable = bool(np.isfinite(sp) and sp > config.UNSTABLE_SPREAD)
    if unstable:
        notes.append(f"{link_name} yearly ratios spread {sp:.0%}; percentile ranks offered as fallback.")
    if not np.isfinite(factor):
        notes.append(f"{link_name}: no overlap data, factor unavailable.")

    return {
        "factor": round(factor, 4) if np.isfinite(factor) else None,
        "fit_years": [int(years[0]), int(years[1])],
        "overlap_months": int(len(pair)),
        "yearly_ratios": yearly,
        "spread": round(sp, 3) if np.isfinite(sp) else None,
        "unstable": unstable,
        "drift": drift,
        "validation": validate(pair, config.VALIDATION_HOLDOUT_YEARS),
        "cross_validation": cross_validate(pair),
        "notes": notes,
    }


def parent_fallback(counts, area_id, parent_id, link_name, own):
    """Replace an unstable link with the parent area's factor, validated on this area's held-out years.

    The MODIS/VIIRS ratio mostly reflects the sensors, so a large parent area (more fires every
    year) estimates it more reliably than a small province with few fires in some years.
    """
    link = config.LINKS[link_name]
    parent = fit_link(counts, parent_id, link_name)
    if parent["factor"] is None or parent["unstable"]:
        return own
    parent_pair = _paired(counts, parent_id, link["source"], link["target"], tuple(parent["fit_years"]))
    own_pair = _paired(counts, area_id, link["source"], link["target"], link["years"])
    validation = validate(own_pair, config.VALIDATION_HOLDOUT_YEARS, train_pair=parent_pair)
    out = dict(own)
    out.update({
        "factor": parent["factor"],
        "factor_source": parent_id,
        "fit_years": parent["fit_years"],
        "own_factor": own["factor"],
        "own_validation": own["validation"],
        "own_cross_validation": own["cross_validation"],
        "validation": validation,
        "cross_validation": cross_validate(own_pair, train_pair=parent_pair),
        "notes": own["notes"] + [
            f"{link_name}: own ratio unstable, so the {parent_id} factor {parent['factor']} is used "
            f"(own {own['factor']}); validated on this area's {validation['holdout_years']} months: "
            f"{validation['monthly_mape_pct']}% monthly error vs {own['validation']['monthly_mape_pct']}% with its own factor."],
    })
    out["notes"][-1] += (f" Cross-validated weighted error: {out['cross_validation']['monthly_wape_pct']}% "
                         f"(own factor: {own['cross_validation']['monthly_wape_pct']}%).")
    return out


def calibrate_area(counts, area_id, parent_id=None):
    links = {name: fit_link(counts, area_id, name) for name in config.LINKS}
    if parent_id and config.PARENT_FALLBACK:
        for name, link in links.items():
            if link["unstable"]:
                links[name] = parent_fallback(counts, area_id, parent_id, name, link)
    return links


def harmonize(counts, area_id, links):
    """Add harmonized_count (each sensor in NOAA-20 units) and source_used per month.

    Priority per month: NOAA20, else SNPP x f2, else MODIS x f1 x f2.
    """
    f1 = links["modis_to_snpp"]["factor"]
    f2 = links["snpp_to_noaa20"]["factor"]
    to_n20 = {
        "NOAA20": 1.0,
        "SNPP": f2,
        "MODIS": f1 * f2 if f1 is not None and f2 is not None else None,
    }
    a = counts[counts["area_id"] == area_id].copy()
    a["harmonized_count"] = [
        r * to_n20[s] if to_n20[s] is not None else np.nan for r, s in zip(a["raw_count"], a["sensor"])
    ]

    priority = {"NOAA20": 0, "SNPP": 1, "MODIS": 2}
    usable = a.dropna(subset=["harmonized_count"]).copy()
    usable["prio"] = usable["sensor"].map(priority)
    chosen = usable.sort_values("prio").groupby(["year", "month"]).first()["sensor"].rename("source_used")
    return a.merge(chosen.reset_index(), on=["year", "month"], how="left")


def percentile_ranks(counts):
    """Fallback: rank each month's raw count within the same calendar month of its own sensor (0-100)."""
    c = counts.copy()
    c["pct_rank_within_sensor"] = (
        c.groupby(["area_id", "sensor", "month"])["raw_count"].rank(pct=True) * 100
    ).round(1)
    return c
