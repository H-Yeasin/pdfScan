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
  layer). **Decided in §16 G3 (2026-10-10):** the services keep their imports, and everything on
  the boot path (the store, the boot hooks, the start screens) reaches them through a lazy
  `require`; the screens themselves load on first render. `src/__tests__/bootImports.test.ts` keeps
  it that way. Still open: Metro's `inlineRequires` globally (Expo leaves it off; turning it on
  changes module side-effect order, so test the whole app), only if G9's numbers ask for it.
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

## §16 G3: the boot diet

Measured on the release bundle, not on a phone yet (`npx expo export --platform android --no-minify
--no-bytecode`, then the modules reachable from the bundle's entry points through top-level
requires, which is what runs before the first screen):

| | Modules run at startup | Their source |
|---|---|---|
| Before G3 (`bb4dbf2`), any start screen | 2,301 of 3,078 | 12.1 MB of 16.5 MB |
| After, starting on Home | 1,854 | 9.0 MB |
| After, starting on Capture | 1,751 | 8.6 MB |
| After, starting on Onboarding | 1,705 | 8.5 MB |

On a phone (the "Cold start" row above, before and after G3, same release build settings):
- cold start to the first usable screen, on Home and on Capture (§16 Verification 4 asks for 30%
  with G4);
- **the first open** of the Reader, Review and Deliver after a cold start, against the second open:
  those screens' modules (pdf-jsi and the WebView; pdf-lib) now load then. If the first open
  stutters, preload after `useDeferredBoot` (see `docs/plan/16-speed.md` G3).

## §15 V5: the splash intro

The native splash now goes as soon as the intro's overlay has drawn its first frame (an identical
still logo); the app boots underneath, and the overlay leaves once boot is done and the intro has
played (about 1.1 s from the release) or been skipped. Measure on the same phone, release build:

- **Time to the first usable screen**, from a screen recording (step through it frame by frame):
  from the tap on the launcher icon to the first frame where the start screen is fully shown (the
  overlay gone). `am start -W` `TotalTime` too, as in "How to measure" (it now ends when the overlay
  is first drawn, earlier than before, so it isn't comparable with the rows above).
- **Intro skipped** (Settings → Accessibility → "Remove animations" on): must not be worse than
  before V5 (the overlay's exit is a 150 ms crossfade; before it was the native splash's 400 ms
  fade). **Intro played:** at most about 1.1 s more than the boot, and nothing when boot is slower.
- Also check in the recording: no jump or colour flash where the native splash hands over (light and
  dark system mode), and the overlay doesn't stutter while the app boots underneath.

| Date | Phone | Build | First usable screen, before V5 | Intro skipped | Intro played | Handoff clean (light / dark) |
|---|---|---|---|---|---|---|
| | | | | | | |
