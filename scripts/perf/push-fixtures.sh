#!/usr/bin/env bash
# §19 X1: puts the test files on the phone.
#   perf-fixtures/pdfscan-300p.pdf  (node scripts/perf/make-fixtures.mjs) -> Download/
#   perf-fixtures/photos/*.jpg      (your 20 photos of the same 20 sheets)  -> Pictures/pdfscan-perf/
# Then the media store is asked to look again, so the photo picker shows the photos.
# Usage: scripts/perf/push-fixtures.sh
source "$(dirname "$0")/common.sh"

FIX="$ROOT/perf-fixtures"
if [ -f "$FIX/pdfscan-300p.pdf" ]; then
  adb push "$FIX/pdfscan-300p.pdf" /sdcard/Download/pdfscan-300p.pdf >/dev/null
  echo "Pushed the 300-page PDF to Download/."
else
  echo "No $FIX/pdfscan-300p.pdf: run node scripts/perf/make-fixtures.mjs first (or use a real textbook)."
fi

shopt -s nullglob
photos=("$FIX"/photos/*.jpg "$FIX"/photos/*.jpeg "$FIX"/photos/*.JPG)
if [ ${#photos[@]} -gt 0 ]; then
  adb shell mkdir -p /sdcard/Pictures/pdfscan-perf
  for photo in "${photos[@]}"; do
    adb push "$photo" /sdcard/Pictures/pdfscan-perf/ >/dev/null
    # One a second apart, so the picker's newest-first order is stable between runs.
    sleep 1
  done
  # Android 11+; older phones pick the files up on the broadcast below, or after a restart.
  adb shell content call --uri content://media/ --method scan_volume --arg external_primary >/dev/null 2>&1 ||
    adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/pdfscan-perf >/dev/null 2>&1 || true
  echo "Pushed ${#photos[@]} photos to Pictures/pdfscan-perf/."
else
  echo "No photos in $FIX/photos/: take 20 photos of the same 20 sheets once, and keep them there."
fi
