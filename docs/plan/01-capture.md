# §1 Capture: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement C1 from docs/plan/01-capture.md".
- Read `AGENTS.md` (auto-loaded) and only the step you are implementing; open only the files it
  names unless something unexpected comes up.
- **Prerequisite:** §0 (`docs/plan/00-foundation.md`) must be done first (see below).
- When you finish a step, update its `Status:` line (`done (commit <sha>)`) and tick it in
  `docs/PLAN.md`. If the code no longer matches what a step describes, fix the step text too.

## Context
§1 makes capture the best it can be for school material: notes, documents, boards, books and
ID cards, plus batch import from the gallery.

### What the code looks like today (checked while planning)
- `CaptureScreen` is a placeholder screen with a Scan button that opens **Google's ML Kit
  Document Scanner**, a full-screen system UI we can't change, through
  `react-native-document-scanner-plugin@2.0.4`. Its Android module hard-codes
  `SCANNER_MODE_FULL` and `RESULT_FORMAT_JPEG`, and accepts only `maxNumDocuments`,
  `croppedImageQuality` and `responseType`. The options are a typed codegen struct
  (`src/NativeDocumentScanner.ts`), so a new option needs a spec change plus a native change,
  done through `patch-package`. The `postinstall` hook already exists, but there is no
  `patches/` folder yet. On iOS the plugin uses VisionKit's document camera.
- `CaptureMode = 'doc' | 'id' | 'book'` and `capture/SET_MODE` already exist, but **nothing
  ever sets the mode**. It is always `'doc'`, and it is only copied onto `LibraryDocument.mode`.
- Gallery import (`CaptureScreen.addPagesFromAssets`) adds raw photos with no edge detection,
  no downscale and no OCR.
- `runNativeScannerPipeline` commits all pages in one batch at the end. `AppNavigator` moves to
  Review as soon as the status becomes `processing`, and the user sees no per-page progress.
- Reusable pieces: `enhance/perspective.ts` (`quadToQuadMatrix`),
  `perspectiveCrop.warpPerspectiveCrop(uri, quad)`, `review/CropOverlay` (manual quad editor),
  `compositeHalfPages` and `fitBox` (layout), the `skiaEnhance` Skia surface pattern, and the
  `document_scan` (Sauvola black-and-white) enhance mode.

### Key design decision
**Keep Google's scanner as the main camera.** It already has the best edge detection,
auto-capture and "clean" tools (removing fingers, stains and shadows), it is free, and Google
maintains it. Rebuilding that is not worth the effort now.

Our "modes" are therefore chosen on **our** Capture screen *before* the scanner opens. Each mode
then controls:
- the scanner options (page limit, gallery import);
- our post-processing (split a book spread, compose an ID card);
- the default filter;
- the document type used for naming.

A fully custom live camera, for phones without Google Play services and for a consistent UI on
iOS, stays in **P3** (C7 only adds a light fallback).

**Prerequisites:** §0, specifically F1 (tests), F5 (`ingestPage`, masters, rotation stored as
a setting) and F4 (Course model, for document type and naming).

---

## Steps

### C1 · Capture mode registry and mode picker *(M)*
Status: done (commit 2249a8a). Device check pending: scan in Notes → B&W in Review; mode kept after restart.

- New `src/services/capture/captureModes.ts`, which becomes the single source of truth:
  ```ts
  type CaptureModeSpec = {
    id: CaptureMode; label: string; icon: IoniconName; hint: string;
    defaultEnhance: EnhanceMode;          // until §2 adds 'ink' / 'board'
    pageLimit?: number;                   // passed to the scanner
    postProcess: 'none' | 'splitSpread' | 'idCard';
    docType: 'notes' | 'document' | 'board' | 'book' | 'id';
  };
  ```
  The modes, in this order:

  | Mode | Default filter | Page limit | Post-processing |
  |---|---|---|---|
  | **Notes** | `document_scan` | 50 | none |
  | **Document** | `auto` | 50 | none |
  | **Board** | `color` | 20 | none |
  | **Book** | `auto` | 50 | `splitSpread` |
  | **ID card** | `color` | 2 | `idCard` |

- Widen the type in `src/types/models.ts` to
  `CaptureMode = 'notes' | 'doc' | 'board' | 'book' | 'id'`. Old saved documents keep
  `'doc'`, `'id'` and `'book'`, so no migration is needed.
- UI: a horizontal row of mode labels above the scan button in
  `components/capture/CaptureControls.tsx`, styled like a camera app (swipe or tap, the active
  mode in `chrome.accent`). The title and hint in `CaptureScreen`'s centre area come from
  `spec.hint`, for example "Lay the page flat. Pencil works too."
- Persistence: add `lastCaptureMode` to `PersistedSettings` (`settingsStorage.ts`) and
  `settingsSlice`. `CaptureScreen` dispatches `capture/SET_MODE` on mount from that value.
- Pages added by a scan get `enhance: spec.defaultEnhance` inside `ingestPage` /
  `scannerPipeline` instead of the hard-coded `'auto'`.
- Change the auto-launch on mount (`hasAutoLaunched`) so it only happens after the user has
  picked a mode once (`settings.firstRun`). Otherwise the mode picker would never be seen
  before the scanner covers the screen.
- Tests: the registry is complete (every `CaptureMode` has a spec); the reducer's `SET_MODE`;
  the default filter is applied on ingest.

**Done when:** choosing "Notes" and scanning produces pages that open in Review with the
black-and-white filter, and the chosen mode is still selected after restarting the app.

### C2 · Scanner plugin options patch *(S)*
Status: done (commit ab4d8be). Patch applies on `npm ci`; device check pending (Android build, gallery button, ID card stops at 2).

- `patch-package` patch for `react-native-document-scanner-plugin`:
  - In the spec (`src/NativeDocumentScanner.ts`), add the optional fields
    `galleryImportAllowed?: boolean` and `scannerMode?: 'base' | 'baseWithFilter' | 'full'`.
  - In the Android code (`DocumentScannerModule.kt`), map them to
    `setGalleryImportAllowed(...)` and `setScannerMode(...)`, keeping `FULL` as the default.
  - Generate it with `npx patch-package react-native-document-scanner-plugin`; the result is
    `patches/react-native-document-scanner-plugin+2.0.4.patch`.
- `scannerPipeline.runNativeScannerPipeline(dispatch, script, spec)` passes
  `maxNumDocuments: spec.pageLimit` and `galleryImportAllowed: true`. This lets students pull
  WhatsApp photos into Google's scanner and get its edge detection.
- iOS ignores these options (VisionKit), which is fine.
- Add a "Patched dependencies" note to AGENTS.md so future upgrades re-check the patch.

**Done when:** `npm install` applies the patch cleanly, the Android scanner shows its "Import
from gallery" button, and ID card mode stops after 2 pages.

### C3 · Book mode: split two-page spreads *(M)*
Status: done (commit 15d95c9). Pure maths in `enhance/gutter.ts`, Skia in `enhance/splitSpread.ts`, pipeline hook `ingestBatch.ingestOne`; Undo split keeps the spread on both halves (`SessionPage.splitFrom`). Progress counts captures (spreads), not output pages. Device check pending: 5 spreads → 10 pages, gutter hit ≥ 9/10.

- New `src/services/enhance/splitSpread.ts`: `splitSpread(uri) → [left, right]`.
  - Find the gutter with Skia: draw the page into a small offscreen surface about 256 px wide,
    read the pixels, compute the average brightness of each column in the middle 40 % of the
    width, and take the darkest column (the binding shadow).
  - If the dip isn't strong enough (contrast below a threshold), fall back to the exact centre.
  - Then crop both halves from the **master**, using one Skia pass and one encode per half (the
    same pattern as `bakeEnhance`).
- Only split images in landscape orientation (width > height × 1.15). A portrait image is
  treated as a single page and left whole.
- Hook it into the pipeline: after `ingestPage`, `postProcess === 'splitSpread'` replaces the
  one page with two pages, and OCR runs on each half.
- In Review, "Undo split" for a pair uses the existing `compositeHalfPages` / `REPLACE_PAGES`
  path, or simply keeps the original master URI on both halves (`sourceUri`) so the pair can
  be restored.
- Tests: the gutter finder as a pure function on synthetic column-brightness arrays (a dark
  stripe at 47 % gives a split at 47 %; flat brightness gives the centre); portrait images are
  not split.

**Done when:** scanning 5 open-book spreads gives 10 correctly ordered pages, and the split
lands on the gutter in at least 9 of the 10.

### C4 · ID card mode: front and back on one page *(M)*
Status: done (commit ee5a8aa). Needed a new `layout: 'fullPage'` page property (DB migration v2): the normal 24 pt margin would print the card at ~92 %. Session parts are `SessionPage.idCard` (not `parts`). Device check pending: print at 100 % and measure.

- New `src/services/enhance/composeIdCard.ts`: `composeIdCard(front, back?) → page`.
  - Draw an A4 canvas at 200 dpi (1654×2339 px), white.
  - Draw each card at its **true size**, ISO ID-1 85.6×54 mm (about 674×425 px at 200 dpi),
    centred horizontally, front at 25 % of the height and back at 60 %. Use `fitBox` to keep
    the aspect ratio.
  - One encode.
- Pipeline: `postProcess === 'idCard'` composes the 2 scanned pages into 1. A single scanned
  page becomes front-only.
- On export, `buildPdfFromPages` places the page as a normal A4 page. The card prints at real
  size because the canvas is exactly A4.
- Keep the source card images on the session page (`parts: [front, back]`) so Review can
  "Swap front/back" or "Retake back".
- Tests: placement maths (card rectangles in pixels at 200 dpi), a missing back, a landscape
  vs portrait card source.

**Done when:** printing the exported PDF at 100 % gives a card image within ±1 mm of
85.6×54 mm.

### C5 · Batch gallery import with automatic cropping *(L — starts with a spike)*
Status: todo

Google's scanner gallery import (C2) covers Android when the user starts from the scanner. C5
covers our own Gallery button: multi-select 20 or more photos, crop each automatically, with
iOS support too.

- **Spike first (separate commit, then decide):** add `react-native-fast-opencv` (v1.0.1, JSI
  OpenCV; it works in a dev build).
  - Measure the size added to the APK per ABI. Budget: **≤ 8 MB**. Over budget means using the
    fallback below.
  - Test `detectDocumentQuad` on 30 real photos: notebook on a desk, a sheet on a bed, a
    WhatsApp-compressed photo.
  - Write the results into the plan file.
- New `src/services/capture/quadDetector.ts`: `detectDocumentQuad(uri) → Quad | null`.
  1. Downscale to about 800 px.
  2. Gray, Gaussian blur, Canny, dilate.
  3. `findContours`, keep the largest convex 4-point `approxPolyDP` covering at least 20 % of
     the image.
  4. Order the corners top-left, top-right, bottom-right, bottom-left (a pure function).
  5. Scale back to master coordinates.
- **Fallback if over budget:** a lighter Skia/JS method (Sobel edges on a 400 px image plus a
  projection-profile bounding box, i.e. an axis-aligned crop with no perspective correction).
  It is less accurate, so mark the crops as "please check".
- `ingestGalleryBatch(assets, spec)`:
  - Process **one page at a time**: `ingestPage` (downscale, master, thumbnail), then
    `detectDocumentQuad`, then `warpPerspectiveCrop` if a quad was found, then OCR.
  - Report progress (see C6).
  - Pages with no quad found keep the full photo and get `needsCropReview: true`.
- Review: a "Check crops (n)" chip that opens `CropOverlay` page by page. Add an `initialQuad`
  prop to `CropOverlay` so it starts from the detected quad instead of the full image.
- Also respect the mode's `postProcess` (Book or ID card) for gallery imports.
- Tests: corner ordering, the area threshold, scaling from 800 px to master coordinates, and
  that the batch loop is sequential (a mock spy sees no overlapping calls).

**Done when:** importing 20 phone photos of an assignment crops at least 17 of them correctly
with no manual work, and memory stays flat during the batch (Android Studio profiler).

### C6 · Feedback, progress and the capture loop *(S)*
Status: done (commit 53aba95). `ingestGalleryBatch` exists now (in `capture/ingestBatch.ts`, on top of `processSequentially`); C5 adds auto-crop to it. Device check pending: 10 handwritten pages, Scan → Review ready in under 60 s.

- Add `expo-haptics@~57.0.3`: a light impact when the scanner returns pages, success when
  processing finishes, a warning on error.
- Per-page progress: a new `capture/SET_PROGRESS { done, total }` action dispatched once per
  page from the pipeline and from `ingestGalleryBatch`. It is cheap because only a small slice
  changes. Review shows a slim progress bar, "Processing page 3 of 10", while pages arrive.
- Snack after a scan: "Added 10 pages · Scan more". The action button relaunches the scanner
  in the same mode, and the new pages are appended (`BULK_ADD_PAGES` already appends).
- Capture tray badge: the page count plus the last thumbnail (already shown by
  `CaptureControls`); switch it to the F5 thumbnail.
- Cancel while processing: an `AbortSignal` checked between pages. Pages already finished are
  kept; temporary files are cleaned with `cleanTemporaryCache`.
- Tests: the reducer's progress handling; cancelling mid-batch keeps the finished pages and
  cleans the rest.

**Done when:** the user always sees which page is being processed, and capturing 10
handwritten pages, from tapping Scan to Review being ready, takes under 60 s on a mid-range
phone (the §1 "done when").

### C7 · Fallback when Google's scanner is unavailable *(M)*
Status: todo

Some phones have no Google Play services, or an outdated version (Huawei, some Chinese ROMs,
emulators).
- Detect it: `scanDocument` rejects with an "unavailable" or module error. Remember this in
  `settings.scannerUnavailable` so the error isn't shown again on every scan.
- Fallback: `expo-image-picker.launchCameraAsync` (one photo at a time, in a "Take another?"
  loop), then the C5 `ingestGalleryBatch` path (automatic quad, crop, OCR).
- Show a one-time explanation: "Your phone doesn't support Google's scanner. Using basic camera
  mode."
- The full custom live camera (`expo-camera` plus live quad overlay and auto-capture) goes into
  a P3 plan, `docs/plan/xx-custom-camera.md`, written later.

**Done when:** on an emulator without Play services, a scan still produces cropped and
OCR'd pages.

---

## Order and dependencies
C1, then C2 (small; can be done in the same session as C1), then C6 (it makes everything else
easier to test), then C3, then C4, then C5 (spike first), then C7 (needs C5's detector).

## Critical files
- `src/services/capture/{captureModes (new),scannerPipeline,quadDetector (new)}.ts`
- `src/services/enhance/{splitSpread (new),composeIdCard (new),perspectiveCrop,compositeHalfPages}.ts`
- `src/screens/CaptureScreen.tsx`, `src/components/capture/CaptureControls.tsx`,
  `src/components/review/CropOverlay.tsx`, `src/screens/ReviewScreen.tsx`
- `src/store/slices/{captureSlice,settingsSlice}.ts`,
  `src/services/persistence/settingsStorage.ts`, `src/types/models.ts`
- `patches/react-native-document-scanner-plugin+2.0.4.patch`, `package.json`

## Verification (for the whole of §1)
1. `npm run typecheck && npm test` pass in CI.
2. Mid-range Android device, dev build:
   - each of the 5 modes: scan, then confirm the default filter and post-processing are
     correct;
   - 10 handwritten pages in Notes mode in under 60 s with fewer than 2 manual crops;
   - 5 book spreads give 10 pages;
   - an ID card printed at 100 % measures true size;
   - 20 WhatsApp photos imported through our Gallery button give at least 17 auto-cropped
     pages, with flat memory use.
3. An emulator image without Play services: the fallback path works end to end.
4. iOS simulator or device: modes and post-processing work with VisionKit; scanner options are
   ignored without errors.
