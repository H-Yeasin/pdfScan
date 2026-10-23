#!/usr/bin/env bash
# §19 X1: cold start, N times (default 10). For each run: force-stop, launch, and read two numbers:
#   TotalTime    `am start -W`: to the first frame, which is still under the splash intro;
#   Fully drawn  Android's own log line when the start screen is usable (src/utils/trace.ts
#                reportFullyDrawn, when the splash intro is gone). This is the one the budget is about.
# Run once first and throw it away (`cold-start.sh 1`): the first start after an install compiles.
# Usage: scripts/perf/cold-start.sh [runs]
source "$(dirname "$0")/common.sh"

RUNS="${1:-10}"
CSV="$OUT/cold-start.csv"
echo "run,total_time_ms,fully_drawn_ms" > "$CSV"

# "+1s383ms" or "+840ms" -> milliseconds.
to_ms() {
  sed -E 's/.*\+(([0-9]+)s)?([0-9]+)ms.*/\2 \3/' | awk '{ print ($2 == "" ? $1 : $1 * 1000 + $2) }'
}

for i in $(seq 1 "$RUNS"); do
  adb shell am force-stop "$PKG"
  sleep 2
  adb logcat -c
  total="$(adb shell am start -W -n "$ACTIVITY" | tr -d '\r' | awk -F': ' '/TotalTime/ { print $2 }')"
  drawn=""
  for _ in $(seq 1 30); do
    line="$(adb logcat -d | tr -d '\r' | grep -m1 "Fully drawn $PKG" || true)"
    if [ -n "$line" ]; then
      drawn="$(echo "$line" | to_ms)"
      break
    fi
    sleep 0.5
  done
  echo "$i,${total:-},${drawn:-}" >> "$CSV"
  echo "run $i: TotalTime ${total:-?} ms, Fully drawn ${drawn:-not logged} ms"
  sleep 3
done

echo
echo "$(phone), commit $COMMIT"
echo "TotalTime:   $(tail -n +2 "$CSV" | cut -d, -f2 | grep -v '^$' | summarise)"
echo "Fully drawn: $(tail -n +2 "$CSV" | cut -d, -f3 | grep -v '^$' | summarise)"
echo "Raw: $CSV"
