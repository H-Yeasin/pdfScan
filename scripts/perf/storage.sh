#!/usr/bin/env bash
# §19 X1: what a saved scan costs the phone's storage: the size of each document's folder
# (files/library/<docId>/: page images, display copies, thumbnails, document.pdf) and of the app's
# whole data, so "MB per page" can go in performance.md. Save the 20-page J1 scan first.
#
# Needs a dev build: `run-as` only works on a debuggable app. The files are the same in a release
# build (same code, same image specs), so the numbers carry over.
# Usage: scripts/perf/storage.sh
source "$(dirname "$0")/common.sh"

FILE="$OUT/storage-$(date +%H%M%S).txt"
{
  echo "$(phone), commit $COMMIT"
  echo
  echo "Each document folder (KB), largest first:"
  adb shell run-as "$PKG" sh -c "'du -sk files/library/*/ 2>/dev/null | sort -rn | head -20'"
  echo
  echo "The app's data (KB):"
  adb shell run-as "$PKG" sh -c "'du -sk files cache databases 2>/dev/null'"
} | tr -d '\r' | tee "$FILE"
echo
echo "Divide the newest document's KB by its page count for KB per page. Raw: $FILE"
