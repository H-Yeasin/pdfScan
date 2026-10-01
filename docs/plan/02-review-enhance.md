# §2 Review and enhance: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement E1 from docs/plan/02-review-enhance.md".
- Read `AGENTS.md` (auto-loaded) and only the step you are implementing; open only the files it
  names unless something unexpected comes up.
- **Prerequisites:** §0 and §1 C1 must be done first (see below).
- When you finish a step, update its `Status:` line (`done (commit <sha>)`) and tick it in
  `docs/PLAN.md`. If the code no longer matches what a step describes, fix the step text too.

## Context
§2 makes handwriting, handouts and boards look like clean photocopies, with fast live previews
and an easy review flow.

### What the code looks like today (checked while planning)
- `services/enhance/skiaEnhance.ts` (342 lines) contains all the filters:
  - `auto`/`color`/`gray`/`bw` are colour matrices built from a 48×48 histogram
    (`analyzeImage`, `channelStatsFromHistogram`, `levelsScale`, `levelsMatrix`,
    `lumaLevelsMatrix`, `baseModeFilter`);
  - `document_scan` is a Sauvola threshold SkSL shader with a sparse 5×5 tap grid;
  - `composeAdjustFilter` stacks the brightness, contrast and saturation sliders;
  - `bakeEnhance` renders one page at full resolution and encodes a JPEG.
  - **None of the modes correct uneven lighting.** Levels stretch the whole page, so a shadow
    across a notebook stays a shadow. Sauvola is the only local method, and it is a hard 1-bit
    threshold that breaks up pencil strokes.
- `useEnhancedPreview.ts`: **every filter or slider change runs a full-resolution
  `bakeEnhance` and writes a JPEG to the cache** to show the preview. With F5's 2400 px masters
  this becomes noticeably slow, and sliders can't update live.
- `ReviewScreen.tsx` (608 lines) already has:
  - press-and-hold **Compare** (`PreviewControls`, `comparing` state);
  - an **"Apply to all"** toggle (`applyToAll`, which drives `SET_ALL_PAGES_ENHANCE` /
    `SET_ALL_PAGES_ADJUST`);
  - `AdjustPanel` (sliders; hidden for `document_scan`);
  - `EnhanceSegmented` (text segments: Auto, Color, Gray, B&W, Scan);
  - `ContextBar` (Crop, Rotate, Retake, OCR, Sign), `CropOverlay`, `GridPagesModal`,
    `PagePeekCarousel`.
  - There is **no undo**.
- `reviewSlice` only holds `sel` and `ocrRunning`. `EnhanceMode` is session-only; the library
  stores baked pixels, so filter IDs can change freely.

### Key design decisions
- **One filter graph, two outputs.** Each filter builds a Skia paint/shader graph once. The
  same graph is drawn into an offscreen surface at export time (F5 `renderPage`) and recorded
  into an `SkPicture` for the on-screen preview. The preview is then always identical to the
  export, without writing files.
- **Light correction comes first and is shared.** Estimate the paper background (dilate to
  remove the ink, then a large blur on a small copy), then divide the image by it. This is the
  standard flat-field technique, and it fixes shadows for every filter except Original.
- **Ink is not a threshold.** It uses a soft tone curve after light correction, so pencil keeps
  smooth edges. Sauvola stays as the "B&W" option for photocopy-style output.

**Prerequisites:** F1 (tests), F5 (`renderPage`, masters, thumbnails, rotation stored as a
setting), C1 (per-mode `defaultEnhance`; Notes switches from `document_scan` to `ink` in E4).

---

## Steps

### E1 · Filter registry and shared filter engine *(M)*
Status: done (commit a993721), adapted. It was built before its prerequisites F1, F5 and C1, so:
- **Tests deferred to F1.** For now, a one-off script checked that `filterMath`'s auto/color/gray
  chains, the adjust stack and histogram clipping are identical to the pre-refactor code
  (7,001 random and edge cases). Add the jest tests listed below once F1 lands.
- **No `renderPage` yet (F5).** `drawFiltered` is called by `skiaEnhance.bakeEnhance(uri, page)`,
  which Deliver, AcademicOptions and the current preview hook use. F5 swaps `bakeEnhance` for
  `renderPage`.
- **No `captureModes.ts` yet (C1).** C1's table in `01-capture.md` now says `bw` for Notes.
- As built: `filters/{filterMath,stats,sauvola,registry,drawFiltered}.ts`. `FilterSpec` also has
  `available: false` for `ink`/`board`, which are placeholders (they render as Gray and Auto) and
  stay hidden from `EnhanceSegmented` until E4/E5 build them. `lightCorrect` is false everywhere
  until E3. `SessionPage.stats` is measured at scan ingest (`scannerPipeline`). Gallery imports,
  merged pages and pages whose `uri` changed (the reducer drops stale stats on `UPDATE_PAGE`) are
  measured by ReviewScreen through `capture/SET_PAGE_STATS`. `drawFiltered` falls back to
  measuring when stats are missing.

- Split `skiaEnhance.ts` into `src/services/enhance/filters/`:
  - `filterMath.ts`: **pure** functions moved as they are (`channelStatsFromHistogram`,
    `levelsScale`, matrix builders). These can be unit-tested without Skia.
  - `stats.ts`: `analyzeImage` → `ImageStats`. Compute it **once per page at ingest** and
    cache it on `SessionPage.stats`, so changing filters doesn't read pixels again.
  - `registry.ts`: `FILTERS: FilterSpec[]` with
    `{ id, label, icon, adjustable, lightCorrect: boolean, build(ctx) → { shader | colorFilter } }`.
    `ctx = { image, stats, width, height, adjust, options }`.
  - `drawFiltered(canvas, image, page, targetRect)`: the only place that applies a filter. It
    is used by F5's `renderPage` (export) and by E2 (preview).
- Widen `EnhanceMode` to `'original' | 'auto' | 'color' | 'gray' | 'ink' | 'board' | 'bw'`.
  The old `'document_scan'` becomes `'bw'` (the Sauvola shader), and the old `'bw'` (contrast
  boost) is removed. Update C1's `captureModes.ts` defaults to match.
- Add `SessionPage.filterOptions?: { keepInkColor?: boolean; fadeLines?: boolean; boardStyle?: 'auto' | 'light' | 'dark' }`
  for E4/E5.
- Tests: every `EnhanceMode` has a spec; `filterMath` cases (a flat page widens the window, the
  clip percent, the matrix shape); the export output for `auto`/`color`/`gray` is unchanged
  from before the refactor (compare the matrices).

**Done when:** behaviour is unchanged for the existing modes, and `skiaEnhance.ts` contains only
`renderPage` plus thin wrappers.

### E2 · Live preview without temporary files, plus the Filter Lab *(M)*
Status: done (see git log), adapted. Built before F5, so "the master" is `SessionPage.uri`. As built:
- `useFilteredPicture(page, previewMaxDim, { adjust, prefetchUris, overlay })` in
  `services/enhance/`. Decoding and the LRU of 3 live in `previewImageCache.ts`. It returns
  `{ picture, originalPicture, width, height }`, and `components/review/FilteredPreview.tsx` draws
  it aspect-fit in a `<Canvas>`. `PagePeekCarousel` now takes `currentContent` instead of
  `displayUri`. Its zoom scales the canvas view, which is fine at today's 1200 px scans.
- Academic stamp: `academicRasterService.drawAcademicStamp(canvas, …)` was split out of
  `stampContentPageImage`, and the preview draws it as the picture's overlay, so no bake was
  needed. `useEnhancedPreview` and `useAcademicStampPreview` were deleted.
- The Filter Lab needed tunable constants, so `FilterSpec` gained `params: FilterParam[]` and
  `ctx.params`, and `drawFiltered` takes optional `paramOverrides` (the Lab is the only caller that
  passes them). The defaults are the shipped constants, and a re-run of the E1 matrix check is
  still identical. The Lab is in Settings → Developer (`__DEV__` only). Its contact sheets go to
  `Paths.document/filter-lab/` and the share sheet.
- Not measured yet: the 100 ms / 30 fps budget on a mid-range phone, and listing the cache
  folder. Review no longer calls any file-writing code when a filter or slider changes. The B&W
  preview runs Sauvola on the 1400 px preview image, so thin strokes can differ slightly from
  the full-resolution export.

- Replace `useEnhancedPreview` with `useFilteredPicture(page, previewSize)`:
  - decode the master **once per selected page** into an `SkImage` downscaled to the preview
    size (screen width × pixel ratio, at most about 1400 px);
  - cache the current page and its neighbours only (an LRU of 3), so memory stays bounded;
  - record `drawFiltered` into an `SkPicture` (`Skia.PictureRecorder`) on every mode, option or
    adjust change;
  - render it with `<Canvas><Picture/></Canvas>` inside the existing `ZoomableImage` /
    `PagePeekCarousel`.
- `AdjustPanel`: preview updates **while dragging** (it currently waits for the commit), and
  only the commit dispatches to the store.
- Compare draws the unfiltered image from the same cached `SkImage` (no file).
- The academic stamp preview (`useAcademicStampPreview`) keeps working by drawing on top of the
  picture; if that is fiddly, feed it a one-off bake and note this in the step.
- **Filter Lab** (`src/dev/FilterLabScreen.tsx`, shown only when `__DEV__`): pick an image, see
  every filter in a grid with sliders for each filter's constants, and export a labelled
  contact-sheet JPEG. E3–E5 tune their parameters with it, and E7 uses it for the benchmark.
- Performance budget: a filter change shows in under 100 ms and slider drags stay at least
  30 fps on a mid-range phone.

**Done when:** changing filters or dragging sliders writes no files to `Paths.cache`
(checked by listing the cache), and the preview matches the exported page.

### E3 · Shadow and lighting correction *(M)*
Status: done (see git log); needs the Filter Lab check on a device. As built:
- `filters/lightCorrect.ts` does the work. `makeBackgroundImage(image, dark, radius, sigma)`
  always works at a 160 px long side instead of 1/8 scale, so the radius and sigma are fractions
  of the page, and the 1400 px preview gets the same background as the full-size export. The
  morphology reads a clamp-tiled shader (`ImageFilter.MakeShader`), so the page edges don't erode
  into a dark frame. Results are cached per decoded `SkImage` (WeakMap), so slider drags don't redo
  the morphology. `makeLightCorrectedShader` runs `LIGHT_CORRECT_SKSL`.
- `FilterContext.source` is the corrected shader for `lightCorrect` specs (Auto, Color, Gray, and
  the Ink and Board placeholders), and their colour filter is applied on top of it.
- `ImageStats` gained `light: { dark, bgMean }`. `analyzeImage` reads the page and its background
  at 48×48, divides in JS with the same formula, and measures levels on the corrected page.
  Dark pages (raw median luma < 0.35) erode, and they normalize to their own mean background
  instead of to white, so a blackboard stays dark.
- `lightCorrectMath.ts` holds the pure formula plus `estimateBackground1D`, the 1-D reference.
  A scratch run of the planned test case (a 0.35→0.9 ramp with ink dips) gave a paper spread of
  0.55 → 0.04 with the ink dips preserved, and a dark board that stays even and dark. Turn this
  into a jest test in F1.
- Filter Lab: Auto, Color, Gray, Ink and Board have "Light:" sliders for radius, smoothing and
  paper white. The overrides affect the drawn correction; the stats keep the defaults.

- `filters/lightCorrect.ts`: `makeBackgroundShader(image) → SkShader`:
  1. Draw the image into a surface at 1/8 scale.
  2. `ImageFilter.MakeDilate` (radius about 3 px at that scale), which takes the brightest
     neighbour, so text disappears and only paper remains.
  3. `ImageFilter.MakeBlur` (sigma about 6 px) to smooth it.
  4. Snapshot the result and use it as a shader scaled back to full size, with linear sampling.
- A runtime shader, `LIGHT_CORRECT_SKSL`: `out = clamp(src / max(bg, 0.05) * paperWhite, 0, 1)`,
  per channel (which also removes coloured light casts, such as yellow lamp light).
- Applied as stage 1 for every spec with `lightCorrect: true` (Auto, Color, Gray, Ink, Board),
  composed **before** the levels matrix. The stats for levels are then computed on the
  corrected small image; update the cached stats accordingly in `stats.ts`.
- Edge case: a page that is mostly dark (a blackboard, a photo) is detected from `stats` (median
  luma below 0.35); there it uses `MakeErode` instead of dilate, and E5 handles the rest.
- Tests: a pure JS reference for the 1-D version of divide-by-background (a gradient ramp with
  text dips comes out flat, and the dips are preserved); parameter scaling with image size.

**Done when:** in the Filter Lab, a notebook photo with a hand shadow across half the page comes
out with even paper under Auto, and nothing goes grey or blotchy.

### E4 · Ink filter for handwritten notes *(L)*
Status: done (see git log); the 5-page Filter Lab check on a device is still open. As built:
- `filters/inkMath.ts` holds the pure formulas: `inkKnees`, `inkTone`, `lineFade` and
  `percentileFromHistogram`. `filters/ink.ts` mirrors them line for line in SkSL, built on the
  light-corrected `source`.
- Knee adaptation: `ImageStats.tone = { paper, ink }` is the corrected-luma median and 2nd
  percentile, measured at 512×512 (at 48×48 a stroke averages into the paper). A paper-ink gap
  under 0.2 (almost no ink) falls back to the 0.45 / 0.82 knees.
- Ruling lines fade on luma plus low chroma, whatever the hue, so faint green grids fade too.
  This is a deliberate widening of "blue or red": pen ink survives by being darker or more
  saturated.
- "Keep pen colour" scales the corrected colour by tone/luma.
- UI: `components/review/InkOptions.tsx` sits under the picker when Ink is selected. It
  dispatches `capture/SET_FILTER_OPTIONS`, which respects Apply to all. The Filter Lab has the
  same toggles and sliders for the ink constants.
- Notes mode: C1's table in `01-capture.md` now defaults to `ink`.
- Scratch check (turn it into a jest test in F1), using synthetic pages:
  - pencil on lined paper: core 0.50 → 0.20, edges 0.70 → 0.40, rulings → white;
  - blue pen on grid paper: pen 0.27 → 0.11 and stays navy with keep-colour, grid → white.

- `filters/ink.ts`, after light correction:
  1. Luma, then a **soft tone curve** (SkSL smoothstep): paper (above about 0.82) becomes pure
     white, ink (below about 0.45) is darkened by a gamma boost, and the range in between is
     mapped smoothly. Pencil keeps its anti-aliased edges. The two knees adapt to the corrected
     luma histogram (the paper peak and the ink tail) through `stats`.
  2. **Fade ruled lines** (`fadeLines`, on by default): ruling lines are thin, light and blue,
     red or grey. A pixel is faded to white when its corrected luma is above the line threshold
     (lighter than ink) **and** its colour is blue or red with little saturation, or it is
     simply lighter than ink. Pen ink is darker and more saturated, so it survives.
  3. **Keep pen colour** (`keepInkColor`, off by default): instead of grey output, keep the
     original hue for ink pixels and only whiten the paper, so blue and red pens stay coloured.
- The UI gets two small toggles under the filter strip when Ink is selected: "Fade lines" and
  "Keep pen colour".
- Notes mode (C1) defaults to `ink`.
- Tests: the tone-curve maths and the knee adaptation as pure functions (synthetic histograms
  for pencil on lined paper and blue pen on grid paper).

**Done when:** in the Filter Lab, for 5 test pages (pencil on lined paper, blue pen on grid,
black pen on plain paper, pencil under a lamp shadow, a page photographed through a
plastic sleeve), the paper is white, the lines are faded, and pencil is clearly readable, at
least as good as `bw` (Sauvola) on every page.

### E5 · Board filter for whiteboards, blackboards and slides *(M)*
Status: done (see git log); the Filter Lab check (3 whiteboards, 2 blackboards) on a device is still open. As built:
- `filters/boardMath.ts` holds the pure formulas and `filters/board.ts` mirrors them in SkSL.
  `boardStyle: 'auto'` reuses E3's dark-page flag (`stats.light.dark`, the same median < 0.35
  rule), so the board type and the light correction always agree. A forced style also switches
  the correction, through the new `FilterSpec.lightStats` hook.
- Whiteboard: white point (0.9), 1.5× marker saturation, marker gamma 1.3, and glare (luma
  > 0.96 with chroma < 0.12) fades to white.
- Dark board: each pixel is split into luma plus a zero-luma colour offset, and the luma is
  remapped from board → chalk. The chalk level comes from the new `stats.tone.bright` (98th
  percentile). Inverted, chalk goes to 0.15 rather than 0, so coloured chalk keeps a visible hue.
  The offset is *scaled* to fit 0..1 rather than clamped, which keeps the hue exact. The board's
  colour cast is removed in proportion to (1 - t), so the board turns neutral but white chalk
  doesn't turn magenta (a bug the scratch check caught). "Keep dark background" is the new
  `FilterOptions.keepDarkBoard`.
- UI: `components/review/FilterOptionsPanel.tsx` replaces `InkOptions` and shows the Ink or Board
  options. For Board that's Auto / Whiteboard / Blackboard plus the dark-background toggle.
- Board mode: C1's table in `01-capture.md` now defaults to `board`.
- The picker now has 7 segments, which is likely cramped on narrow phones. E6's thumbnail strip
  replaces it.
- Scratch check (turn it into a jest test in F1): detection for auto/forced styles; hue kept
  through inversion on neutral and green boards (about 19k random colours, exact to 1e-15); green
  board → white; white chalk → neutral 0.15; yellow chalk → dark yellow; whiteboard surface and
  glare → white; markers darker and more saturated.

- `filters/board.ts`, after light correction:
  - **Board type:** `boardStyle: 'auto' | 'light' | 'dark'`. `auto` is decided from the
    median luma (below 0.35 means a dark board).
  - **Whiteboard / screen:** paper-white background, a saturation boost for marker colours, and
    highlights clipped to remove glare spots (corrected luma above 0.96 with low saturation
    becomes white).
  - **Blackboard / greenboard:** invert the luma and keep the hue, so chalk becomes dark strokes
    on white (printable and saves toner). "Keep dark background" switches to the non-inverted
    version with only contrast and the colour cast fixed.
- Board mode (C1) defaults to `board`.
- Tests: board type detection on synthetic stats; luma inversion keeps the hue (a pure colour
  maths test).

**Done when:** in the Filter Lab, 3 whiteboard photos (one with window glare) and 2 blackboard
photos come out readable with a white background.

### E6 · Review UX: filter strip, undo, smarter apply-to-all *(M)*
Status: done (see git log); not yet tried on a device. As built (built before F5 and C1):
- `components/review/FilterStrip.tsx` replaces `EnhanceSegmented`, which is deleted. Each
  thumbnail is `drawFiltered` on a 240 px decode from `loadThumbImage`, a second LRU in
  `previewImageCache`, so thumbnails never evict the previews. There's no F5 thumbnail file yet.
  `FilterOptionsPanel` (E4/E5) sits under the strip.
- Apply to all: the toggle is gone. After a filter, option or slider change on a multi-page scan,
  an "Apply to all pages" button appears. It dispatches `capture/APPLY_LOOK_TO_ALL` (filter,
  options and sliders, as one history entry), sets `settings/SET_DEFAULT_ENHANCE` for the capture
  mode, and shows the snack "Applied to N pages · Undo". Deleting a page also offers Undo.
- Undo/redo: `store/pageHistory.ts` holds pure functions; the state is `review.history`.
  Recording, undo and redo live in **appReducer**, not `reviewSlice`, because they read the
  history and rewrite `capture.pages` in one step. Every page-editing capture action records
  automatically, and no-op edits are skipped.
  - `fields` entries put back only the edited fields (`enhance`, `adjust`, `filterOptions`,
    `rotation`, `uri`, `width`, `height`, `cropRect`), so OCR results and later-added pages
    survive an undo.
  - `pages` entries (merge, delete) restore the page list.
  - Old image files stay until Deliver's end-of-session sweep, which now includes `historyUris`.
    `CLEAR_PAGES` and `review/RESET` clear the history.
- `settings.defaultEnhanceByMode` is persisted in `app:settings`, and unknown filter IDs are
  dropped on load. New pages (scanner pipeline, gallery import) start with
  `defaultEnhanceFor(settings, mode)`, whose built-in fallback is `auto` until C1 supplies
  per-mode defaults. Merged pages keep the first half's look.
- Crop loupe: a 2.5× magnifier above the finger (below near the top edge) with a crosshair. It's
  a reanimated view holding the same `Image`, not a Skia `Image`, so it follows the drag on the
  UI thread.
- Compare also works by long-pressing the preview (280 ms; it always ends on release).
- Scratch test against the compiled `appReducer` (turn it into a jest test in F1), 22 checks:
  - push, no-op edits skipped, OCR not recorded, cap at 20;
  - apply-to-all is one entry, and one undo reverts all 10 pages;
  - redo, and redo cleared by a new edit;
  - undo of a crop restores the old uri and size, and the undone file is tracked for the sweep;
  - undo of delete and merge;
  - `CLEAR_PAGES` clears the history.
  The persistence round-trip of `defaultEnhanceByMode` isn't covered (it needs AsyncStorage).

- Replace `EnhanceSegmented` with `components/review/FilterStrip.tsx`: a horizontal row of
  live thumbnails (each one the current page through that filter, drawn from the F5 thumbnail
  with `drawFiltered`) and labels. The selected filter is highlighted, and the per-filter
  options (E4/E5 toggles) appear under it.
- **Apply to all:** replace the hidden toggle with an explicit "Apply to all pages" button that
  appears after a filter or slider change. The snack says "Applied to 10 pages · Undo".
- **Undo/redo** for page edits in Review:
  - `reviewSlice` gets `history: { past: PageSnapshot[]; future: PageSnapshot[] }`, capped at 20,
    where a snapshot is the edited `SessionPage` fields (`enhance`, `adjust`, `filterOptions`,
    `rotation`, `cropRect`/`uri`).
  - Record every page-editing action, including apply-to-all (one entry for the whole batch).
  - Undo and redo buttons in the Review header.
  - Crop and merge create new files, so undo just points back to the previous `uri`; the
    temporary files are cleaned on `review/RESET`.
- **Remember the user's choice per mode:** `settings.defaultEnhanceByMode[mode]`, set when the
  user applies a filter to all pages. It overrides C1's registry default the next time the same
  mode is used.
- **Crop precision:** a magnifier loupe in `CropOverlay` while a corner is being dragged
  (Skia `Image` with a zoomed offset, about 2.5×), placed above the finger.
- Compare is also available by long-pressing the preview itself.
- Tests: the history reducer (push, cap at 20, undo or redo after apply-to-all, redo cleared by a
  new edit), and that `defaultEnhanceByMode` is persisted.

**Done when:** a user can try every filter by looking at thumbnails, undo any edit, and apply a
choice to a 10-page scan with one tap and one undo.

### E7 · Benchmark against CamScanner and tune *(M)*
Status: in progress. The tooling is done; the benchmark itself needs real pages, raters and a
phone. Done so far:
- `docs/qa/filter-benchmark.md` has the protocol: groups and file names, the folder layout
  outside the repo, how to make both apps' outputs from the same photo, rating, scoring, the
  tuning loop, a table of every constant with its current default and file, and results and
  performance tables to fill in.
- `docs/qa/blind-compare.html` is the standalone blind A/B rater: random order and sides per
  rater, keyboard voting, votes in localStorage, CSV export, per-page verdicts and the 14/20 total.
- Filter Lab → "Time 2400 px export" times `bakeEnhance` for every filter on a 2400 px copy, plus
  the ingest analysis, and deletes its files.
Open: take the 20 pages, run round 1 with 3+ raters, tune the losing groups in the Filter Lab
(record the values in the doc and in the code comments), and measure export time in a release
build. Tick E7 once ours is preferred on at least 14/20.

- `docs/qa/filter-benchmark.md`: the test protocol.
  - 20 real student pages in 6 groups: pencil on lined paper, blue pen on grid paper, a
    printed handout with a lamp shadow, a curled notebook page, a whiteboard with glare, a
    blackboard.
  - The images are kept **outside the repo** (privacy and size); the doc says where and how
    they are named.
  - For each page: our output (the mode's default filter) next to CamScanner's free output,
    shown blind (random left/right) to 3 or more students.
  - A scoring table, and the parameter values used.
- Tune the constants in E3–E5 with the Filter Lab; record the final values in the doc and in the
  code comments.
- Performance check: exporting at 2400 px takes under 400 ms per page on a mid-range phone.

**Done when:** our output is preferred on at least 14 of the 20 pages (this is the §2 "done
when" in `docs/PLAN.md`).

---

## Order and dependencies
E1, then E2 (the Filter Lab is needed to tune the rest), then E3, then E4, then E5, then E6,
then E7. E6's undo and apply-to-all parts don't depend on E3–E5 and can be done earlier if
useful.

## Critical files
- `src/services/enhance/skiaEnhance.ts` → split into `src/services/enhance/filters/{filterMath,stats,registry,lightCorrect,ink,board}.ts`
- `src/services/enhance/useEnhancedPreview.ts` → replaced by `useFilteredPicture`
- `src/screens/ReviewScreen.tsx`; `src/components/review/{EnhanceSegmented→FilterStrip,AdjustPanel,PreviewControls,CropOverlay,PagePeekCarousel}.tsx`
- `src/store/slices/{reviewSlice,captureSlice,settingsSlice}.ts`, `src/types/models.ts`
- `src/services/capture/captureModes.ts` (from C1), `src/dev/FilterLabScreen.tsx` (new),
  `docs/qa/filter-benchmark.md` (new)

Existing code to reuse: `analyzeImage`, the levels and adjust matrices, the Sauvola shader and
its cached `RuntimeEffect` pattern (`getDocumentScanEffect`), the offscreen-surface pattern in
`bakeEnhance`, `ZoomableImage` and `useZoomableImageGesture`, the existing Compare and
apply-to-all plumbing in `ReviewScreen`.

## Verification (for the whole of §2)
1. `npm run typecheck && npm test` pass in CI.
2. On a mid-range Android device (dev build):
   - change filters on a 10-page scan: previews appear in under 100 ms and the cache folder
     doesn't grow;
   - export the scan: each page matches its preview, and takes under 400 ms per page;
   - undo every edit type, including apply-to-all.
3. The E7 benchmark: preferred on at least 14 of 20 pages.
