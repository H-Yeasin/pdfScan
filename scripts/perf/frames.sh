#!/usr/bin/env bash
# §19 X1: frame times while you scroll (or while a command runs): Android's own count of janky
# frames and the frame-time percentiles, from `dumpsys gfxinfo`, plus the raw per-frame rows
# (framestats: the last 120 frames, each frame's timestamps in ns) for a closer look.
#
# Usage:
#   scripts/perf/frames.sh <label> [seconds] [-- command]
#   scripts/perf/frames.sh files-scroll 10        then fling Files top to bottom and back
source "$(dirname "$0")/common.sh"

LABEL="${1:?label, e.g. files-scroll}"
SECONDS_TO_RECORD="${2:-10}"
case "$SECONDS_TO_RECORD" in
  '' | *[!0-9]*) echo "seconds must be a number (it comes before --)" >&2; exit 1 ;;
esac
shift $(( $# >= 2 ? 2 : $# ))
[ "${1:-}" = "--" ] && shift

adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
if [ $# -gt 0 ]; then
  "$@" || echo "The command failed; the frames are still read." >&2
else
  echo "Recording for $SECONDS_TO_RECORD s: scroll now."
  sleep "$SECONDS_TO_RECORD"
fi

FILE="$OUT/$LABEL-$(date +%H%M%S)-gfxinfo.txt"
adb shell dumpsys gfxinfo "$PKG" | tr -d '\r' > "$FILE"
adb shell dumpsys gfxinfo "$PKG" framestats | tr -d '\r' > "${FILE%.txt}-framestats.txt"

echo "$(phone), commit $COMMIT"
grep -m1 -E "^Total frames rendered" "$FILE" || true
grep -m1 -E "^Janky frames:" "$FILE" || true
grep -m4 -E "^[0-9]+th percentile" "$FILE" || true
echo "Raw: $FILE"
