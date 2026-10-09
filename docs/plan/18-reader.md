# §18 Reader v2: step-by-step plan

## How to use this file
- Implement **one step per session** ("Implement W3 from docs/plan/18-reader.md").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are implementing. The "Architecture"
  section below is shared background; read the parts your step names.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §18.
- Step prefix **W**. R is §7. To avoid clashing with the phases P0–P4, the audit's P0/P1 issues are
  called **A0/A1** here.
- **§16–§18 ship before §11.** The order across the three files is in `docs/plan/README.md`. In short:
  - §16 G1 comes first;
  - then W1–W4 (small fixes, no new architecture);
  - then §16 G2 (router; W5 needs its `useScreenRole`);
  - then W5–W18 (the page surface);
  - then W19–W22 (non-PDF viewers);
  - W23 needs §17 U3's `Menu`.
- **New dev builds:** W7 (pdf-native v2 + `expo-screen-orientation`) and W18 (removing
  `react-native-pdf-jsi`). W11 needs one only if Android ignores the runtime orientation unlock while
  `app.json` says `"portrait"`. Batch §16 G4's embedded fonts and G6's `expo-image` into W7's build if
  they are ready.
- **L steps** name a split point in case a session runs long.

## Context
**Planned 2026-10-09.** The owner: "the reader (PDF, DOCX, Excel) must be improved, top notch like the
Google and Microsoft readers… offer the existing tools, but they must be improved; they have bugs and
glitches… and the reader MUST be improved."

A read-only reader audit (2026-10-09) found 12 A0 and 20 A1 issues. A design pass then checked the code
paths this plan changes. Three causes explain most of the glitches:
1. **react-native-pdf-jsi 4.4.2** (a fork of react-native-pdf over AndroidPdfViewer + pdfium) is buggy:
   - reading settings only apply after a reopen;
   - any prop update snaps to the top of the page;
   - page jumps go to a stale view after a remount.
2. **Each mode uses a different renderer:** pdf-jsi for reading, page JPEGs for Mark mode and Select
   text, a modal for signing. So zoom, position and even page numbers change between modes.
3. **The bars overlay the content** with no inset, and the router remounts the Reader on every Back.

**Owner's decisions (2026-10-09):**
1. **One page surface** for PDFs and scans: reading, Find, text selection, Mark and Sign all on the same
   pages, so zoom and position never jump. It grows out of Mark mode's column. Pages come from our own
   `modules/pdf-native` (pdfium is already bundled). `react-native-pdf-jsi` is removed at the end.
2. **Must have:**
   - true dark pages (inverted, not dimmed);
   - web links;
   - the PDF's contents (outline);
   - a fast-scroll thumb and a page pill while the bars are hidden;
   - bars that hide on scroll;
   - sharp zoom (re-rendered; tiles above about 2.5×), max zoom ≥ 5×;
   - in-page text selection with handles;
   - Find with "3 of 27", prev/next and every match highlighted, starting from the current position;
   - resume without a jump;
   - content insets.
3. **Landscape in the Reader only** (`expo-screen-orientation`); the rest of the app stays portrait.
4. **The toolset stays:** Mark (highlight, underline, strike, pen, note, Text (Pro), eraser), Notes,
   Bookmarks, Pages, Edit pages, Sign, Fill form, Convert/Edit (Pro), Share/Export/Print, Copy/Extract
   text. No new tool families.
5. **DOCX, XLSX/XLS, CSV and TXT keep their own renderers.** Each gets insets, tap to toggle the bars, real
   Find, a remembered position, landscape, and the fixes listed below.
6. §16–§18 ship **before** the Play launch.

**Choices made in this plan** (the owner can overrule any; record a change here):
- **2-in-1 documents read as single library pages.** Their PDF stays 2-in-1 for share and print. Page
  numbers then agree everywhere (bar, scrubber, Mark mode).
- **Our marks and signatures are rows, drawn live.** They are never baked into the stored
  `document.pdf`. They are flattened into a copy whenever the file leaves the app (share, print, export,
  submit, the backup's readable copy). The first share after marking a big file takes about 1–2 s; after
  that it is cached.
- **Signatures never change the master image** (AGENTS.md: never mutate a source image). A signature is a
  `'signature'` annotation row with its own PNG copy in the document's folder, so rebuilds (Edit pages,
  Compress, Split) keep it, and it can be moved or removed later.
- **Links** ask before opening, showing the URL; only `http`, `https`, `mailto` and `tel` open.
- **Preview caps:** TXT 4 MB, XLSX/XLS 5,000 rows per sheet (the editor reads the whole file as today).
- **Night strength** sets how dark the paper is.
- **iOS** gets the same native API through PDFKit (W7b) before W18 removes pdf-jsi, so the iOS build never
  breaks.

## What the code looks like today (2026-10-09)

### 1. How each format is rendered
| Format | Pipeline | Gaps vs Google Drive / Microsoft |
|---|---|---|
| PDF (imported or external) | `components/reader/PdfPageView.tsx` wraps `react-native-pdf-jsi` (AndroidPdfViewer + pdfium, tiled, max zoom 3×). Find is the library's own search, which reopens the file with pdfium and scans every page per query. | Night is a dark overlay (`PdfPageView.tsx:72`, `services/documents/readingSettings.ts:43`). Background `#EEE` and a "0.00%" text while loading (`node_modules/react-native-pdf-jsi/index.js:700-712`). No links (`onPressLink` unused), outline dropped (`PdfPageView.tsx:67`), no fast-scroll thumb, no text selection in the view. |
| Scans (PDF or JPG format) | The Reader shows `document.pdf`, built by Deliver from the **export-compressed** pages (`DeliverScreen.tsx:258-269`), with a hidden OCR layer. Mark mode and Select text show the page JPEGs (masters, or 1600 px renders for imported PDFs). | The 2400 px masters exist (`LibraryPage.fileUri`) but aren't used for reading. Zoom and position change between modes. |
| DOCX | mammoth → HTML (images inlined as base64) → a locked-down WebView (`DocxView.tsx`). | No pages, headers or footers. Every Find query rebuilds and reloads the HTML (`DocxView.tsx:12-13, 52-58`). The bars can't be hidden. No remembered position. |
| XLSX/XLS | SheetJS reads the whole file on the JS thread → a horizontal ScrollView around a vertical FlatList (`SheetView.tsx`). Sheet tabs, a frozen first row and column, pinch zoom. | 50,000-cell cap checked only **after** the full parse (`services/documents/sheetService.ts:63-77`). No column letters or row numbers, no way to read a long cell, no horizontal virtualisation, tabs under the top bar. |
| CSV | `File.bytes()` → UTF-8/Latin-1 → Papa.parse → the same grid. | As XLSX. |
| TXT | Whole file (no cap, `txtService.ts:18`) → 3000-character chunks → a FlatList of `Text` (`TxtView.tsx`). | Find doesn't highlight. No selection, zoom or remembered position. Colours hard-coded (`TxtView.tsx:117,131`). |

### 2. A0: crashes, data loss, wrong behaviour
1. **Signing uses the PDF page index as the library page index.** `ReaderScreen.tsx:399-401`
   (`applySignedPage(doc, activeIndex, …)`), `:432` (`usePageImage(doc, activeIndex, …)`), `:437`,
   `:742-746`. On 2-in-1 documents PDF page N holds library pages 2N-1 and 2N, so the wrong page is
   signed. The rest of the screen maps correctly (`libraryIdxFor(doc, activeIndex + 1)`, `:216`, `:288`).
2. **Reading settings don't apply live.** pdf-jsi's setters only store fields
   (`android/.../PdfView.java:623-668`). Any prop change calls `drawPdf()` (`PdfManager.java:189-195`),
   which jumps to the top of the current page instead of reloading (`PdfView.java:468-474`). The key
   `${pdfUri}:${reloadKey}` (`ReaderScreen.tsx:488`) doesn't change with settings.
   `ReadingSettingsSheet.tsx:17` promises "Changes apply at once".
3. **Every highlight change yanks the view** through the same path: each Find update, and the notes
   flash on and off 1.6 s later (`useMarkFlash.ts:31-32`).
4. **Page jumps go to a stale view after a remount** (verify on device). `PdfManager` keeps one `pdfView`
   field (`PdfManager.java:56-65`), and `setNativePage(view, page)` ignores `view`
   (`:175-177`). The JS fallback calls a missing `pdfJSI.setCurrentPage` (`index.js:447-456`).
5. **Every Back mounts a second Reader** (`bootstrap/AppNavigator.tsx:284-300`; §16 G2 fixes the
   router). It reloads the whole document for 240 ms. Its unmount writes `lastSeenPage`
   (`useReaderDocument.ts:111-117`), which can turn the last page into 1.
6. **Find races:** the debounced search has no cancel (`useReaderFind.ts:45-57`); native search runs on a
   2-thread pool (`PDFJSIManager.java:61`).
7. **Closing Find leaves the highlights on:** close only toggles `open` (`ReaderScreen.tsx:585`,
   `useReaderFind.ts:23`). The notes flash then falls back to stale results:
   `highlightRects={markFlash.rects ?? find.highlightRects}` (`ReaderScreen.tsx:498`).
8. **Find doesn't scroll to matches in long TXT or sheets:** `scrollToIndex` without `getItemLayout`, with
   `onScrollToIndexFailed={() => {}}` (`SheetView.tsx:113-115, 201`; `TxtView.tsx:96-98, 134`).
9. **Writing marks can lose the file:** `pdfAnnotations.ts:331-332` does `file.delete(); file.write(bytes)`.
   The same pattern is in `pdfOps.savePdf:33`, `pdfService.ts:527` and `:622`, `addCover.ts:143`, and
   `libraryOperations.ts:314`.
10. **"Preparing preview…" can hang forever:** `ensureDocumentPdf(doc).then(...)` has no `.catch`
    (`useReaderDocument.ts:69-73`). The effect re-runs on every `doc` change, so two builds can race.
11. **TXT has no size cap** (`txtService.ts:18`). Sheets are capped at 10 MB and DOCX at 20 MB.
12. **The first lines of every DOCX are hidden:** no `onTap` for DOCX (`ReaderScreen.tsx:525`), the top
    bar is absolute (`ReaderTopChrome.tsx:150-156`), and the body has 20 px of top padding
    (`docxService.ts:78`).
13. **Signing deletes the saved signature:** `pdfService.applySignatureToPdf:588` deletes its input
    (`if (signatureFile.exists) signatureFile.delete()`). The Reader passes the reusable
    `state.signature.saved` (`ReaderScreen.tsx:321-322`), so the next reuse fails.
14. **A PDF-format scan's signature lives only in `document.pdf`** (`applySignatureToDocument`). So any
    rebuild from the masters drops it: `savePageEdit`, `compressDocument`, scan `splitDocument`, 2-in-1
    `standardPdfOf`. (Signing works only on PDF-format documents: `libraryOperations.ts`
    `applySignatureToDocument` throws otherwise.)

### 3. A1: glitches
- **Bars cover content in every format.** Both bars are absolute (`ReaderTopChrome.tsx:150`,
  `ReaderToolBar.tsx:72-77`), and the container has no padding (`ReaderScreen.tsx:804-806`). The bottom bar
  hides by only 60 px (`ReaderToolBar.tsx:43, 47`).
- **Opening a PDF shows page 1, then jumps** (resume through `goToPage` after load,
  `useReaderDocument.ts:94-99`). Edit pages and Add to library return to page 1 (`useEditPages.tsx:63`,
  `ReaderScreen.tsx:330-335, 499`).
- **Leaving Mark mode runs pdf-lib load + save of the whole PDF on the JS thread**
  (`useAnnotationPdfSync.ts:37, 52` → `pdfAnnotations.ts:323-333`), then reloads the viewer (flash, lost zoom).
- **Find:**
  - it jumps to `results[0]` from page 1, not the next match after you (`useReaderFind.ts:51`);
  - no "1 of N";
  - only the first rect of a match is drawn (`PDFJSIManager.java:336-340`);
  - 0 results on password PDFs (`PDFJSIManager.java:298-299` opens without the password);
  - JPG-format scans are excluded (`formatCapabilities.ts:14`);
  - a tap while Find is open hides the bar (`ReaderScreen.tsx:502, 513, 522`);
  - TXT lower-cases the whole file on each keystroke and doesn't highlight (`TxtView.tsx:28-49, 87-90, 129-133`);
  - DOCX reloads the whole HTML per query and on the night toggle (`DocxView.tsx:50-58`);
  - sheet Find counts rows, not cells, and never scrolls sideways (`SheetView.tsx:47-52`).
- **Sheets:**
  - every row renders every column, up to 200 `Text`s (`SheetView.tsx:233-252`);
  - pinch re-renders all rows in 0.1 steps anchored at the top-left (`:118-133, 187`);
  - a 5 MB XLSX freezes, then is refused after the full parse.
- **Mark mode:**
  - a 1-finger drag races pinch, so stray marks appear (`MarkView.tsx:381-398`; `drag.onEnd` commits even
    when a second finger ended it);
  - pen lag: each move re-renders every page (`:267-268, 442-461`);
  - blank pages on fast scroll: only 3 pages hold images (`markMode.ts:107`);
  - scan pages shown unturned (`MarkView.tsx:643`);
  - un-indexed imported pages use 850×1100 stub sizes, so the layout jumps when indexing commits.
- **Also:**
  - the Edit pages draft resets when `doc` changes (`EditPagesModal.tsx:54-59`);
  - the password card has no keyboard handling (`ReaderScreen.tsx:547-575`);
  - the notes flash matches the mark's first 5 words (`notesPanel.ts:101-106`);
  - page numbers disagree on 2-in-1 documents (`PageScrubberSheet.tsx:60` vs `ReaderTopChrome.tsx:118`);
  - XLSX and DOCX are parsed again on every mount (`sheetService.ts:63-71`, `DocxView.tsx:60-70`);
  - an external PDF is parsed whole with pdf-lib to count pages (`externalFileService.ts:50-54`).

### 4. Chrome and code structure
- **Top bar:** Back, title (+ "Submitted…"), "n / N" (tap to jump), Find, Bookmark (long-press to label),
  ⋮.
- **Bottom bar:** Mark, Select text, Notes, Pages, Convert/Edit (`readerTools.ts:95-109`). For DOCX,
  XLSX, CSV, TXT and external PDFs it is a full-width bar with one Pro button (`readerTools.ts:107`).
- **More sheet:** a flat list of up to 14 items for a scan (`readerTools.ts:114-137`,
  `OverflowSheet.tsx:75-96`), with duplicates: Share ≈ Export; Bookmarks in 3 places; Select text,
  Copy page text and Extract text; Convert/Edit in the bar and in More. Missing: Rename, Move to course,
  Star, Merge/Split/Compress.
- **`ReaderScreen.tsx` (846 lines):** 16 `useState`, 17 custom hooks; twelve "open" booleans OR'd
  together at `:227-229`; a 100-line `handleOverflowSelect` if/else (`:297-394`). `MarkView.tsx` is 831
  lines. Tests cover only pure services and `sheetZoom.test.ts`.
- `useAnnotationPdfSync`'s unmount flush also runs in the remounted outgoing copy.

### 5. Facts the design depends on
- **Mark mode's column** (`MarkView.tsx`, `services/annotations/markMode.ts`):
  - `columnLayout(doc.pages, viewport.width, 12)`; `clampView`, `zoomAbout`, `pageAtY`, `currentPage`,
    `viewForPage`, `screenToContent`, `contentToMaster`, `markWindow` (radius 1);
  - transform `screen = content × scale + t` on Reanimated shared values; `MAX_SCALE` 5;
  - marks drawn with react-native-svg per page, through a `viewBox` in master pixels;
  - gestures: `Race(Simultaneous(pinch, twoFingerPan), Exclusive(drag, tap))` (`:398`).
- **2-in-1 mapping:** `services/documents/pageMap.ts`:
  - `pdfPageFor(doc, libraryIdx) → {page (1-based), slot}`;
  - `libraryIdxFor(doc, pdfPage, xFraction)`;
  - `pdfPageCount`;
  - `pdfRectFor(doc, idx, rect)`, which handles covers, template covers, 2-in-1 slots, turned 2-up
    columns and `layout: 'fullPage'`.

  Imported PDFs are 1:1; `pdfLevelMapper` in `pdfAnnotations.ts` handles crop boxes, `/Rotate` and scan
  pages merged into a PDF.
- **Imported pages** (`documents/importedPdfIndex.ts`):
  - `width`/`height`/`ocr` are in "indexed master pixels" (`masterSizeFor(points)`, 2400 px long side);
  - until indexing they are 850×1100 stubs;
  - `rotation` is the turn added since indexing (`document.pdf` already carries it);
  - `pdfTextToOcr(page)` turns pdfium words into `PageOcr`;
  - only the first `INDEX_MAX_PAGES = 300` pages are indexed.
- **Word sources:**
  - scans: `page.ocr` (ML Kit blocks → lines → words, master px);
  - imported PDFs: `page.ocr` with `textSource: 'pdf' | 'ocr'`;
  - external PDFs: nothing stored; `pdfNative.getPageText(uri, page)` (pdfium words, shown points,
    top-left);
  - helpers: `study/textSelection.ts` (`readingOrderTokens`, `tokenAt`, `selectBetween`, `selectionText`),
    `annotations/snap.ts` (`snapHighlight`, `wordRects`).
- **Annotations** are SQLite rows (`state.library.annotations`) in master px.

  **Where they are baked into `document.pdf`:**
  - after Mark mode or a Select text highlight: `useAnnotationPdfSync` → `updatePdfAnnotations`;
  - in rebuilds, through `beforeSave` hooks: `libraryOperations.ts` (`annotationsHook`, `standardPdfOf`,
    `combineInto`, `splitDocument`, `compressDocument`, `applySignedPage`), `pageEdits.savePageEdit`,
    `addCover.ts:181`, `buildExamPack.ts:120`, `submitDocument.ts:127`.

  **What relies on the baked copy:**
  - `shareService.shareDocument` and `printDocument` (`doc.pdfUri`);
  - the Reader's `'export'`;
  - `deviceExportService.exportCopyToDeviceFolder`;
  - `submitPdfLevel` (sends `doc.pdfUri` as is);
  - the backup's readable copy (`backup/format.ts` `readablePaths` = `pdf_path`);
  - `standardPdfOf` (reuses its own PDF);
  - PDF-level merge, split and edit pages (pdf-lib copies `/Annots` along).
- **Native module** (`modules/pdf-native/android/.../PdfNativeModule.kt`, 206 lines):
  - every call reopens the file (`withRenderer`, `pageText`);
  - rendering goes through the platform `PdfRenderer` (`RENDER_MODE_FOR_DISPLAY`), text through pdfium
    (`io.legere:pdfiumandroid:1.0.32`, the same copy pdf-jsi uses).
  - pdfiumandroid 1.0.32 already exposes `newDocument(fd, password)`, `getTableOfContents()`,
    `getPageLinks()`, `PdfTextPage.loadWebLink()`, `renderPageBitmap` with a matrix (with an annotations
    flag), `mapRectToDevice`.
  - **`PdfRenderer` most likely doesn't draw annotations or form appearances** (AOSP never sets
    `FPDF_ANNOT`), so Mark mode, thumbnails and Sign previews of imported PDFs miss the teacher's
    highlights and filled form values. Check on a device in W7.

---

## Architecture

### A1. New modules
| Layer | File | Responsibility |
|---|---|---|
| Pure geometry | `services/reader/surfaceGeometry.ts` | Page boxes (fit width or page, gaps, insets, mixed sizes, turns), `clampView`, `zoomAbout`, `pageAtY`, `currentPage`, `visiblePages`, `viewForPage`, `anchorOf`/`viewForAnchor`, `doubleTapView`, `pagedSnap`, `revealRect`. Grown from `markMode.ts`, which re-exports until W18. |
| Pure | `services/reader/pageSpace.ts` | The coordinate space of a page's overlay data (master px, indexed px, PDF points, a placement inside a PDF page), its turn, and matrices to the shown page. |
| Pure | `services/reader/surfacePages.ts` | `SurfacePage` + `PageSource` for scans, PDF-level documents and external PDFs. |
| Pure | `services/reader/renderPlan.ts` | Density buckets, the tile grid, region matrices, the memory window, prefetch order. |
| Pure + hook | `services/reader/renderQueue.ts`, `components/reader/surface/useRenderQueue.ts` | Priorities, lanes, dedupe, cancellation. |
| Files | `services/reader/pageCache.ts` | Disk cache `Paths.cache/reader/<docHash>/`, keys, LRU prune, invalidation. |
| Pure | `services/reader/darkMatrix.ts` | The night palette and its 4×5 colour matrix. |
| Pure | `services/reader/{findIndex,findCursor}.ts` | Page text index, matches → rects, "n of N", next/prev from a position. Shared by every viewer. |
| Pure | `services/reader/{selection,gestureArbiter,chromeState,fastScroll,links,outline,readerSheets}.ts` | Selection handles; stroke and tap decisions; auto-hide; the thumb; link hit-tests and the scheme allow-list; the outline tree; the single sheet + tool state machine and the Back order. |
| Native wrapper | `services/pdf/pdfSession.ts` | Ref-counted pdfium sessions per uri (+ password). |
| Annotations | `services/annotations/{exportPdf,markHistory}.ts` | Flatten on export (cached); undo/redo. |
| Signature | `services/signature/signaturePlacement.ts` | A placement → an `OcrBounding` in page space → a PDF rect (through `pageMap`). |
| Files | `services/files/atomicWrite.ts` | Temp file in the same folder, then delete + move. |
| Viewers | `services/documents/{parseCache,txtIndex,sheetWindow,docxBridge}.ts`, `components/reader/viewers/{types.ts,useViewerFind.ts}` | The non-PDF contract. |
| UI | `components/reader/surface/{PageSurface,SurfacePageView,SurfaceOverlay,useSurfaceView,useSurfaceGestures,usePdfSession,useSurfaceFind,FastScroller,PagePill,SelectionMenu,MarkHeader,MarkToolbar,useMarkTool}.tsx/ts`, `components/reader/{FindBar,OutlineList,ReaderDocumentView,ReaderLoadProblem,ReaderSheets,useReaderSheets,useReaderSigning,useReaderOverflowActions,useReaderOrientation}.tsx/ts` | |

### A2. The page model: one `PageSource`
```ts
// services/reader/surfacePages.ts
export type PageSource =
  | { kind: 'image'; uri: string; pixelW: number; pixelH: number; imageTurn: PageRotation } // scan master / display copy
  | { kind: 'pdf'; page: number /* 0-based */; pointsW: number; pointsH: number };       // pdfium session page
export type SurfacePage = {
  id: string;            // library page id, or `ext:<n>`
  index: number;         // = library index (2-in-1 sheets are NOT shown as sheets)
  shownW: number; shownH: number;   // aspect as displayed (turn applied)
  source: PageSource;
  thumbUri?: string;     // instant placeholder (scans; indexed imported pages)
  space: PageSpace;      // how marks / OCR / word boxes map onto the shown page
  words: 'ocr' | 'live' | 'none';
  canMark: boolean;      // formatCapabilities.canMarkPage
};
export function surfacePagesFor(subject: ReaderSubject, session?: { pages: { width: number; height: number }[] }): SurfacePage[];
```
- **Scan (not PDF-level):** `image(displayUri ?? fileUri)`, with `imageTurn = space.turn = page.rotation`;
  space = master px. A 2-in-1 document reads as single library pages.
- **PDF-level** (imported, merged): always `pdf(idx)`, because `document.pdf` is the truth.
  - Shown size comes from the session's point sizes, never from stub rows.
  - An imported page: space = indexed px with `turn = page.rotation`. The render is already turned, so
    only the overlays turn.
  - A scan page merged into a PDF (`page.fileUri` set): space = master px placed through
    `imagePlacement` inside the PDF page (the same maths as `pdfLevelMapper`).
- **External PDF:** `pdf(idx)`; space = shown points.

### A3. pdf-native v2 (W7)
**pdfium is the surface's engine.** It opens password PDFs on every API level (PdfRenderer only from API
35), draws annotations and forms, renders regions through a matrix, and serves links, outline and text
from one open document.
```ts
nativeVersion(): number                                   // 2; JS feature-detects
openDocument(uri, password?): Promise<{ id; pageCount; pages: {width,height}[] /* points, shown */; hasOutline }>
closeDocument(id): Promise<void>
renderPageImage(id, page, { width, height, matrix?: number[6], colorMatrix?: number[20], annotations: boolean, quality, out }): Promise<{ uri; width; height }>
decodeImage(uri, { width, height, region?: {x,y,width,height} /* source px */, colorMatrix?, quality, out }): Promise<{ uri; width; height }>
getSessionPageText(id, page): Promise<PdfPageText>        // same shape as getPageText
getPageLinks(id, page): Promise<{ left; top; width; height; uri?: string; page?: number }[]>  // shown points, top-left
getOutline(id): Promise<{ title: string; page: number; children: … }[]>
// errors: ENCRYPTED (no password), PASSWORD_WRONG, READ_FAILED, SESSION_CLOSED, OUT_OF_RANGE
```
- **Threads:**
  - one single-thread executor for **all** pdfium calls (pdfium isn't thread-safe);
  - one for the colour matrix + JPEG encode + atomic write (`out.tmp` → rename), so render N+1 overlaps
    encode N;
  - one for `decodeImage`: `BitmapFactory` with `inSampleSize` + exact scale; `BitmapRegionDecoder` for
    tiles of masters.
  - A small bitmap pool by size.
- **Paths:** JS chooses `out` (a deterministic cache path), so the cache is shared across sessions.
- **Sessions:** at most 2 open, closed after 60 s idle or on `onTrimMemory`.
- **Unchanged:** the uri-based `getPageCount/getPageSize/renderPage/getPageText` (indexer, thumbnails).
- **iOS (W7b),** with PDFKit: `PDFDocument.unlock(withPassword:)`, `outlineRoot`, link `PDFAnnotation`s,
  `page.draw(with:to:)` with a transform, `CIColorMatrix`.

### A4. Render pipeline (W9, W10)
- **Layers per visible page** (bottom → top): paper colour → `thumbUri` placeholder → base render →
  tiles. All are RN `Image` with `fadeDuration={0}` and `resizeMethod="scale"`. An image stays until its
  replacement has loaded, so there's no grey flash. Fresco decodes off the UI thread.
- **Buckets:**
  - base = box width × pixel ratio;
  - ×2 once settled at scale ≥ 1.5, capped at 2400 px on the long side;
  - at scale ≥ `TILE_MIN_SCALE = 2.5`, 512 px tiles of the visible region at the current bucket (3, 4, 5,
    6), requested only after the gesture settles (150 ms); old tiles stay until new ones arrive.
  - Max zoom 6.
- **Queue priorities:**
  1. visible base (the centre page first);
  2. a low-res placeholder for visible pages without a thumbnail (external PDFs);
  3. visible tiles;
  4. prefetch ±2 pages in the scroll direction;
  5. Find's page text (the pdf lane, below renders).
- **Lanes:** pdf 1, image 1. The wanted set is replaced on every settle; jobs not started are dropped;
  late results are kept on disk but not shown.
- **Fast fling** (|v| > about 2500 px/s): thumbnails or low-res only; base renders once it slows.
- **Memory window:** images for current ±1 (±2 when zoomed out); thumbnails ±4. About 96 MB decoded.
- **Disk cache:**
  `Paths.cache/reader/<fnv(uri+size+mtime)>/p<page>-w<px>[-t<x>_<y>_<b>][-n<palette>].jpg`. The key
  changes when `document.pdf` changes, so Fresco never shows a stale file. LRU cap 200 MB, pruned when the
  Reader closes and at deferred boot. `deleteDocumentFiles` drops a document's folder.
- **Indexer:** `useImportedPdfIndexing` pauses while the Reader is open, so it never competes for the
  pdfium thread.
- **True dark pages:**
  - `darkPageMatrix(paper, ink)` = invert, then hue-rotate 180° (photos and diagrams roughly keep their
    hues), then map white → paper and black → ink.
  - `nightStrength` picks the paper: low `#2a2723`, medium `#201e1d`, high `#000`.
  - Applied natively to renders, decodes and thumbnails, so Skia never decodes JPEGs on the UI thread.
  - Toggling re-renders only the window.

### A5. One surface, one gesture arbiter
- **Tool state:** `SurfaceTool = 'read' | 'select' | 'mark' | 'sign'` (with `markTool` inside). The
  surface instance never changes, so zoom and position survive every mode change.
- **Gestures:** one `GestureDetector` (RNGH 2.32, worklets):
  - `Simultaneous(pinch, pan2)`: always zoom and scroll.
  - `pan1`:
    - read/select: scroll with `withDecay`; paged layout snaps (`pagedSnap`);
    - select, on a handle: drag the handle;
    - mark drawing tools: a **provisional** stroke;
    - mark Hand tool: scroll;
    - sign: move or resize the box when the drag starts on it, else scroll.
  - `Exclusive(doubleTap, singleTap)` in read/select only (double-tap zooms 1 ↔ 2.5 about the point).
    Mark tools get instant taps (note, eraser, word tap, text box).
  - `longPress` (400 ms): select a word (read/select).
- **The pinch race** (`gestureArbiter.strokeOutcome`): a stroke commits only if all of these hold:
  - the pointer count stayed 1 (`onTouchesDown` with 2 or more touches → `manager.fail()` + discard);
  - no pinch began within 120 ms of the stroke's start;
  - it isn't a tap-length jitter.

  This is decided in `onFinalize(success)`, not `onEnd`.
- **Live ink:** points go into a shared value on the UI thread and are drawn by the Skia overlay. No React
  render per move; commit in JS at the end.
- **Tap routing** (`routeTap`): a selection is open → clear it; a link under the finger → the link prompt;
  else toggle the chrome (never while Find is open).

### A6. Overlays in page coordinates
- **One screen-sized Skia `Canvas`** (`SurfaceOverlay`, `pointerEvents="none"`) above the page layer, with
  `<Group matrix={useDerivedValue(viewMatrix)}>` per visible page: `overlayMatrix(box, page.space)`, then the
  layers in order:
  1. search matches (all; the current one stronger);
  2. committed marks;
  3. signatures (their PNG, a Skia `Image`);
  4. the selection fill + handles;
  5. live ink;
  6. the signature placement box + handles.
- **Why Skia:** react-native-svg on Android draws into a bitmap of its own size, so marks blur under the
  zoom transform. Skia redraws vectors at screen resolution every frame on the UI thread.
- Paths are built per page in JS, memoised by page id + annotation `updatedAt`.
- Text boxes: Skia Paragraph with system fonts (any script); box sizes still come from
  `visibleText.measureText`.
- On dark pages, highlights use a lighter alpha and `screen` blend (`overlayPalette(night)`).
- Hit-tests: eraser, note and text box reuse `annotationAt` (`annotations/hitTest.ts`) on JS. Handles and
  the signature box are hit-tested in the worklet against shared-value geometry.

### A7. Find (W12)
- **`findIndex.buildPageIndex(tokens)`:**
  - tokens come from `readingOrderTokens(page.ocr)` (scans, indexed imported pages), or from live session
    text through `pdfTextToOcr` (pages past 300, un-indexed, external and password PDFs);
  - it builds a joined, normalised text (NFKC, lower case, collapsed whitespace, soft hyphens removed,
    line breaks as spaces) with a char → token map.
- **`findInPage(index, query)`** → matches with rects (a union per line; a substring of a word gets a
  proportional sub-rect).
- **`useSurfaceFind`:**
  - progressive search: current page → end → wrap to the start;
  - a generation token per query, checked between pages; 150 ms debounce; page text cached per session;
  - counts read "3 of 27+" while scanning, then "3 of 27";
  - the first current match is the first at or after the reading position (`anchorOf`);
  - next/prev wrap; `revealRect` scrolls the match into the band between the bars.
- A library search result (`reader/SET_TARGET`) starts Find on that page. The Notes panel flash draws
  the mark's own geometry (no more five-word text search).

### A8. Selection (W13)
- Long-press selects a word. Two handles, drawn in Skia and dragged through the arbiter, use
  `tokenAt`/`selectBetween`.
- `SelectionMenu` floats above the selection, clamped to the visible band: **Copy · Share · Highlight ·
  Underline · Select all** (Select all replaces "Copy page text"), plus **Run OCR** on a scan page with no
  text. External PDFs: Copy and Share only.
- One page per selection in v1. Logic from `SelectTextSheet` (`markSelection`, `rerunOcr`) moves into
  `useSelectionActions`.

### A9. Annotations and signatures: drawn live, flattened only when the file leaves the app
- **Invariant (from W17): `document.pdf` never contains our marks or signatures.** Everything that
  leaves the app goes through `exportPdf.annotatedPdfFor(doc, annotations)`:
  - `removeOurAnnotations` + `writeAnnotations` (idempotent, so old baked marks are fine), with
    signatures drawn as images at their rect;
  - written atomically to `Paths.cache/export/<docId>-<fingerprint>.pdf`;
  - fingerprint = base size + mtime + annotation ids + max `updatedAt`, so a repeated share is instant.
- **Why:** the surface renders imported PDFs with annotations **on** (the teacher's marks, filled forms),
  so our baked marks would draw twice.

| Path | Today | After W14/W17 |
|---|---|---|
| Reader display | pdf-jsi draws baked marks | Live Skia overlay from the store |
| Leaving Mark mode / Select → highlight | `useAnnotationPdfSync` (pdf-lib on the JS thread) + viewer reload | Nothing (the row is already saved); hook deleted (W17) |
| Share / Export / Print | `doc.pdfUri` | `annotatedPdfFor` (W14) |
| Device export | `doc.pdfUri` | `annotatedPdfFor` (W14) |
| Submit, scan (`submitDocument` `beforeSave`) | Rebuild + marks | Unchanged (already writes rows) |
| Submit, PDF-level (`submitPdfLevel`) | Sends `doc.pdfUri` (baked) | `writeAnnotations(original, …)` before decorate/save when `preset.includeAnnotations` (W14) |
| Backup readable copy | The stored `document.pdf` | The annotated copy as the readable entry; `restoreBackup` strips ours from restored PDF-level documents that have rows (W14) |
| Merge / split / edit pages / compress | Bake marks via hooks, or copy baked `/Annots` | Hooks removed (W17); rows follow by page id (`keepIds`); bases stay clean |
| `addCover`, `buildExamPack` | `beforeSave` writes marks | Removed (W17); the pack already returns its annotation rows |
| Fill form copy (`edit/pdfForm.ts`) | Copy of the baked base | Copy of the clean base + the rows copied to the new page ids (W14) |
| Convert to Word | Text only | Unchanged |
- **Migration** (pre-launch, so mostly dev data): a one-shot `useCleanPdfBases` (W17) strips ours from
  PDF-level documents that have rows, one at a time, atomically. Until a document is clean, the surface
  renders it with `annotations: false`.
- **Guard test:** `writeAnnotations(` only in `exportPdf.ts` and `submitDocument.ts`.

### A10. Sign
- Placement on the live page: the overlay box with handles in page space; Place, "Bottom right", Redraw,
  Cancel.
- The signature becomes an annotation row: `kind: 'signature'`, data `{ box: OcrBounding (page space),
  file: 'sig_<id>.png' }`. The PNG is a **copy** of the saved signature, in the document's folder
  (`libraryFiles.getDocumentDir`), so replacing the reusable signature never changes a signed document.
- It is drawn live (A6) and flattened by `exportPdf` through the same page mapping as marks (`pdfRectFor`
  for scans: 2-in-1, covers and turned columns; `pdfLevelMapper` for PDF-level).
- Rebuilds keep it because rows follow page ids (fixes A0-14). It can be moved or deleted with the
  eraser like any mark.
- Backup and restore carry the PNG (check `backup/format.ts`'s file list in W16).

### A11. Chrome, insets, scrolling aids
- **`ContentInsets {top, bottom, left, right}`** come from the **measured** bar heights (the top bar's
  `onLayout`; the bottom through `useReportBottomBar` in `components/shared/bottomBarHeight.ts`) plus the
  safe area. The layout pads the first page below the top inset and the last page above the bottom one.
  Mid-document the bars may overlay content, but jumps, Find and selection reveal content into the
  visible band. Toggling the bars never shifts content.
- **`chromeState`:**
  - hide after about 24 px of forward scroll; show on backward scroll, at the end, or on a tap;
  - locked visible while Find, a sheet, or the Mark/Sign tool is open;
  - the bars translate by their measured height; chrome progress is a Reanimated shared value.
- **Fast scroller** (8 or more pages): on the right edge, inset 12 dp (predictive back is on); it shows
  on scroll and fades 1.2 s after. Dragging it shows a bubble ("12 / 300" + the outline section);
  `accessibilityRole="adjustable"`.
- **Page pill:** "12 / 300", bottom centre, visible during scroll even with the bars hidden. Library
  numbering (agrees with the scrubber).

### A12. Position and resume
- **The anchor** `anchorOf` = `{pageId, fy, fx}` at the top of the visible band.
- The initial view is computed **synchronously** once the viewport (and, for PDF-level and external
  documents, the session's sizes) is known. Before that only the paper background paints, so there's no
  page-1 frame.
- **Saving:** only from the **active** instance (`useScreenRole() === 'active'`, §16 G2), debounced
  800 ms and on blur.
- **Storage:** W10 converts `lastPage` (a PDF page) through `libraryIdxFor`/`pdfPageFor`. W19 adds a
  `last_position` JSON column (`{kind:'page', pageId, fy}` | txt | sheet | docx), which survives
  reorders and cover inserts.

### A13. Landscape
- `useReaderOrientation`: `ScreenOrientation.unlockAsync()` (follows the user's auto-rotate) while the
  Reader is active; `await lockAsync(PORTRAIT_UP)` **before** leaving.
- The layout re-anchors through `anchorOf`/`viewForAnchor` on a viewport change and uses
  `insets.left/right` (a side 3-button bar).
- Android 16 ignores orientation locks on large screens, so every viewer must re-lay out anyway.

### A14. Accessibility
- Visible pages are accessibility elements: "Page 12 of 300", with actions `scrollForward`/
  `scrollBackward` (± a page), "Zoom in"/"Zoom out", and "Read page text" (a sheet with the page's
  text).
- The settled page is announced (`announceForAccessibility`, throttled). Jumps skip animation under
  reduced motion.
- Everything passes `a11yLabels.test.ts` and `hardcodedStrings.test.ts`.

### A15. The non-PDF viewer contract (W19)
```ts
type ViewerFind = { query: string; index: number };            // current match, -1 none
type ViewerFindResult = { count: number; index: number; partial?: boolean };
type ViewerPosition = { kind: 'txt'; chunk: number; fy: number } | { kind: 'sheet'; sheet: number; row: number; col: number } | { kind: 'docx'; fraction: number };
type ViewerProps = { uri: string; night: boolean; insets: ContentInsets; onTap(): void; find: ViewerFind;
  onFindResult(r: ViewerFindResult): void; initialPosition?: ViewerPosition; onPosition(p: ViewerPosition): void;
  onScrollDirection(dir: 'forward' | 'back'): void };
```
- `useViewerFind`, `FindBar` and `findCursor` are shared with the surface.
- `parseCache`: an in-memory LRU keyed by uri + size + mtime (2 workbooks, 2 DOCX), plus a disk cache for
  the DOCX HTML.

### A16. ReaderScreen structure (W6)
- **`ReaderScreen`** (thin): checks the screen role, picks the subject, and renders
  `<ReaderDocumentView key={contentKey}/>`. The key replaces the reset effects in
  `useReaderDocument`/`useReaderFind`.
- **`ReaderDocumentView`** composes:
  - `useReaderDocument`;
  - `useReaderSheets` (the `readerSheets` reducer: `sheet: null | {kind: 'more'|'reading'|'type'|'jump'|
    'pages'|'submissions'|'bookmarks'|'notes'|'label'|'rename'|'move'|'signCapture'}`, plus `tool`);
  - `useReaderChrome`;
  - `useReaderOverflowActions` (a `Record<ReaderMoreItemId, handler>`);
  - `useReaderSigning`;
  - `ReaderLoadProblem` and `ReaderSheets`.

---

## W1 · Sign on the right page *(S)*
Status: planned. JS only.

Goal: a signature lands on the library page on screen (also on 2-in-1, cover and turned pages), and the
saved signature survives.

Files:
- `screens/ReaderScreen.tsx` (`:399-401`, `:432`, `:437`, `:742-746`)
- new `services/signature/signaturePlacement.ts`
- `services/persistence/libraryOperations.ts` (`applySignatureToDocument`)
- `services/pdf/pdfService.ts` (`applySignatureToPdf`)
- `components/library/useDocumentListActions.tsx` (same service; page 1)

Changes:
- One `signIdx = libraryIdxFor(doc, activeIndex + 1)` for `usePageImage`, `SignatureModal`'s page,
  `applySignedPage` and the snack's page number.
- `signatureDraw(doc, libraryIdx, placement) → { pageIndex, x, y, width, height, rotate }`:
  - turns the placement into an `OcrBounding` and goes through `pdfRectFor`;
  - `boxMatrix` from `pdf/rotation.ts` gives the rotation for a turned 2-up column;
  - `applySignatureToDocument` draws at that rect, on that PDF page, with pdf-lib `rotate`. This replaces
    the `fitToMarginBox` maths for scans.
- Remove `signatureFile.delete()` (`pdfService.ts:588`); callers own their file. The temporary files
  some callers pass (a fresh drawing) are cleaned by `cleanTemporaryCache`.
- (W16 later turns signatures into rows; W1 is the quick, correct fix with today's model.)

Tests: `signaturePlacement.test.ts` covers standard, template cover, imported-image cover, 2-in-1
left/right, a turned 90° column and `fullPage`. With the file-system mock: the signature input still
exists after `applySignatureToPdf`.

Device check: on `[2in1]`, sign page 3 (the right column of sheet 2); the shared PDF has it there.
Sign again with the saved signature: it works.

## W2 · Find and chrome hygiene *(S)*
Status: planned. JS only.

Goal: Find never shows a stale result or leaves highlights behind, and the bars behave.

Files: `components/reader/useReaderFind.ts`, `ReaderScreen.tsx` (`:498`, `:502`, `:585`),
`ReaderTopChrome.tsx`, `ReaderToolBar.tsx`, `services/documents/formatCapabilities.ts`, new
`services/reader/findRunner.ts`.

Changes:
- `createFindRunner(search)`: a generation token per query; stale results are dropped, and a result
  that arrives after Find closes is ignored.
- `close()` clears the query, results and highlights.
- Pass `undefined`, not a fresh `[]`, for `highlightRects` (this lessens pdf-jsi's yank, A0-3).
- A tap while Find is open doesn't toggle the bars.
- Add `'JPG'` to `IN_READER_FIND_FORMATS`: its `document.pdf` has the OCR text layer.
- Both bars translate by their measured height (top and bottom), not 60 px.

Tests: `findRunner.test.ts` (out-of-order resolves; close resets); `capabilities.test.ts` updated.

Device check: on `[300p]` type fast: the final count wins. Close Find: no highlights. Tap with Find open:
the bar stays. Find works on `[jpg]`. With 3-button navigation the bottom bar hides fully.

## W3 · Safe writes, preview preparation, external page count *(S)*
Status: planned. JS only.

Goal: no write can lose a document, preparing a preview can't hang, and opening an outside PDF is fast.

Files:
- new `services/files/atomicWrite.ts` (`writeFileReplacing(dest, bytes)`, `moveReplacing(src, dest)`)
- `annotations/pdfAnnotations.ts:331`, `pdf/pdfOps.ts:33`, `pdf/pdfService.ts:527`, `:622`,
  `persistence/addCover.ts:143`, `persistence/libraryOperations.ts:314`
- `storage/integrity.ts` (recover or delete `.<name>.tmp-*` leftovers)
- `pdf/pdfService.ts` (`ensureDocumentPdfOnce`: single flight per document id)
- `components/reader/useReaderDocument.ts:69-73` (`.catch` → `previewFailed` + Retry)
- `files/externalFileService.ts:50-54` (`pdfNative.getPageCount`; `undefined` on ENCRYPTED or
  unavailable; §16 G4 does the same — whichever lands first)

Changes: write to `.<name>.tmp-<id>` in the same folder, then delete the old file and move the temp into
place. If the move fails, the old file is still there; if the app dies between delete and move, the
integrity check finds the temp and moves it into place.

Tests: the destination keeps its old bytes when a write throws; leftover recovery; two concurrent ensures
→ one build; the external import uses the `pdfNative` mock with no pdf-lib parse.

Device check: kill the app while marks are being written: the document still opens. An old document
without a PDF shows "Preparing preview", then the document or "Couldn't prepare · Retry". `[ext300]` opens
fast.

## W4 · Non-PDF quick fixes *(S)*
Status: planned. JS only.

Goal: the worst DOCX, sheet and TXT problems are fixed before their full rework (W19–W22).

Files: `components/reader/SheetView.tsx`, `TxtView.tsx`, `services/documents/txtService.ts`,
`DocxView.tsx`, `services/documents/docxService.ts`, `ReaderScreen.tsx` (DOCX `onTap`).

Changes:
- **`SheetView`:** `getItemLayout` from `sheetRowHeight(zoom)`, with an explicit `lineHeight`.
- **`TxtView`:** `onScrollToIndexFailed` scrolls to an estimated offset, then retries up to 3 times.
- **`txtService`:** `readTextPrefix(uri, TXT_MAX_BYTES = 4 MB)` through a FileHandle, cut at a UTF-8
  boundary. The banner says "Showing the first 4 MB". `promoteExternalToLibrary` uses the prefix too.
- **DOCX:** `docxPageHtml` takes `padTop` = the top inset. A fixed click script sends
  `postMessage('tap')`; `onMessage` accepts exactly `'tap'` (update the WebView's security comment).

Tests: `sheetRowHeight`; `readTextPrefix` (multi-byte boundary, BOM); `docxPageHtml` padding; the message
filter rejects anything else.

Device check: `[csv50k]` Find jumps to row 40,000. `[txt12]` opens with the banner. `[docx]`: the first
heading sits below the bar, and a tap toggles the bars.

## W5 · Position robustness *(S)*
Status: planned. JS only. Needs §16 G2 (`useScreenRole`).

Goal: the Reader always reopens where you left it, and edits never throw you back to page 1.

Files: `ReaderScreen.tsx`, `useReaderDocument.ts`, `useEditPages.tsx`, `EditPagesModal.tsx:54-59`,
`services/documents/readerPosition.ts`, `ReaderTopChrome.tsx`, `useAnnotationPdfSync.ts` (role check).

Changes:
- **Roles:** a hidden or outgoing Reader renders an inert view: no load, no save, no sync flush.
- **`lastPage`** is saved only by a restored, active instance.
- **The resume page** goes to `PdfPageView`'s `initialPage` on the first mount.
- **`pdfPageAfterEdit(oldDoc, newDoc, pdfPage)`** (by page id) keeps your page after Edit pages.
  `promoted.lastPage` is set before `ADD_FILE` (Add to library).
- **The Edit pages draft** resets only when the editor opens or the page-id list changes.
- **The password card** gets keyboard handling (§14 Q4's rule).
- **`pageLabel(doc, pdfPage)`** puts library numbers in the top bar, so it agrees with the scrubber.

Tests: `pdfPageAfterEdit`, `pageLabel`, the role default.

Device check: at page 50, Back during the slide, reopen: page 50. Reorder pages: you stay on your page.
Add to library keeps the page. The password field stays above the keyboard. On `[2in1]` the bar and the
scrubber agree.

## W6 · ReaderScreen split and the sheet state machine *(M)*
Status: planned. JS only. **No UI change.**

Goal: the Reader is small files with one state machine, so W10–W17 each change a small file once.

Files: new `services/reader/readerSheets.ts`,
`components/reader/{ReaderDocumentView,ReaderLoadProblem,ReaderSheets,useReaderSheets,useReaderOverflowActions,useReaderSigning}.tsx/ts`;
`ReaderScreen.tsx` shrinks to about 150 lines; `useReaderDocument.ts` and `useReaderFind.ts` lose their
reset effects (`key={contentKey}` does it).

Tests: the reducer (one sheet at a time; Back order sheet → tool → Find → leave; chrome lock); the
handler table covers every `ReaderMoreItemId` (exhaustive at the type level).

Device check: every More item, hint and Back behaves as before.

## W7 · pdf-native v2 *(L; needs a new dev build)*
Status: planned. Split point: (a) Android + the lab screen; (b) iOS (PDFKit).

Goal: the native API the surface needs (A3), measured on a real phone before the surface is built.

Files: `modules/pdf-native/android/.../PdfNativeModule.kt` (+ new `PdfSessions.kt`, `PageRenderer.kt`,
`ImageDecoding.kt`), `modules/pdf-native/index.ts`, `modules/pdf-native/ios/PdfNativeModule.swift`,
`services/pdf/pdfNative.ts`, new `services/pdf/pdfSession.ts`, `src/test/mocks/pdfNative.ts`,
`package.json` (`npx expo install expo-screen-orientation`; read the SDK 57 docs first), new
`src/dev/ReaderLabScreen.tsx`.

Changes:
- **The API in A3.** JS computes every matrix and colour matrix, and native only applies them, so the
  maths is Jest-tested.
- Page sizes in `openDocument` come from pdfium's size-by-index; check they are the rotated, shown sizes.
- Error codes map to `PdfEncryptedError` and a new `PdfWrongPasswordError`.
- **The lab screen** (dev only):
  - times a text page and an image page at 1080 px and as a 4× tile;
  - opens a password PDF;
  - lists links and the outline;
  - renders a page with annotations on and off.
- If §16 G4's embedded fonts or G6's `expo-image` are ready, add them to this dev build.

Tests: wrapper error mapping, `nativeVersion` detection, session ref counting (opened twice → one native
open; closed on the last release).

Device check (lab screen):
- record the render times in `docs/qa/performance.md`;
- `openDocument` on 300 pages takes ≤ 150 ms;
- a PDF with a highlight annotation: pdfium with annotations draws it, the old `renderPage` doesn't
  (confirms A0 §5);
- on a rotated PDF, sizes and tile orientation are right;
- `[pw]` opens with the right password; a wrong one gives `PASSWORD_WRONG`;
- the orientation unlock works with `app.json` `"portrait"`.

## W8 · Surface geometry *(M)*
Status: planned. JS only; no device check.

Files: new `services/reader/{surfaceGeometry,pageSpace,surfacePages,fastScroll}.ts`;
`annotations/markMode.ts` re-exports `columnLayout`, `clampView`, `zoomAbout`, `pageAtY`, `currentPage`,
`viewForPage`, `screenToContent` and `contentToMaster` (MarkView keeps working).

Tests:
- mixed page sizes and turns; fit width and fit page;
- clamping with insets; `currentPage` inside the band;
- the anchor round-trip portrait → landscape → portrait (within 1 px);
- double tap; paged snap; `revealRect`;
- `overlayMatrix` for 0/90/180/270 and for a placement;
- `surfacePagesFor`: `[2in1]` with a cover → single pages in library numbering; a PDF-level document with
  a merged scan page; external.

## W9 · Render queue, page cache, dark matrix *(M)*
Status: planned. JS only; no device check.

Files: new `services/reader/{renderPlan,renderQueue,pageCache,darkMatrix}.ts`, `utils/hash.ts` (FNV-1a),
`components/reader/surface/useRenderQueue.ts`; `persistence/libraryFiles.deleteDocumentFiles` drops the
cache folder.

Tests:
- the queue: priority order, dedupe, dropping unwanted jobs, lanes, re-prioritising mid-run (a fake
  executor and clock);
- cache keys stable and unique; LRU prune order;
- the dark matrix: white → paper, black → ink, red and blue keep their hue within tolerance;
- tiles cover the region without gaps at 3×/5×; `regionMatrix` maps the region's corners to the output's
  corners.

## W10 · Read-only surface behind a flag *(L)*
Status: planned. JS only. Split point: (a) layout, gestures, render, resume; (b) chrome, fast scroll,
pill, dark pages, live settings.

Goal: PDFs and scans read on the new surface: sharp, fast, dark-capable, never covered, resuming in place.

Files:
- `components/reader/surface/{PageSurface,SurfacePageView,SurfaceOverlay,useSurfaceView,useSurfaceGestures,usePdfSession,FastScroller,PagePill}.tsx/ts`
- `useReaderChrome.ts` (Reanimated, measured, auto-hide), `ReaderTopChrome.tsx`, `ReaderToolBar.tsx`
- new `services/reader/chromeState.ts`
- `services/remote/remoteConfig.ts` (`readerSurface: {key: 'reader_surface', parse: bool}`, default false;
  a dev override in Settings → Developer)
- `services/documents/readingSettings.ts` (strength → palette), `ReadingSettingsSheet.tsx`
- `store/useImportedPdfIndexing.ts` (pause while the Reader is open)
- `ReaderDocumentView.tsx` (engine choice: page-raster format + `nativeVersion() ≥ 2` + the flag)

Changes:
- A4, A5 (the read tool), A11 and A12.
- Mark, Select and Sign still open the old overlays, synced by page index.
- Find is hidden under the flag until W12.

Tests: `chromeState`; the engine choice; the palette.

Device check:
- `[300p]` fast fling top to bottom: never blank, sharp within 250 ms of settling;
- opens at saved page 150 with no page-1 frame (screen recording);
- 5× pinch: sharp text;
- night: inverted pages, photos keep their hues;
- fit, spacing and paged change live with no jump; the bars fully hide and come back;
- the pill and the thumb: drag to page 280;
- memory steady below 350 MB PSS over 5 minutes;
- `[2in1]` shows single pages; `[pw]` works as an external file.

## W11 · Links, contents, landscape, accessibility *(M; a dev build only if orientation needs `app.json`)*
Status: planned.

Files: new `services/reader/{links,outline}.ts`, `components/reader/OutlineList.tsx`,
`PageScrubberSheet.tsx` ("Pages | Contents" through `shared/SegmentedControl`),
`useReaderOrientation.ts`, PageSurface (tap routing, a11y actions, announcements), `FastScroller`
(adjustable).

Changes:
- External links ask first, showing the URL: Open / Copy / Cancel. Internal links jump.
- Orientation as in A13. If the runtime unlock fails under `"portrait"`, fall back to `app.json`
  `"default"` + `lockAsync(PORTRAIT_UP)` at boot while the native splash is held (needs a prebuild and a
  dev build).
- Accessibility as in A14.

Tests: `linkAt` slop; the scheme allow-list; outline flattening and caps (2000 entries, depth 8);
`currentSection(page)`.

Device check: an internal link jumps; an external one asks first. The Contents tab jumps. Rotate at page
120 zoomed 2×: same spot. Leaving the Reader in landscape: Library is in portrait with no glitch.
TalkBack: "Page 12 of 300", scroll actions, the adjustable thumb.

## W12 · Find on the surface *(M)*
Status: planned. JS only.

Files: new `services/reader/{findIndex,findCursor}.ts`, `components/reader/surface/useSurfaceFind.ts`,
`components/reader/FindBar.tsx`, SurfaceOverlay (matches), ReaderDocumentView (the target; the notes flash
from the mark's geometry), `formatCapabilities.ts`.

Changes: A7. `FindBar`: the query, "3 of 27", prev/next, close; it sits in the top bar and keeps the bars
visible while open.

Tests: normalisation (case, NFKC ligatures, soft hyphen, line breaks); multi-word matches across lines;
substring rects; ordering from the position; wrap; stale generations ignored; partial counts.

Device check: `[300p]` "the": "1 of N+", then the final count; prev/next wrap; every match visible and the
current one stronger; never under the bars. `[ext300]` finds progressively; `[pw]` finds. A library search
result opens with the match highlighted. The Notes panel flash works.

## W13 · In-page text selection *(M)*
Status: planned. JS only.

Files: new `services/reader/selection.ts`, `components/reader/surface/SelectionMenu.tsx`,
`useSelectionActions.ts` (from `SelectTextSheet.markSelection`/`rerunOcr`), the arbiter (long press,
handles). The bottom bar's "Select text" tool switches the surface to `select`.

Changes: A8.

Tests: handles extend and shrink; the menu is clamped to the band; Select all equals the page's text.

Device check: long-press, drag across lines, Copy (a scan and `[300p]`). External: Copy only. A
highlight made from the selection appears at once with no reload.

## W14 · Exports carry the marks *(M)*
Status: planned. JS only. Works with both engines (idempotent). Can move anywhere before W15.

Files: new `services/annotations/exportPdf.ts`; `sharing/shareService.ts`; the Reader's `'export'` handler
(in `useReaderOverflowActions` after W6); `export/deviceExportService.ts`; `submit/submitDocument.ts`
(`submitPdfLevel`); `backup/{createBackup,format,restoreBackup}.ts` (the annotated readable copy; strip on
restore); `edit/pdfForm.ts` (rows copied to the new page ids).

Changes: the table in A9.

Tests: real pdf-lib with the fixtures in `src/test/pdfs.ts`: marks present exactly once; a cache hit; a new
fingerprint after an annotation update; the backup's readable copy has the marks; restore strips them.

Device check: mark, then share at once (the received PDF has the marks); print preview; device-folder
export; submit an imported PDF with marks.

## W15 · Mark mode on the surface *(L)*
Status: planned. JS only. Split point: (a) the arbiter + live ink + the overlay; (b) the toolbar, the text
and notes tools, undo.

Files: new `services/annotations/markHistory.ts`, `services/reader/gestureArbiter.ts`,
`components/reader/surface/{MarkHeader,MarkToolbar,useMarkTool}.tsx/ts` (the palette UI extracted from
`MarkView.tsx:467-569`), SurfaceOverlay (marks + live ink), ReaderDocumentView (the flag path skips
`useAnnotationPdfSync`).

Changes:
- A5 and A6.
- Scan pages show turned, with the overlays turned the same way.
- Reuse `snapHighlight`, `annotationAt`, `textBoxAt`, `moveBox`, `textSizeFor`, `isDrawingTool` and
  `palette.ts`. The Text tool stays Pro (through §12 D1's gate).

Tests: `strokeOutcome` for the pinch-race sequences; `markHistory` do/undo/redo/edit; the overlay builder
per kind.

Device check: 120 fast pen strokes, no lag; pinch with a finger already down, no stray mark; eraser, note,
Text (Pro) drag; marks crisp at 5×; Done: no reload, same position.

## W16 · Sign on the surface, as a row *(M)*
Status: planned. JS only.

Files: `types/models.ts` (`AnnotationKind` + `'signature'`, its `AnnotationData`), `services/signature/signaturePlacement.ts`,
`services/annotations/{pdfAnnotations,exportPdf}.ts` (draw signature rows), `useReaderSigning.ts` (the surface
`sign` tool), `persistence/libraryOperations.ts` (the Library's page-1 signing on the same service;
`applySignatureToDocument` kept only for old callers until W17), `persistence/libraryFiles.ts` (the PNG copy),
`backup/format.ts` (the PNG in the file list), `annotations/hitTest.ts` (move/erase a signature);
`SignatureModal` and `SignaturePlacementOverlay` are retired in the Reader.

Changes: A10. The migration at `persistence/migrations.ts` isn't needed if `annotations.kind` is free text
(check); otherwise add the kind.

Tests: placement maths; a signature row flattened through `exportPdf` lands on the right PDF page and rect
for `[2in1]`, a cover and a turned page (pdf-lib fixtures); the PNG copy (replacing the saved signature
doesn't change the row's file); rebuilds (`savePageEdit`, `compressDocument`) keep the row.

Device check: sign page 3 of `[2in1]`: it shows at once, at the same zoom. The shared PDF has it on the
right column. It survives Edit pages and Compress. Erase it, then share again: gone. An imported PDF shows
it at once.

## W17 · The surface becomes the reader *(M)*
Status: planned. JS only.

Files:
- the flag defaults to true;
- remove `beforeSave`/`annotationsHook` from `libraryOperations.ts`, `pageEdits.ts`, `addCover.ts` and
  `buildExamPack.ts`;
- new guard test `annotations/__tests__/annotationWriters.test.ts`;
- new `store/useCleanPdfBases.ts` (one-shot, `processSequentially`, a settings key with the cleaned ids);
- delete `useAnnotationPdfSync.ts`;
- scans no longer need `document.pdf` to be read (`ensureDocumentPdfOnce` runs only at export).

Tests: the guard; the migration runner (sequential, resumable, skips documents without rows).

Device check: a full regression on `[300p] [ext300] [pw] [2in1] [jpg]`: marks, sign, share, print, backup,
restore.

## W18 · Remove react-native-pdf-jsi *(M; needs a new dev build)*
Status: planned. Needs W7(b) so the iOS build keeps working.

Files:
- delete `PdfPageView.tsx`, `useMarkFlash.ts`, `MarkView.tsx`, `useMarkPageImages.ts`, `SelectTextSheet.tsx`,
  `PageCanvas.tsx` (if unused) and pdf-jsi's Find code;
- `readerPosition.classifyPdfError` → `classifyNativePdfError(code)`;
- the `app.json` plugin and the `package.json` dependency (review the diffs: security rule);
- the `pdf-native` gradle comment about sharing pdfium with pdf-jsi (pdfiumandroid stays, ours now);
- `AGENTS.md` (the Reader pipeline paragraph);
- a guard test: no imports of `react-native-pdf-jsi`.

Device check: `npx expo prebuild --clean`; APK size before and after; pdfium `.so` packaged once; a full
reader regression; the iOS build compiles.

## W19 · Viewer contract, parse cache, positions *(M)*
Status: planned. JS only.

Files: `components/reader/viewers/{types.ts,useViewerFind.ts}`, `services/documents/parseCache.ts`,
`persistence/migrations.ts` + `libraryRepo.ts` (`last_position TEXT`), `librarySlice` (`SET_LAST_POSITION`),
the backup `TABLES` columns, `readerPosition.ts` (`encodePosition`/`decodePosition`/`normalizePosition`),
an AsyncStorage LRU (50) for external files' positions keyed by `sourceUri|size`. All four viewers get
insets, `onTap`, `onScrollDirection` and the position props; the surface writes `{kind:'page', pageId, fy}`.

Changes: A15. Landscape and auto-hide in every viewer.

Tests: cache LRU and mtime invalidation; position round-trips and normalising damaged JSON; the migration.

Device check: reopening an XLSX is instant; each format restores its position; landscape and auto-hide work
in every viewer.

## W20 · TXT *(S)*
Status: planned. JS only.

Files: new `services/documents/txtIndex.ts` (`buildTxtIndex`: lower-cased once, with chunk offsets;
`findAll` capped at 10,000; `chunkSegments`), `TxtView.tsx` (highlight spans, the current match, scrolling
from measured heights, the position, theme tokens instead of hex).

Tests: case folding; matches across chunks; the cap; segments.

Device check: `[txt3]` "the": next/prev with highlights; typing stays smooth.

## W21 · Sheets *(L)*
Status: planned. JS only. Split point: (a) the capped parse + column window + letters; (b) focal zoom +
the cell sheet + Find.

Files:
- new `services/documents/sheetWindow.ts`: `columnOffsets`, `columnWindow`, `focalScroll`, `rowHeight`,
  `columnLetter`, `cellMatches`, `cellAddress`;
- `sheetService.ts`: `sheetRows: 5000`, `dense`, one sheet per parse (`sheets`), the truncation note from
  `!fullref`, Papa `preview` for CSV. §12 D8's editor (`readWorkbook`) is unchanged;
- `SheetView.tsx`:
  - frozen column letters + a row-number gutter + the first row;
  - the horizontal window;
  - pinch as a preview transform, committed around the focal point;
  - tap a cell → `CellDetailSheet` (address, full text, Copy);
  - Find counts **cells** and next/prev scrolls both axes;
  - the position; tokens.

Tests: the window functions; the capped parse with a fixture workbook; `cellMatches`.

Device check: `[xlsx5]` opens in under 3 s with the "first 5,000 rows" note; smooth across 150 columns;
pinch keeps the cell under the fingers; tapping a cell shows its text; Find "total" → "2 of 14" scrolls
sideways. `[csv50k]` too.

## W22 · DOCX *(M)*
Status: planned. JS only.

Files:
- new `services/documents/docxBridge.ts`:
  - constant scripts: a TreeWalker find/mark/count/scroll with the top inset, tap, throttled scroll
    position, `setNight`, `setInsets`, `scrollToFraction`, link intercept;
  - `callScript(name, args)` with JSON + U+2028/2029 escaping;
  - `parseDocxMessage` (a strict schema);
- `docxService.docxPageHtml`: both palettes (`body.night`);
- `DocxView.tsx`: no reload per query or night toggle; HTML from `parseCache`; the position restored
  after load;
- `docxFind.ts` retired.

Tests: `parseDocxMessage` rejects junk; escaping (quotes, `</script>`, U+2028); the night CSS is present.

Device check: `[docx]` Find with no flicker or reload; night is instant; a tap toggles the bars; a link asks
first; reopen restores the scroll position.

## W23 · Grouped More sheet + Rename, Move, Star and page tools *(M)*
Status: planned. JS only. Needs §17 U3's `Menu`; shares §17 U7's `useDocumentActions` (Rename, Move, Star)
— whichever of U7 and W23 lands first builds it.

Files: `services/documents/readerTools.ts` (`readerMoreSections` replaces `readerMoreItems`),
`OverflowSheet.tsx` (→ `Menu` sections), `useReaderOverflowActions.ts`, `components/library/useDocumentActions.ts`,
`i18n/en.ts`.

Changes:
- **Share & export:** Submit, Share (PDF: one item; JPG: "Share as PDF" + "Share images"), Print.
- **Organise:** Add to library (external), Rename, Move to course, Star, Type, Edit pages, Cover,
  Split into pages, Compress.
- **Study:** Save text as a file.
- **Document:** Sign, Reading settings, Delete (last).
- **Removed from More:** Bookmarks (the top bar + Notes), Copy page text (selection), Convert/Edit/Fill
  form (the bottom bar).
- Fix the JPG share/print gap: a multi-page JPG document shares every page, or a PDF made on the fly
  (`shareService.ts:41-44, 56-57`).

Tests: per subject (scan PDF, JPG, imported, password, external, office): no duplicates within More or
with the bottom bar; a stable order.

Device check: at 360 dp the sheet fits or scrolls gracefully; Rename updates the title and search; Move and
Star show in Files; Split returns to Files with a snack.

---

## Order and dependencies
W1 → W2 → W3 → W4 → (§16 G2) → W5 → W6 → **W7 (dev build)** → W8 → W9 → W10 → W11 → W12 → W13 → W14 →
W15 → W16 → W17 → **W18 (dev build)** → W19 → W20 → W21 → W22 → (§17 U3) → W23.
- W8 and W9 need no device and can run while W7's dev build is being made.
- W14 can move anywhere before W15.
- W20–W22 need only W19.

## Audit → step map
| Finding | Step |
|---|---|
| A0-1 sign index | W1 (+W16) |
| A0-2 settings not live | W10 |
| A0-3 highlight yank | W2 (mitigation), W12 |
| A0-4 `setNativePage` | W5 (mitigation), W18 |
| A0-5 double mount, `lastSeenPage` | §16 G2, W5 |
| A0-6 Find races | W2, W12 |
| A0-7 highlights after closing Find | W2 |
| A0-8 `scrollToIndex` | W4 (+W20, W21) |
| A0-9 delete-then-write | W3 |
| A0-10 preview prep | W3 |
| A0-11 TXT cap | W4 |
| A0-12 DOCX top and tap | W4 (+W22) |
| A0-13 saved signature deleted | W1 |
| A0-14 signature lost on rebuild | W16 |
| A1 insets | W10, W19 |
| A1 resume jump | W5, W10 |
| A1 pdf-lib on leaving Mark mode | W15, W17 |
| A1 page 1 after edit / add | W5 |
| A1 grey flash, night overlay, export-compressed scans, blank pages | W10 |
| A1 next-after-current, n of N, password, notes flash | W12 |
| A1 JPG Find, tap with Find open, the 60 px bar | W2 |
| A1 TXT Find | W20 |
| A1 DOCX reloads | W22 |
| A1 sheets | W21 |
| A1 pinch race, pen lag, unturned scans, stub sizes | W15, W8/W10 |
| A1 Edit pages draft, password keyboard, 2-in-1 numbers | W5 |
| A1 More sheet, missing entries, JPG share | W23 |
| A1 the 846-line screen | W6 |
| Parse on every mount | W19 |
| External page count | W3 |

## Verification
Every step: `npm run typecheck` and `npm test` pass (including `hardcodedStrings`, `a11yLabels` and
`screens/__tests__/safeArea.test.ts`).

**Phones:**
- a mid-range Android phone (4 GB RAM, Android 13/14) and an Android 15+ phone;
- both navigation modes, font scale 1.3, light and dark theme, night pages on and off;
- portrait and landscape, and TalkBack, for W10–W13 and W19–W22.

**Test files:**

| Tag | File |
|---|---|
| `[300p]` | An imported, indexed textbook PDF with images, an outline and links |
| `[ext300]` | The same file via "Open with" |
| `[pw]` | A password-protected PDF |
| `[2in1]` | A 2-in-1 scan with a cover and a turned page |
| `[jpg]` | A JPG-format scan |
| `[xlsx5]` | A 5 MB XLSX: 3 sheets, 150 columns |
| `[csv50k]` | A CSV with 50k rows |
| `[docx]` | A 100-page DOCX with images and links |
| `[txt3]` | A 3 MB TXT |
| `[txt12]` | A 12 MB TXT |

**Performance budget** (record it in `docs/qa/performance.md`):

| Measure | Target |
|---|---|
| First sharp page of `[300p]` | ≤ 600 ms warm, ≤ 1.2 s cold |
| Janky frames while flinging | ≤ 5% |
| Sharp after the scroll settles | ≤ 250 ms |
| Tiles after a pinch ends | ≤ 400 ms |
| Memory (PSS) | < 350 MB steady |

## Risks and mitigations
- **Render speed** (about 50–150 ms for a text page, 200–500 ms for an image-heavy page):
  - one pdf lane, busy only with wanted work;
  - thumbnails and low-res placeholders; prefetch ±2 in the scroll direction;
  - the disk cache across sessions; tiles only when settled.
  - If W10 misses the budget, spike returning a `SharedRef<Bitmap>` to `expo-image` (no JPEG round trip).
- **Memory** (a 1080×1528 page is a 6.6 MB bitmap):
  - the window and the 96 MB budget, the 2400 px bucket cap, the native bitmap pool;
  - `onTrimMemory` closes idle sessions and drops tiles;
  - masters are decoded downsampled (`inSampleSize`), never at 2400 px.
- **pdfium thread safety:** every pdfium call goes through one executor, and pages close promptly.
  PdfRenderer stays only on the old uri-based path, under its own lock. The indexer pauses while the
  Reader is open.
- **Password PDFs:** pdfium sessions; the password is kept in memory for the session only, never stored.
- **Double-drawn marks** (or hidden third-party annotations): the clean-base invariant, W17's migration,
  the guard test, `annotations: false` until a document is clean, and the restore-time strip. If needed:
  a JNI shim that hides `/NM pdfscan:*` annotations at render time.
- **Gesture conflicts:**
  - provisional strokes with `onFinalize`;
  - single tap waits for double tap only in read/select;
  - long press fails on movement;
  - the fast scroller sits 12 dp in from the edge because predictive back is on (`app.json`).
- **Orientation:** check `unlockAsync` under `"portrait"` in W7; the fallback is in W11.
- **iOS:** W18 waits for W7(b).
- **Two engines during the flag period:** keep it short (W10 → W17). The flag stays internal (remote
  default false) until W17.

## Out of scope
- New tool families.
- Selection across pages.
- URL detection in OCR text.
- Native gesture-exclusion rects.
- pdfium's colour-scheme dark render.
- `expo-image` for reader pages (spike only).
- Indexing beyond 300 pages (Find reads those pages live).
- DOCX layout fidelity (real pages, headers, fonts: it would need a layout engine; mammoth's HTML stays).
