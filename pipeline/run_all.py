# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Rebuild every output from data/raw in one command:  python pipeline/run_all.py"""
import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import bin as binning  # noqa: E402  (`bin` shadows a builtin)
from pipeline import config, export, load  # noqa: E402


def run(raw_dir=None, out_dir=None, areas=None, web_dir=None):
    cleaned, raw_stats = load.load_all(raw_dir)
    print(f"Loaded {raw_stats['rows'].sum():,} raw rows, kept {len(cleaned):,} after cleaning.")
    print(load.summarize(cleaned).to_string(index=False))

    counts = binning.monthly_counts(cleaned, areas)
    print("\nMonthly counts (total hotspots per area and sensor):")
    print(counts.groupby(["area_id", "sensor"])["raw_count"].sum().unstack().to_string())

    out = export.export_all(counts, out_dir, areas)
    print(f"\nWrote outputs to {out}")
    if web_dir:
        target = Path(web_dir) / "areas"
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(Path(out) / "areas", target)
        print(f"Copied area files to {target}")
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raw", default=str(config.RAW_DIR))
    p.add_argument("--out", default=str(config.PROCESSED_DIR))
    a = p.parse_args()
    run(a.raw, a.out, web_dir=config.WEB_DATA_DIR)
