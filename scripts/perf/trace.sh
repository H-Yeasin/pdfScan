#!/usr/bin/env bash
# §19 X1: a Perfetto system trace of one run of a journey, pulled to perf-results/. Open it in
# https://ui.perfetto.dev (it stays in your browser) and search "pdfscan.".
#
# Usage:
#   scripts/perf/trace.sh <label> [seconds] [-- command]
# With a command (a Maestro flow), the trace starts, the command runs, and the trace ends after
# `seconds`. Without one, do the journey by hand while it records.
#   scripts/perf/trace.sh j2 30 -- maestro test .maestro/j2-find.yaml
#   scripts/perf/trace.sh j1-scanner 60
# Android 9 and 10 need tracing switched on once: adb shell setprop persist.traced.enable 1
source "$(dirname "$0")/common.sh"

LABEL="${1:?label, e.g. j2}"
SECONDS_TO_RECORD="${2:-30}"
case "$SECONDS_TO_RECORD" in
  '' | *[!0-9]*) echo "seconds must be a number (it comes before --)" >&2; exit 1 ;;
esac
shift $(( $# >= 2 ? 2 : $# ))
[ "${1:-}" = "--" ] && shift

DEVICE_FILE="/data/misc/perfetto-traces/pdfscan-$LABEL.perfetto-trace"
LOCAL_FILE="$OUT/$LABEL-$(date +%H%M%S).perfetto-trace"

sed "s/DURATION_MS/$((SECONDS_TO_RECORD * 1000))/" "$(dirname "$0")/perfetto.pbtx" |
  adb shell perfetto --txt -c - -o "$DEVICE_FILE" &
TRACER=$!
# Give the tracer a moment to start before the journey does.
sleep 2

if [ $# -gt 0 ]; then
  echo "Running: $*"
  "$@" || echo "The command failed; the trace is still kept." >&2
else
  echo "Recording for $SECONDS_TO_RECORD s: do the journey now."
fi

wait "$TRACER" || true
adb pull "$DEVICE_FILE" "$LOCAL_FILE" >/dev/null
adb shell rm -f "$DEVICE_FILE" >/dev/null 2>&1 || true
echo "$(phone), commit $COMMIT"
echo "Trace: $LOCAL_FILE"
