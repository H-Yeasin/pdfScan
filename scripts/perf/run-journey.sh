#!/usr/bin/env bash
# §19 X1: a journey's Maestro flow, run N times (default 10) under Flashlight, which reads the
# app's CPU per thread (JS, UI), FPS and RAM while it runs and writes a JSON result. Compare two
# results (before and after a change, or two phones) with:
#   flashlight report perf-results/<date>/<a>/j2.json perf-results/<date>/<b>/j2.json
# Usage: scripts/perf/run-journey.sh <j1-gallery-scan|j2-find|j3-big-pdf> [runs]
# Flags differ between Flashlight versions: check `flashlight test --help` if one is refused.
source "$(dirname "$0")/common.sh"
need maestro
need flashlight

FLOW="${1:?flow name, e.g. j2-find}"
RUNS="${2:-10}"
FLOW_FILE="$ROOT/.maestro/$FLOW.yaml"
[ -f "$FLOW_FILE" ] || { echo "No flow $FLOW_FILE" >&2; exit 1; }

flashlight test \
  --bundleId "$PKG" \
  --testCommand "maestro test $FLOW_FILE" \
  --iterationCount "$RUNS" \
  --resultsTitle "$FLOW $COMMIT" \
  --resultsFilePath "$OUT/$FLOW.json"

echo "$(phone), commit $COMMIT"
echo "Result: $OUT/$FLOW.json   (open it with: flashlight report $OUT/$FLOW.json)"
