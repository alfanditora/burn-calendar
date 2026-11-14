# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""List every file in data/raw and print its header and first row. Reads nothing else."""
import csv
import sys
from pathlib import Path

RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data" / "raw"

files = sorted(p for p in RAW.iterdir() if p.name != ".gitkeep") if RAW.exists() else []
if not files:
    print(f"No files in {RAW}")
for p in files:
    size_mb = p.stat().st_size / 1e6
    print(f"\n== {p.name}  ({size_mb:.1f} MB)")
    if p.suffix.lower() != ".csv":
        print("   not a CSV; skipped")
        continue
    with open(p, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        print("   header:", next(reader, []))
        print("   row 1: ", next(reader, []))
