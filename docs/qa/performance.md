# Performance budget (§9 O5)

Checked before each release on a **mid-range Android phone** with a **release build**
(`npx expo run:android --variant release`). Record the phone, the build's commit, and the date with
each set of numbers. A budget that's missed blocks the release, or gets a written reason here.

## Budgets

| # | Budget | Target |
|---|---|---|
| 1 | Cold start (median of 5) | under 2 s |
| 2 | Library and Course scroll, 500 documents | 60 fps, no more than 5 % dropped frames |
| 3 | Typing in Library search | results update within 150 ms |
| 4 | A scan's progress updates | re-render only the progress UI |
| 5 | Memory while processing a 20-page scan | under 350 MB |

## How to measure

**Seed the library first:** Settings → Developer → Filter Lab → **Seed library (500 docs)**
(`src/dev/seedLibrary.ts`, dev builds only). It adds 8 courses and 500 one-page PDFs with
thumbnails, OCR text, bookmarks (every 5th) and submissions (every 7th) through the normal actions,
so they're saved like real documents. Do this in a dev build, then install the release build over it
(same package, the data stays). Remove them afterwards from the Library (select, Delete).

1. **Cold start:** force-stop, then
   `adb shell am start -W -n com.yeasin.pdfscan/.MainActivity` and read `TotalTime`. 5 runs,
   median. The splash stays up until the start screen is drawn (§9 O1), so TotalTime plus the
   splash hide is what the user waits; also note the time to the first usable screen from a screen
   recording.
2. **Scroll:** Developer options → "Profile HWUI rendering" → "On screen as bars", and the RN perf
   monitor (dev menu) for the JS frame rate. Fling the Library (All tab) top to bottom and back,
   then a course with ~60 documents. For dropped frames: `adb shell dumpsys gfxinfo com.yeasin.pdfscan reset`,
   scroll for 10 s, then `adb shell dumpsys gfxinfo com.yeasin.pdfscan` → "Janky frames".
3. **Search:** React DevTools Profiler, type "matrix" in Library search; time from the last
   keystroke's commit to the commit that shows results (the search debounce is 200 ms, so measure
   from the debounce firing).
4. **Scan progress:** React DevTools Profiler (dev build) while a 10-page gallery import runs:
   only the progress UI and the thumbnail strip's new tiles should commit on each tick.
5. **Memory:** Android Studio Profiler → Memory, or `adb shell dumpsys meminfo com.yeasin.pdfscan`
   (TOTAL PSS) at the peak of a 20-page scan's processing.

## What's in place (code, 2026-10-02)

- **Selector store** (`store/AppStateContext.tsx`): state in an external store; components read
  slices with `useAppSlices` / `useAppSelector`, so an action re-renders only the components
  reading what it changed. Every `useAppState()` caller was moved; `useAppState()` remains for
  compatibility (and re-renders on everything).
- **Lists:** `FileRow` and Review's thumbnails are `React.memo` with stable handlers
  (`utils/useStableCallback`); a row reads only its own document's indexing progress. The
  Library and Course lists use `DOC_LIST_TUNING` (`components/library/docListTuning.ts`). Rows vary
  in height, so there's no `getItemLayout`.
- **Cold start:** the start screen is chosen behind the splash (§9 O1). The integrity check,
  imported-PDF indexing, stale reminder clean-up and Sentry init wait until 1.5 s after the first
  screen (`bootstrap/useDeferredBoot.ts`). SheetJS and mammoth load on first use.

## Open decisions (decide from the numbers)

- **pdf-lib + fontkit** are imported at module level by about ten services (save, tools, text
  layer). If cold start is over budget, make them lazy like `sheetService`'s `XLSX()`; or try Metro's
  `inlineRequires` globally (Expo leaves it off; turning it on changes module side-effect order, so
  test the whole app).
- **FlashList / expo-image:** add only if budget 2 is missed after the selector change. Record the
  before/after numbers here.

## Results

| Date | Phone | Commit | Cold start (median) | Library jank % | Course jank % | Search | Scan progress | Memory (20 pages) |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## §10 M5: ads before and after

The ads SDK starts only after the first frame and only when a banner could show (ads on in
Remote Config, introduction done, third start or later, no Pro pass), so cold start should not
move. Measure it anyway, on the same phone, with a release build:

- **Before:** the commit before M5 (`80456a1`). **After:** the M5 commit, with `ads_enabled` on
  and a third start (so the SDK and consent step run), and once with `ads_enabled` off.
- Cold start as in "How to measure" (median of 5). Budget: still under 2 s.
- APK size: `ls -l` of the release APK (or the AAB's download size in Play Console).

| Date | Phone | Build | Cold start, ads off | Cold start, ads on | APK size |
|---|---|---|---|---|---|
| | | before M5 (`80456a1`) | | n/a | |
| | | M5 | | | |
