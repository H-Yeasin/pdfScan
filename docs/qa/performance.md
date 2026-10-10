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

Dev build. Settings → Developer → **Render counts** shows a small overlay with how often each
counted component rendered since it was turned on (AppNavigator, BootEffects, ScreenStack, TabBar,
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
