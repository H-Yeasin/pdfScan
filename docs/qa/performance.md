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

Since §19 (2026-10-23) these budgets, and the Reader's, are measured per journey on a students'
phone with the scripts in `scripts/perf/`: see "§19: the three journeys" at the end of this file.

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
  Library and Course lists used `DOC_LIST_TUNING` (`components/library/docListTuning.ts`) until §16 G6 moved them to FlashList. Rows vary
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

## §16 G9: before and after §16–§18

The numbers that say whether §16–§18 made the app fast. Same phone for every row (a mid-range
Android phone, about 4 GB of RAM, Android 13 or 14), **release builds**, the seeded library (500
documents **with word boxes**: Filter Lab → "Seed with word boxes"; a page of the seed carries 250
words in paragraphs, about 25 KB of boxes, like a real page). Seed in a dev build of the same commit,
then install the release build over it.

Waves (one row each in the tables below; write the commit you built):
- **Before §16:** `3d93dcc` (G1 only: safe to run, everything else as it was). The plan wanted this
  before G2; G2–G8 are already in, so build it from that commit. It predates schema v17 and v18: seed
  it on its own, in a fresh install (uninstall first), not over a newer database. Its Filter Lab has
  only "Seed library" (60 words a page, no word boxes: G4 and G9 added the rest), so its row is
  measured on that lighter library; say so in the row. If it can't be built any more, write "n/a"
  and use the oldest §16 row instead.
- **After §16:** G9's commit (G2–G8 in).
- **Release candidate:** after §17 U14 and §18's device checks, the build that goes to Play.

**Dev aid, not the measurement:** Settings → Developer → **Performance overlay** (`src/dev/PerfOverlay.tsx`,
dev builds only) shows the JS frame rate over the last second and the slowest JS frame since a reset,
the time since the process started, when the JS bundle began to run and when the first screen was up
(`utils/perfMarks.ts` 'firstScreen'; the splash intro can still be over it), the JS heap, and G5's render
counts. Tap it to reset. Use it to find what moved; its frame rate is the **JS** thread (a
`requestAnimationFrame` counter), and a dev build is slower everywhere, so the table takes the release
build's numbers from the tools below.

How to measure each column (5 runs, write the median; force-stop between cold runs:
`adb shell am force-stop com.yeasin.pdfscan`):

1. **Cold start:** `adb shell am start -W -n com.yeasin.pdfscan/.MainActivity` → `TotalTime`, and a
   screen recording (`adb shell screenrecord /sdcard/start.mp4`) from the launcher tap to the first
   frame where Home is fully shown with the splash intro gone (Remove animations **on**, so the intro
   is skipped and the rows compare). Write the recording's number; `TotalTime` ends earlier since §15 V5.
   Verification 4: at least 30% faster than the "Before §16" row.
2. **Files scroll:** Files, All, list view. `adb shell dumpsys gfxinfo com.yeasin.pdfscan reset`, fling
   top to bottom and back for 10 s, then `adb shell dumpsys gfxinfo com.yeasin.pdfscan` → "Janky frames"
   (%) and "90th percentile". Budget: ≤ 5% (Verification 7). Note any blank rows after the first frame.
3. **Reader open:** from Files, tap a seeded document; from the recording, the tap to the first sharp
   page. Then the same for a 300-page imported PDF (`[300p]` in 18-reader.md): §18's budget is ≤ 1.2 s
   cold (the first open after a cold start), ≤ 600 ms warm (the second). The "Before" build uses
   react-native-pdf-jsi; write its numbers anyway.
4. **20-page scan to Review:** scan 20 pages in the Google scanner (the same 20 sheets each run, Doc
   mode); from the recording, the scanner's "Save" tap to the first page shown in Review, and to all
   20 shown. G7 expects the first within about 1 s (Verification 8).
5. **Save of 20 pages:** in Review, the Save tap → the Done screen (Save screen defaults, OCR on). In
   the "Before" build, the save button → the Library.
6. **Memory:** `adb shell dumpsys meminfo com.yeasin.pdfscan` → TOTAL PSS, (a) idle on Files after a
   cold start, (b) the peak during step 5 (run it every second:
   `while true; do adb shell dumpsys meminfo com.yeasin.pdfscan | grep "TOTAL PSS"; sleep 1; done`),
   (c) on page 50 of `[300p]` after a fling. Budgets: under 350 MB during a scan (budget 5), < 350 MB
   steady in the Reader (§18).

| Date | Phone | Wave (commit) | Cold start (recording / TotalTime) | Files jank % (p90 ms) | Reader: seeded doc | Reader `[300p]` cold / warm | Scan → first page / all 20 | Save 20 pages | PSS idle / Save peak / Reader |
|---|---|---|---|---|---|---|---|---|---|
| | | Before §16 (`3d93dcc`) | | | | | | | |
| | | After §16 | | | | | | | |
| | | Release candidate | | | | | | | |

Also note, with each row: the APK size (§16 G8), and anything that felt slow that the columns don't
show. A budget that's missed on the release candidate blocks the release or gets a written reason here.

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

## §16 G8: R8 and resource shrinking

Release builds only. **Before:** the commit before G8 (R8 off). **After:** G8, after
`npx expo prebuild --clean --platform android`. Build both the same way (`docs/build.md` §8, locally:
`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`, and `./gradlew bundleRelease` for the
AAB), on the same machine.

- Sizes: `ls -l` of `app-release.apk` (arm64 only) and `app-release.aab`.
- Cold start as in "How to measure" (median of 5). R8 shouldn't slow it; it may help a little.
- Then the walkthrough (§16 Verification 9): scan → OCR → save → share, a banner and a rewarded ad,
  Remote Config (change a value, restart), a crash report with reports on, the Reader (a PDF, a scan,
  DOCX, XLSX, TXT), Convert to Word. Keep `adb logcat` open the whole time and look for
  `ClassNotFoundException`, `NoSuchMethodError` and `NoSuchFieldError`. A rule that fixes one goes under
  `android.extraProguardRules` in `app.json` (16-speed.md G8, As built).
- Keep `android/app/build/outputs/mapping/release/mapping.txt` for each release you ship.

| Date | Phone | Build | APK (arm64) | AAB | Cold start | Walkthrough clean? (what broke, which rule fixed it) |
|---|---|---|---|---|---|---|
| | | before G8 | | | | n/a |
| | | G8 | | | | |

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

## §16 G4: the boot waterfall

Needs a new dev build first (`npx expo prebuild`, then rebuild): the fonts are embedded on Android.
After it, check that every screen still shows Caprasimo (headings) and Figtree (everything else),
in a cold start with no Metro connection too.

Measured in Node, not on a phone yet (the sqlite test mock; 500 documents × 4 pages × 250 words,
median of 7 loads):

| Library | `ocr_json` | Load before G4 | `loadAll` now |
|---|---|---|---|
| Text only (no word boxes) | 0 MB | 4 ms | 5 ms |
| With word boxes | 52.6 MB | 132 ms | 6 ms |

On a phone (§16 Verification 4–5):
- cold start to the first usable screen, against the baseline (30% faster, with G3);
- **boot doesn't grow with OCR size:** Settings → Filter Lab → "Seed library", cold start three
  times and note the median; delete the seeded documents, then "Seed with word boxes" and do the
  same. The two medians should match within the run-to-run spread;
- with the word-box library: search still finds words; open a seeded document, **Select text**
  picks single words and Mark mode's highlighter snaps to them (the boxes loaded when the Reader
  opened); merge two seeded documents, reopen the app, and Select text still picks words in the
  result (boxes that were never loaded survive a save);
- share a merged or compressed document as a PDF and search inside it in another app (its text
  layer comes from boxes loaded during the build).

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

## §16 G5: render counts

Dev build. Settings → Developer → **Performance overlay** (called "Render counts" before §16 G9)
shows a small overlay with, under G9's frame and start-up lines, how often each counted component
rendered since it was turned on (AppNavigator, BootEffects, ScreenStack, TabBar,
Home, Library, Course, SearchBar, FileRow); a name whose count just moved is in the accent colour.
Tap the overlay to set the counts back to zero, do one gesture, and read it.

Expected (§16 Verification 6), on the 500-document seeded library:

| Gesture | May move | Must not move |
|---|---|---|
| Type one letter in Library search | SearchBar, Library, FileRow (the rows whose snippet or place changed) | AppNavigator, BootEffects, ScreenStack, TabBar, Home |
| Long-press a row, then tap a second one | Library, FileRow (2 per tap at most), ScreenStack (once, the tab bar gives way) | AppNavigator, BootEffects, Home |
| An imported PDF being indexed (progress ticks) | FileRow (that one row); BootEffects, Library and Home only when pages are saved (every few pages) | AppNavigator, ScreenStack, TabBar |
| Scan progress during ingest | none of the counted ones except on page added | AppNavigator |

| Date | Phone | Build | One letter typed | One selection tap | Notes |
|---|---|---|---|---|---|
| | | | | | |

## §18 W7: pdf-native version 2

Settings → Developer → **Reader Lab**, on the dev build made after W7 (the first line must say
"pdf-native version 2"). Use a release-like build for the numbers if you can; a dev build's are upper
bounds. Pick `[300p]`, tap **Open**, set a page, tap **Time page + tile**: each measure runs three
times; write down the middle one.

- **Text page / image page:** pick a page that is mostly text, then one that is mostly a picture.
- **Open:** tap Open again for a second and third number (the lab closes the document first).
- Expected from the plan's risk notes: about 50–150 ms for a text page, 200–500 ms for an image-heavy
  one; `openDocument` on 300 pages ≤ 150 ms (the lab shows it in red above that).

| Date | Phone | Build | Open `[300p]` | Text page, 1080 px | Text page, 4× tile | Image page, 1080 px | Image page, 4× tile | Session text | Old `renderPage` |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

Checks (yes / no, with a note):

| Date | Phone | Annotations: pdfium draws the highlight, old `renderPage` doesn't | Turned PDF: size and tile the right way up | `[pw]` opens; wrong password → `PdfWrongPasswordError`; none → `PdfEncryptedError` | Links and outline listed | Colour matrix (inverted image) | Image decode + region | Works again after 60 s idle | Rotation unlock under `"portrait"` |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

## §19: the three journeys on the students' phones

`docs/plan/19-measure.md` has the why. These are the numbers that decide what gets fixed (§19 X2) and
whether a fix stays (X3). How to build, set up and run everything: `scripts/perf/README.md`.

**Phones:** (a) a 2–3 GB entry Android phone, the kind most students carry; (b) the ~4 GB phone of the
sections above. **Builds:** release, profileable, one named commit per row. Every row says which phone,
its Android version and the commit (`scripts/perf/*.sh` print all three). With a real textbook in place
of `pdfscan-300p.pdf`, say which.

### Budgets

Written before the numbers. They hold on phone (a); a miss blocks the release or gets a written reason.

| # | Budget | Target | Read from | From |
|---|---|---|---|---|
| 1 | Cold start to a usable start screen | median under 2 s | `cold-start.sh` "Fully drawn" | §9 O5 budget 1 |
| 2 | Files scroll, 500 documents | ≤ 5 % janky frames | `frames.sh` | O5 budget 2, §16 |
| 3 | Search answer after the debounce | under 150 ms | the trace: `files.search` | O5 budget 3 |
| 4 | Memory during a 20-page save | under 350 MB PSS | `meminfo.sh` peak | O5 budget 5 |
| 5 | Reader, `[300p]` open → first image | ≤ 1.2 s cold, ≤ 600 ms warm | the trace: `nav.reader` → `reader.firstImage` | §18 |
| 6 | Reader memory after flinging `[300p]` | under 350 MB PSS | `meminfo.sh` | §18 |
| 7 | Photos handed over → first page in Review | about 1 s | the trace: `scan.batch` start → `scan.firstPage` | §16 G7 |
| 8 | Tap → first visible change | under 100 ms | a second phone filming at 240 fps, or the trace's input event → the next frame | §19 |
| 9 | An unsaved scan survives the app being killed | the pages are still in Review | the "killed while scanning" run below | §19 |
| 10 | J1 by a first-time student | 4 of 5 finish unaided, in under 90 s | `docs/qa/usability-study.md` | §9 O6, §19 |

**Keeping a change (X3):** 10 runs before and 10 after, same phone, same build settings, only the
change between the two commits. It counts when the after-median is outside the before-IQR
(`scripts/perf/common.sh` `summarise` prints both). Otherwise it's noise, and the change goes.

### Trace vocabulary

What the app writes into a release build's trace (`src/utils/trace.ts`). In ui.perfetto.dev, search
`pdfscan.` plus the name. A **mark** is a moment (a thin slice on the JS thread); a **stretch** is an
async slice from its start to its end. Names never carry document text.

| Name | Kind | Where | What it brackets |
|---|---|---|---|
| `boot.firstScreen` | mark | `AppNavigator` | boot done: the start screen is chosen and drawn, under the splash intro |
| `boot.usable` | mark | `SplashIntro` (`reportFullyDrawn`) | the intro is gone: the start screen is what the student sees ("Fully drawn") |
| `boot.loadLibrary` | stretch | `useLibraryPersistence` | opening the database and reading the library |
| `nav.<screen>`, `tab.<tab>`, `nav.back` | mark | `navigation/router.tsx` | a change of screen asked for (the tap that caused it is just before) |
| `scan.batch` | stretch | `ingestBatch` | the scanner or the picker hands the images over → every page is in the session |
| `scan.page` | stretch | `ingestBatch` | one page: master and thumbnail (and auto-crop for photos) |
| `scan.firstPage` | mark | `ingestBatch` | the first page goes into Review |
| `scan.readPage` | stretch | `ingestBatch` (readTexts) | one page's filter stats and text, after the batch |
| `save` | stretch | `saveScan` | the whole save, from the Save tap |
| `save.render`, `save.ocr`, `save.pdf`, `save.files` | stretch | `saveScan` | a page's render; reading its text; building `document.pdf`; moving the files into the library |
| `pdf.open` | stretch | `pdfNative.openDocument` | pdfium opening a PDF |
| `reader.render` | stretch | `useRenderQueue` | one page or tile render |
| `reader.firstImage` | mark | `useRenderQueue` | the open document's first rendered image |
| `files.search` | stretch | `LibraryScreen` | the full-text query, from the debounce to its answer |

Reading a journey off its trace: **J1** `scan.batch` (start → `scan.firstPage` → end), then `save` →
`nav.done`; **J2** `tab.library` → `files.search` → `nav.reader` → `reader.firstImage`; **J3**
`nav.reader` → `pdf.open` → `reader.firstImage`, then the flings' frames and `reader.render`s. Long
slices on the app's main thread or `mqt_js` in between are where the time goes.

### Stress runs

On phone (a), by hand, once each per release candidate.

| Run | How | What to write down |
|---|---|---|
| Killed while scanning | Developer options → "Don't keep activities" on. Scan 5 pages; in Review, switch to WhatsApp and back; then "Scan more" and come back | Are the pages still in Review? (budget 9) |
| Little storage | Fill the phone until about 1 GB is free (`adb shell df -h /data`), then J1 with the 20 photos | Does the app warn before the scan? Does a save that runs out fail cleanly, with nothing half-written? |
| Battery saver | On; J1 (timed) and J3 | The times, against a normal run |
| Heat | Three J1 timed runs back to back, then a `trace.sh` of the fourth | The fourth's times; CPU frequency in the trace |
| Memory pressure | J3 open, `adb shell am send-trim-memory com.yeasin.pdfscan RUNNING_CRITICAL`; then Home, `... COMPLETE`, and back | The Reader comes back sharp; nothing is lost |

| Date | Phone | Commit | Killed while scanning | Little storage | Battery saver (J1 / J3) | Heat (4th J1) | Memory pressure |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### Results

Medians of 10 (J1 by hand: of 5), with the IQR where the script prints one.

| Date | Phone | Commit | Cold start: Fully drawn / TotalTime | J1: photos → first page / all 20 | J1: Save → Done | J1 by hand: scanner Save → Review / Submit sent | J2: search answer / tap → first image | Files jank % (p90 ms) | J3: open → first image, cold / warm | J3 fling jank % | Peak PSS: save / Reader | KB per page | APK MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | (a) | | | | | | | | | | | | |
| | (b) | | | | | | | | | | | | |
