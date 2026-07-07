#!/usr/bin/env python3
"""Build the FTSE MIB dataset for the market-map heatmap.

Same output schema as build_sp500.py (the web app is index-agnostic), different
sources — Milan listings aren't on the NASDAQ APIs:
1. Constituents + sector mapping -> mapping/data/ftsemib_universe.csv
   (hand-maintained, ~40 names; review after quarterly index rebalances)
2. Prices, ~1y history, market cap  -> Yahoo Finance via the `yfinance` library
   (keyless; handles Yahoo's crumb/cookie dance and polite pacing for us)

Writes ``mapping/dashboard/data/ftsemib.json`` — flat array grouped by the web
app as Sector -> Sub-Industry -> Stock. Degrades gracefully: a failed ticker is
skipped (logged), never a crashed build.

Env vars:
  RATE_SLEEP   seconds between Yahoo calls (default 0.5)
  LIMIT        cap number of symbols (testing; default all)

Output is mechanical market data for visualization — NOT financial advice.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import time
from datetime import timedelta
from pathlib import Path

import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("build_ftsemib")

RATE_SLEEP = float(os.getenv("RATE_SLEEP", "0.5"))
LIMIT = int(os.getenv("LIMIT", "0"))
SPARK_POINTS = 30  # keep identical to build_sp500.py so sparklines render the same

ROOT = Path(__file__).resolve().parents[1]
UNIVERSE = ROOT / "data" / "ftsemib_universe.csv"
OUT_PATH = ROOT / "dashboard" / "data" / "ftsemib.json"


def get_universe() -> list[dict]:
    with UNIVERSE.open(encoding="utf-8") as f:
        rows = [
            {"ticker": r["ticker"].strip(), "yahoo": r["yahoo"].strip(),
             "name": r["name"].strip(),
             "gics_sector": r["sector"].strip() or "Unknown",
             "gics_sub_industry": r["sub_industry"].strip() or "Other"}
            for r in csv.DictReader(f) if r.get("ticker")
        ]
    log.info("Universe: %d names", len(rows))
    return rows


# Mirrors build_sp500.py's analyze()/_downsample() on purpose; the two builders
# stay independent (repo convention) but MUST emit the same schema.
def _close_on_or_before(series, target):
    best = None
    for d, c in series:
        if d <= target:
            best = c
        else:
            break
    return best


def _downsample(closes, n):
    if len(closes) <= n:
        return [round(c, 2) for c in closes]
    step = (len(closes) - 1) / (n - 1)
    return [round(closes[round(i * step)], 2) for i in range(n)]


def analyze(series) -> dict:
    closes = [c for _, c in series]
    cur, cur_date = closes[-1], series[-1][0]
    low, high = min(closes), max(closes)

    def ret(days=None, target=None):
        if target is None:
            target = cur_date - timedelta(days=days)
        base = _close_on_or_before(series, target)
        return round((cur - base) / base * 100, 2) if base and base > 0 else None

    p1d = round((cur - closes[-2]) / closes[-2] * 100, 2) if len(closes) >= 2 and closes[-2] > 0 else None
    mtd_base = cur_date.replace(day=1) - timedelta(days=1)
    return {
        "price": round(cur, 2),
        "wk52_low": round(low, 2), "wk52_high": round(high, 2),
        "wk52_position": round((cur - low) / (high - low), 3) if high > low else None,
        "perf": {"1d": p1d, "1w": ret(7), "1m": ret(30), "3m": ret(91),
                 "6m": ret(182), "1y": ret(365), "mtd": ret(target=mtd_base)},
        "spark": _downsample(closes, SPARK_POINTS),
    }


def fetch(symbol: str):
    """(series, market_cap) via yfinance; (None, None) on failure."""
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="1y", interval="1d", auto_adjust=True)
        if hist is None or hist.empty or len(hist) < 5:
            return None, None
        series = [(idx.date(), float(row)) for idx, row in hist["Close"].items() if row == row]
        series.sort(key=lambda x: x[0])

        cap = None
        try:
            cap = t.fast_info.get("market_cap") or t.fast_info.get("marketCap")
        except Exception:
            pass
        if not cap:
            try:
                shares = t.fast_info.get("shares")
                if shares and series:
                    cap = float(shares) * series[-1][1]
            except Exception:
                pass
        return (series if len(series) >= 5 else None), (float(cap) if cap else None)
    except Exception as e:  # noqa: BLE001 - any per-ticker failure is a skip, not a crash
        log.warning("%s failed: %s", symbol, e)
        return None, None
    finally:
        time.sleep(RATE_SLEEP)


def main() -> None:
    names = get_universe()
    if LIMIT:
        names = names[:LIMIT]

    out, skipped = [], []
    for i, row in enumerate(names, 1):
        series, cap = fetch(row["yahoo"])
        if not series or not cap:
            skipped.append(row["ticker"])
            continue
        pub = {k: v for k, v in row.items() if k != "yahoo"}
        out.append({**pub, "market_cap": cap, **analyze(series)})
        if i % 10 == 0:
            log.info("…%d/%d (kept %d)", i, len(names), len(out))

    if len(out) < len(names) * 0.6:
        # Yahoo had a bad day - keep yesterday's committed file rather than
        # publishing a half-empty heatmap.
        log.warning("Only %d/%d names built - refusing to overwrite existing data",
                    len(out), len(names))
        raise SystemExit(1)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    if skipped:
        log.warning("Skipped: %s", ", ".join(skipped))
    log.info("Wrote %s (%d names, %d skipped)", OUT_PATH, len(out), len(skipped))
    print(f"✓ FTSE MIB map data -> {OUT_PATH} ({len(out)} names)")


if __name__ == "__main__":
    main()
