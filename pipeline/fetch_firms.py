# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Download FIRMS hotspots for the fetch box through the area API into data/raw/firms_api/.

    python pipeline/fetch_firms.py                    # full history, all sources in config.FETCH_SOURCES
    python pipeline/fetch_firms.py --start 2015-09-01 --end 2015-09-30   # small test

* One CSV per source per 5-day chunk (the API maximum), saved as it arrives, so a
  rerun skips finished chunks and resumes where it stopped.
* SP (standard) data is used up to its last available date; NRT only after that.
* Watches the MAP_KEY transaction counter and waits when close to the limit.
* MAP_KEY is read from the FIRMS_MAP_KEY environment variable or from .env (gitignored).
"""
import argparse
import io
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import config  # noqa: E402

BASE = "https://firms.modaps.eosdis.nasa.gov"
OUT = config.RAW_DIR / "firms_api"
DAY_RANGE = 5                 # API maximum (the old limit of 10 no longer applies)
LIMIT_MARGIN = 500            # pause when fewer than this many transactions remain
WORKERS = 4


def map_key():
    key = os.environ.get("FIRMS_MAP_KEY")
    env = config.ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("FIRMS_MAP_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("Set FIRMS_MAP_KEY in the environment or in .env")
    return key


def availability(key):
    r = requests.get(f"{BASE}/api/data_availability/csv/{key}/ALL", timeout=60)
    r.raise_for_status()
    out = {}
    for line in r.text.strip().splitlines()[1:]:
        source, lo, hi = line.split(",")
        out[source] = (date.fromisoformat(lo), date.fromisoformat(hi))
    return out


class RateGuard:
    """Check the transaction counter every few calls; sleep when near the limit."""

    def __init__(self, key):
        self.key, self.lock, self.calls = key, threading.Lock(), 0

    def status(self):
        r = requests.get(f"{BASE}/mapserver/mapkey_status/", params={"MAP_KEY": self.key}, timeout=60)
        r.raise_for_status()
        return r.json()

    def wait(self):
        with self.lock:
            self.calls += 1
            if self.calls % 10:
                return
            while True:
                s = self.status()
                left = s["transaction_limit"] - s["current_transactions"]
                if left > LIMIT_MARGIN:
                    return
                print(f"  {s['current_transactions']} transactions used; pausing 60 s", flush=True)
                time.sleep(60)


def chunks(start, end):
    d = start
    while d <= end:
        n = min(DAY_RANGE, (end - d).days + 1)
        yield d, n
        d += timedelta(days=n)


def fetch_chunk(key, guard, source, bbox, d, n):
    path = OUT / source / f"{d.isoformat()}_{n}d.csv"
    if path.exists():
        return path, "cached"
    area = ",".join(str(v) for v in bbox)
    url = f"{BASE}/api/area/csv/{key}/{source}/{area}/{n}/{d.isoformat()}"
    for attempt in range(6):
        guard.wait()
        try:
            r = requests.get(url, timeout=300)
            text = r.text
            if r.ok and text.startswith("latitude"):
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix(".part")
                tmp.write_text(text, encoding="utf-8")
                tmp.replace(path)             # only finished chunks get the .csv name
                return path, f"{text.count(chr(10)) - 1} rows"
            msg = text[:120].strip()
            if "Invalid" in msg:
                raise RuntimeError(f"{source} {d}: {msg}")
        except requests.RequestException as e:
            msg = str(e)[:120]
        time.sleep(min(60, 5 * 2 ** attempt))
    raise RuntimeError(f"{source} {d}: failed after retries: {msg}")


def plan(avail, start, end):
    """[(source, start, end)] using SP first, then NRT for later dates."""
    jobs = []
    for sp, nrt in config.FETCH_SOURCES:
        sp_lo, sp_hi = avail[sp]
        lo, hi = max(start, sp_lo), min(end, sp_hi)
        if lo <= hi:
            jobs.append((sp, lo, hi))
        if nrt and nrt in avail:
            n_lo, n_hi = avail[nrt]
            lo, hi = max(start, n_lo, sp_hi + timedelta(days=1)), min(end, n_hi)
            if lo <= hi:
                jobs.append((nrt, lo, hi))
    return jobs


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--start", type=date.fromisoformat, default=date(2000, 11, 1))
    p.add_argument("--end", type=date.fromisoformat, default=date.today())
    p.add_argument("--bbox", type=lambda s: [float(v) for v in s.split(",")], default=config.FETCH_BBOX)
    a = p.parse_args()

    key = map_key()
    guard = RateGuard(key)
    jobs = plan(availability(key), a.start, a.end)
    tasks = [(src, d, n) for src, lo, hi in jobs for d, n in chunks(lo, hi)]
    print(f"Box {a.bbox}; {len(tasks)} chunks:")
    for src, lo, hi in jobs:
        print(f"  {src:18s} {lo} to {hi}")

    done = failed = 0
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = {pool.submit(fetch_chunk, key, guard, src, a.bbox, d, n): (src, d) for src, d, n in tasks}
        for f in as_completed(futures):
            src, d = futures[f]
            try:
                f.result()
                done += 1
            except Exception as e:  # keep going; a rerun retries only the missing chunks
                failed += 1
                print(f"  FAILED {e}", flush=True)
            if (done + failed) % 100 == 0:
                print(f"  {done + failed}/{len(tasks)} chunks ({failed} failed)", flush=True)
    print(f"Finished: {done} chunks ok, {failed} failed. Rerun to retry failures.")


if __name__ == "__main__":
    main()
