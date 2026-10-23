#!/usr/bin/env bash
# §19 X1: the app's memory (TOTAL PSS, in MB) once a second, to a CSV, until `seconds` pass or you
# press Ctrl-C; then the peak. Run it during a 20-page save (budget: under 350 MB), on Files after a
# cold start, and in the Reader after flinging a 300-page PDF.
# Usage: scripts/perf/meminfo.sh <label> [seconds]
source "$(dirname "$0")/common.sh"

LABEL="${1:?label, e.g. save20}"
SECONDS_TO_RECORD="${2:-120}"
CSV="$OUT/$LABEL-$(date +%H%M%S)-meminfo.csv"
echo "second,pss_mb" > "$CSV"

finish() {
  echo
  echo "$(phone), commit $COMMIT"
  echo "Peak PSS: $(tail -n +2 "$CSV" | cut -d, -f2 | sort -n | tail -1) MB"
  echo "Raw: $CSV"
  exit 0
}
trap finish INT

for s in $(seq 0 "$SECONDS_TO_RECORD"); do
  # "TOTAL PSS:  123456 ..." (Android 11+) or "TOTAL  123456 ..." (older); in KB.
  kb="$(adb shell dumpsys meminfo "$PKG" | tr -d '\r' | awk '/^ *TOTAL PSS:/ { print $3; exit } /^ *TOTAL +[0-9]/ { print $2; exit }')"
  if [ -n "$kb" ]; then
    mb=$((kb / 1024))
    echo "$s,$mb" >> "$CSV"
    printf '\r%3d s  %4d MB' "$s" "$mb"
  else
    printf '\r%3d s  (app not running)' "$s"
  fi
  sleep 1
done
finish
