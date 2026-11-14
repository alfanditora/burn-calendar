# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Trend (Mann-Kendall + Sen's slope) and anomaly vs the median of earlier years."""
import numpy as np
import pandas as pd
import pymannkendall as mk

from pipeline import config

MIN_YEARS_FOR_TREND = 5


def selected_series(harmonized):
    """One row per month: the harmonized count from the sensor chosen for that month."""
    s = harmonized[harmonized["sensor"] == harmonized["source_used"]]
    return s[["year", "month", "harmonized_count", "source_used"]].sort_values(["year", "month"]).reset_index(drop=True)


def complete_years(series):
    sizes = series.groupby("year")["month"].nunique()
    return sorted(int(y) for y in sizes[sizes == 12].index)


def label_for(anomaly_pct):
    if anomaly_pct is None or not np.isfinite(anomaly_pct):
        return "No baseline"
    for threshold, label in config.ANOMALY_LABELS:
        if anomaly_pct >= threshold:
            return label
    return config.ANOMALY_LABELS[-1][1]


def add_anomaly(series):
    """median_same_month = median of the same month over earlier complete years."""
    full = set(complete_years(series))
    base = series[series["year"].isin(full)]
    medians, anomalies = [], []
    for year, month, count in zip(series["year"], series["month"], series["harmonized_count"]):
        past = base.loc[(base["month"] == month) & (base["year"] < year), "harmonized_count"]
        med = float(past.median()) if len(past) else np.nan
        medians.append(med)
        anomalies.append((count - med) / med * 100 if med and np.isfinite(med) else np.nan)
    return series.assign(median_same_month=medians, anomaly_pct=anomalies)


def yearly_totals(series):
    full = complete_years(series)
    y = series[series["year"].isin(full)].groupby("year")["harmonized_count"].sum()
    return y.reset_index().rename(columns={"harmonized_count": "count"})


def trend_test(series):
    yearly = yearly_totals(series)
    if len(yearly) < MIN_YEARS_FOR_TREND:
        return {"direction": "not enough data", "p_value": None, "slope_per_year": None,
                "years": None, "seasonal": None}
    r = mk.original_test(yearly["count"].to_numpy())

    full = complete_years(series)
    monthly = series[series["year"].isin(full)]["harmonized_count"].to_numpy()
    s = mk.seasonal_test(monthly, period=12)
    return {
        "direction": r.trend,
        "p_value": round(float(r.p), 4),
        "slope_per_year": round(float(r.slope), 2),
        "years": f"{full[0]}-{full[-1]}",
        "seasonal": {"direction": s.trend, "p_value": round(float(s.p), 4),
                     "slope_per_year": round(float(s.slope), 3)},
    }


def latest(series_with_anomaly):
    row = series_with_anomaly.iloc[-1]
    med, an = row["median_same_month"], row["anomaly_pct"]
    return {
        "year": int(row["year"]), "month": int(row["month"]),
        "count": round(float(row["harmonized_count"]), 1),
        "source": row["source_used"],
        "median": None if pd.isna(med) else round(float(med), 1),
        "anomaly_pct": None if pd.isna(an) else round(float(an), 1),
        "label": label_for(None if pd.isna(an) else float(an)),
    }
