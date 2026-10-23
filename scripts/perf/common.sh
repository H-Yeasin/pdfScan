#!/usr/bin/env bash
# §19 X1: shared by the scripts in scripts/perf. Sourced, never run.
#
# Every script writes into perf-results/<date>/<commit>/ (not committed): the numbers go into
# docs/qa/performance.md by hand, with the phone, its Android version and the commit.

set -euo pipefail

PKG="com.yeasin.pdfscan"
ACTIVITY="$PKG/.MainActivity"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
OUT="$ROOT/perf-results/$(date +%Y-%m-%d)/$COMMIT"
mkdir -p "$OUT"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is not installed (scripts/perf/README.md, Tools)." >&2
    exit 1
  }
}

need adb

if [ -z "${ANDROID_SERIAL:-}" ] && [ "$(adb devices | awk 'NR > 1 && $2 == "device"' | wc -l | tr -d ' ')" != "1" ]; then
  echo "Connect exactly one phone (adb devices), or set ANDROID_SERIAL." >&2
  exit 1
fi

# The phone, for the results table: "Samsung SM-A055F, Android 14".
phone() {
  echo "$(adb shell getprop ro.product.manufacturer | tr -d '\r') $(adb shell getprop ro.product.model | tr -d '\r'), Android $(adb shell getprop ro.build.version.release | tr -d '\r')"
}

# Median and quartiles of numbers on stdin, one per line: "median 812 (IQR 790–840, n 10)".
# Quartiles by the nearest-rank method, which is what the comparison rule in performance.md uses.
summarise() {
  sort -n | awk '
    { v[NR] = $1 }
    END {
      if (NR == 0) { print "no values"; exit }
      q1 = v[int((NR + 3) / 4)]; med = (NR % 2) ? v[(NR + 1) / 2] : (v[NR / 2] + v[NR / 2 + 1]) / 2
      q3 = v[int((3 * NR + 3) / 4)]
      printf "median %d (IQR %d-%d, n %d)\n", med, q1, q3, NR
    }'
}
