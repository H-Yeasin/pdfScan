# §5 Study: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement T1 from docs/plan/05-study.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §0, §3 K1–K5 and §4 S1–S7 (all done). §4 S8 (deadlines) adds migration v7;
  §5's migrations take **the next free version** (v8 once S8 has landed). Check
  `persistence/migrations.ts` before numbering.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
§5 turns scans into study material instead of dead files: find any page by a word in it, copy
its text, highlight and annotate it, bookmark it, and combine pages into a revision PDF before
an exam. **Done when** (from `docs/PLAN.md`): a student searches a word and lands on the exact
highlighted page within 2 seconds in a library of 500 pages.

### What the code looks like today (checked while planning, 2026-10-02)
- **Library search finds documents, not pages.** `dbService.searchDocumentsByText` runs FTS5
  over `pages_fts` (one row per page, `ocr_text`) but returns only document ids.
  `searchService.getMatchSnippet` scans the in-memory OCR text for a snippet. Opening a result
  starts the Reader at page 1.
- **Reader** (`ReaderScreen`, 495 lines) renders `document.pdf` through
  `components/reader/PdfPageView` (`react-native-pdf-jsi`):
  - `goToPage(n)` (1-based) exists through a ref;
  - in-document Find uses `searchTextDirect(pdfId, query, 1, pageCount)`, which returns
    `{ page, rect }` in PDF coordinates; `highlightRects` draws them (**Android only**; iOS is
    "can be added later" in the package);
  - `onPageSingleTap(page, x, y)` exists; there is **no text selection** and no drawing API;
  - `enableAnnotationRendering` is on, so real PDF annotation objects in the file are drawn;
  - night mode is a dim overlay.
- **OCR data:** `pages.ocr_json` stores blocks and lines with boxes in master pixel
  coordinates. ML Kit also returns **word boxes** (`OcrLine.elements` in `rn-mlkit-ocr`), but
  `ocr/ocrService.runOcr` drops them.
- **Library page ↔ PDF page mapping is not stored.** A cover page is library page 0 and PDF
  page 1, but the 2-up layout puts 2 library pages on one PDF page, and `documents` has no
  layout column (`buildPdfFromPages(..., layoutMode)` gets it only at build time).
  `document.pdf` is rebuilt by compress, sign and submit flows from the masters, so **anything
  added only to the PDF file is lost on the next rebuild.**
- Reusable: `pdf/textLayer.ts` (the glyphless text layer is what `searchTextDirect` finds),
  `applySignatureToPdf` (editing an existing PDF in place), `ZoomableImage` /
  `useZoomableImageGesture`, `SignaturePad` (drawing strokes), `SignaturePlacementOverlay`,
  `FileRow`, `SelectionBar`, `ThumbnailStrip`, `processSequentially`, `submitDocument` /
  `buildPdfFromPages`, `shareService.shareAs`, `courses/docTypes`.

### Key design decisions
- **A page index everyone agrees on.** Store the PDF layout on the document and compute
  `pdfPageFor(doc, libraryIdx)` in one place. Search results, bookmarks, annotations and
  exam packs all refer to **library pages** (`pages.id`), never PDF page numbers.
- **Annotations are data, the PDF is an output.** Highlights, ink and notes live in an
  `annotations` table in master-pixel coordinates. Every PDF build (save, compress, sign,
  submit) writes them as **real PDF annotation objects** (`/Highlight`, `/Ink`, `/Text`), so
  they survive rebuilds, show in the in-app viewer (annotation rendering is on), and can be
  hidden or deleted in other PDF apps. A quick "update annotations" pass edits the existing
  `document.pdf` in place (like `applySignatureToPdf`) instead of rebuilding images.
- **Our own single-page canvas for anything interactive.** The native PDF view can't select
  text or draw, so "Select text" and "Annotate" open `PageCanvas`: the page's display or master
  image in Skia, with zoom and pan, the OCR boxes and the annotations drawn on top, and touch
  points converted to master pixels.
- **Highlights snap to words.** Keep ML Kit's word boxes; a highlighter stroke snaps to the
  words it crosses. This gives clean highlights and the highlighted text for free (which is
  what flashcards need later).

---

## Steps

### T1 · Page mapping and word-level OCR *(M)*
Status: done in code (commit 0cfbddd).

As built:
- Migration **v9** (v8 went to §3 K6's `documents.archived`): `documents.pdf_layout` and also
  `documents.pdf_page_size` ('A4' | 'Letter'), because mapping to a PDF rectangle needs the
  paper too. `LibraryDocument.pdfLayout` / `pdfPageSize`, written by Deliver and every library
  rebuild (merge, split, compress, sign rebuild to standard; `ensureDocumentPdf` to standard A4).
- Backfill: `documents/pdfInfoBackfill.backfillPdfInfo`, run by `useLibraryPersistence` after a
  successful load, one PDF at a time (`pdfService.inspectPdf`). It decides by orientation
  (2-in-1 sheets are landscape, standard pages never are), not by page count, so a one-page
  2-up document is caught too. Imported PDFs and non-raster formats are skipped.
- `pdfService.imagePlacement(width, height, slot, pageDims, layout?)` is the one placement
  helper; the standard and 2-up builders use it. `pageSizeOfPdf` now uses `inspectPdf`.
- `documents/pageMap.ts`: `pdfPageFor`, `pdfPageCount`, `libraryIdxFor(doc, pdfPage,
  xFraction)`, `pdfRectFor(doc, idx, masterRect)` (PDF points, bottom-left origin; a template
  cover scales to the whole page).
- `OcrLine.words?: OcrWord[]` from ML Kit `elements`.
- Tests: `documents/__tests__/pageMap.test.ts` (pdfRectFor is checked against where pdf.js finds
  the builder's text for standard/2-up × A4/Letter, including an ID-card full page).

- Migration (next free version):
  - `documents.pdf_layout TEXT` (`'standard'` | `'2_in_1'`, null = standard), written by every
    PDF build. Backfill: if the PDF page count is about half the page count, set `'2_in_1'`
    (read the page count with pdf-lib once, in the migration's follow-up task, not inside the
    SQL migration).
  - No new column for words: `ocr_json` gains a `words` array per line (additive; old rows have
    none).
- `src/services/documents/pageMap.ts` (pure):
  - `pdfPageFor(doc, libraryIdx) → { page: number (1-based), slot: 'full' | 'left' | 'right' }`;
  - `libraryIdxFor(doc, pdfPage, xFraction?) → number` (the reverse, for taps);
  - `pdfRectFor(doc, libraryIdx, masterRect) → PDF rect` using the same `fitBox` placement and
    margins as `pdfService` (export the placement helper instead of copying it).
- `ocrService.runOcr` keeps `elements` as `OcrLine.words: { text, bounding }[]`. Re-OCR is not
  needed for old pages; features fall back to line boxes when words are missing.
- Tests: the mapping for standard, with a cover, and 2-up (odd page counts too); `pdfRectFor`
  matches where `buildPdfFromPages` draws the image (compare with the placement used in the
  builder); OCR keeps words.

**Done when:** for any document, the code can say which PDF page and rectangle a library page
and an OCR word end up on.

### T2 · Search results by page, with jump and highlight *(M)*
Status: done in code (commit 38e4fd8).

As built:
- `dbService.searchPages(query, { courseId?: string | null, type?, limit = 50 })` →
  `PageHit { documentId, pageId, idx, snippet, rank }`, ordered by bm25 (which favours short
  pages), then newest document, then page. `courseId: null` = Unsorted. Uses the same
  `buildFtsMatchQuery` as `searchDocumentsByText`.
- Library: `components/library/PageResults` in the list footer while searching (follows the
  course and type chips). Opening one uses `useOpenDocument`, then `reader/SET_TARGET`.
- Reader: `reader.target` (cleared by `SET_READER_ID`) → after `onLoad`, `goToPage` and Find
  on that page only (`targetPage`); typing in Find searches the whole document again.
- **Not built: the iOS OCR-box overlay.** `react-native-pdf-jsi` doesn't expose the on-screen
  page geometry needed to place it; on iOS the page jump works without the highlight. The
  open-to-highlight timing is still to be measured on a device.
- Tests: `persistence/__tests__/searchPages.test.ts`.

- `dbService.searchPages(query, { courseId?, type?, limit = 50 })` →
  `{ documentId, pageId, idx, snippet, rank }[]`, using FTS5 `snippet(pages_fts, 0, '[', ']', '…', 12)`
  and `bm25` ordering, newest documents first on ties. Keep `searchDocumentsByText` for the
  document list, built on the same query builder (`buildFtsMatchQuery`).
- Library search: below the document list, a **Pages** section: thumbnail, document name,
  "p. 4", and the snippet with the match in bold. Grouped by document when a document has
  more than 3 matches ("+5 more pages").
- Opening a page result: `reader/SET_READER_ID` plus a new `reader/SET_TARGET { pageId, query }`.
  The Reader jumps with `goToPage(pdfPageFor(...).page)` after `onLoad`, sets Find to the
  query, and highlights:
  - Android: `searchTextDirect` on that one page (fast) → `highlightRects`;
  - iOS (no `highlightRects`): draw the word boxes from `ocr_json` (T1 mapping) in an overlay
    on the target page, and fade it out after 3 seconds. If the overlay can't follow zoom,
    show it only until the first zoom.
- Performance: FTS returns in under 50 ms for 500 pages; measure Reader open-to-highlight on
  a device and record it.
- Tests: `searchPages` (ranking, snippet markers, course and type filters, escaping of quotes
  and `*`); the reader target reducer.

**Done when:** searching "photosynthesis" in a 500-page library lists the pages, and tapping
one opens that page with the word highlighted in under 2 seconds (the §5 "done when").

### T3 · Copy and extract text *(S)*
Status: done in code (commit 4cdba0a).

As built:
- `expo-clipboard@~57.0.2` was not installed; added (native module: needs a new dev build).
  Jest mock `src/test/mocks/expoClipboard.ts`.
- `services/study/textSelection.ts`: `readingOrderTokens` (a line without word boxes is one
  token), `tokenAt` (nearest token if none is under the point), `selectBetween`,
  `selectionText`, `extractDocumentText`; `study/textExport.writeDocumentText` writes the .txt
  to `cache/extract/`, shared with `shareAs` as `<doc name>.txt`.
- `components/reader/PageCanvas.tsx`: plain React Native (Image + overlay views), not Skia.
  Pinch and two-finger pan zoom the layer; one-finger drags and taps are converted to master
  pixels by `study/canvasMath.ts` (tested both ways). Shows the display copy if there is one.
- `components/reader/SelectTextSheet.tsx` (full-screen modal): no separate drag handles; starting
  a drag on either end of the selection moves that end. Share uses React Native's `Share` (text).
- Reader overflow (`OverflowSheet.showText`): Select text, Copy page text, Extract text (Copy /
  Share .txt). On a 2-up sheet these act on its left page.

- Reader overflow:
  - **Copy page text**: the current page's `ocr_text` (via `expo-clipboard`; check whether it
    is already installed, otherwise add `expo-clipboard@~57`).
  - **Extract text**: the whole document's OCR text with "--- Page 3 ---" separators, as a
    **.txt file** shared with `shareAs` (`<doc name>.txt`), or copied.
- **Select text** mode, through a new `components/reader/PageCanvas.tsx` (introduced here,
  reused by T4):
  - the current library page (display copy if present, else master; downscaled like
    `PREVIEW_MAX_DIM`), with zoom and pan from `useZoomableImageGesture`;
  - word boxes drawn faintly; drag from one word to another to select the words in reading
    order (block → line → word order from `ocr_json`); handles at both ends;
  - a bar with **Copy** and **Share**, plus "Select all".
  - Pages without word boxes select whole lines.
- Show "No text found on this page. Run OCR again?" when a page has no OCR text or
  `ocr_failed`, with a button that re-runs OCR on the master (`runOcr`) and saves it.
- Tests: reading-order selection between two words across lines and blocks; the extract
  format; selection on pages without words.

**Done when:** a student can copy one paragraph from a scanned page and paste it into another
app, and share the whole document as a .txt.

### T4 · Annotations: highlighter, pen, notes *(L)*
Status: done in code (commit 5c60573).

As built:
- Migration **v10** `annotations` as planned, but **without a foreign key on `page_id`**:
  `libraryRepo.writeDocument` deletes and re-inserts a document's page rows on every save, so a
  page cascade would wipe annotations. They cascade with the document; the store drops a page's
  annotations when an `UPDATE_FILE` takes the page away (and on `REMOVE_FILES`/`REPLACE_FILES`).
  Loaded and synced with the library (`LoadedLibrary.annotations`, optional).
- `Annotation` / `AnnotationData` in `models.ts`; colours are keys of `annotations/palette.ts`
  (fixed paper colours, not theme tokens, so a highlight looks the same everywhere).
- `annotations/snap.ts` `snapHighlight(stroke, ocr, thickness)` (stroke sampled along its
  segments; uses T3's reading-order tokens, so pre-T1 pages snap to whole lines);
  `annotations/hitTest.ts` `annotationAt` for the eraser and note editing.
- `annotations/pdfAnnotations.ts`: `writeAnnotations(pdfDoc, mappedDoc, items)` via T1's
  `pdfRectFor`; `/Highlight` (QuadPoints, multiply appearance), `/Ink` (InkList, BS), `/Text`
  (Comment icon); `/NM pdfscan:<id>`; ASCII `Contents` as a plain string, other scripts UTF-16.
  `removeOurAnnotations`, `updatePdfAnnotations(doc, items)` (in place).
- Builds call it through a new `BuildPdfOptions.beforeSave(pdfDoc)` hook (avoids an import cycle
  `pdfService` ↔ `pageMap`). Wired: `compressDocument(doc, quality, annotations)`,
  `applySignedPage(doc, idx, uri, annotations)`, `submitDocument({ annotations })` when the
  preset has `includeAnnotations` (Deliver switch "Include my annotations", saved with the course
  preset; the submission's cover offset is accounted for). **Not carried:** merge and split make
  new documents without the annotations; the in-place signature (`applySignatureToPdf`) keeps
  them since it edits the existing file.
- UI: `components/reader/AnnotateSheet.tsx` (Reader menu "Annotate"), `react-native-svg` overlay
  in master pixels; page arrows (no two-finger page swipe: two fingers zoom). Done →
  `updatePdfAnnotations` → the Reader reloads the PDF.
- Tests: `annotations/__tests__/annotations.test.ts` (read back with pdf.js `getAnnotations`),
  plus a submission test (left out by default; on page 3 behind a cover when included).

- Migration: `annotations` (id, document_id, page_id, kind `'highlight' | 'ink' | 'note'`,
  color, data JSON, text (for highlights: the covered words; for notes: the note), created_at,
  updated_at). Cascade on page and document delete. Data in **master pixels**:
  - highlight: a list of word rects (snapped) or one free rect;
  - ink: strokes `[[x, y], …]` with width;
  - note: an anchor point.
- `src/services/annotations/`:
  - `snapHighlight(stroke, words) → rects + text` (pure): every word whose box the stroke
    passes through, merged into one rect per line;
  - `writeAnnotations(pdfDoc, doc, annotations)`: for each annotation, use T1's `pdfRectFor` /
    point mapping and add a real annotation with pdf-lib's low-level API (`/Highlight` with
    `QuadPoints` and colour, `/Ink` with `InkList`, `/Text` with `Contents`), each with an
    `/NM` of `pdfscan:<annotation id>` and an appearance stream (`/AP`) so viewers that don't
    generate one still show it;
  - `updatePdfAnnotations(doc)`: load `document.pdf`, remove our annotations (by `/NM`
    prefix), write the current ones, save in place. Called after each annotation session.
- Every PDF build (`buildPdfFromPages` callers: Deliver save, compress, sign, merge/split,
  `submitDocument`) calls `writeAnnotations` at the end. Submit gets a preset option
  "Include my annotations" (off by default; teachers usually want a clean copy).
- UI: Reader overflow → **Annotate** opens `PageCanvas` in annotate mode:
  - tools: Highlighter (yellow, green, pink, blue), Pen (3 colours, 2 widths), Note, Eraser
    (tap an annotation to delete it), Undo;
  - swipe between pages with two fingers, or with page arrows;
  - "Done" saves and runs `updatePdfAnnotations`, then the Reader reloads the PDF.
- Tests: `snapHighlight` (diagonal strokes, multi-line, no words → free rect); the written
  PDF contains the annotation objects with the right page, rect and `/NM`; rebuilding a
  document keeps its annotations; deleting a page removes its annotations.

**Done when:** a highlight made in the app shows in the Reader and in Google Drive's PDF viewer,
and still shows after Compress.

### T5 · Bookmarks *(S)*
Status: todo

- Migration: `bookmarks` (id, document_id, page_id, label nullable, created_at). Cascade.
- Reader: a bookmark button in `ReaderTopChrome` for the current page (filled when
  bookmarked); long-press to add a label. A **Bookmarks** list in the overflow (this document)
  jumps to the page.
- `CourseScreen` and Home: a **Bookmarked** section/filter listing bookmarked pages across the
  course, with thumbnails, used as a source for T6.
- Library search: the filter "Bookmarked".
- Tests: add, label, remove; cascade; the course-level list ordering.

**Done when:** a student bookmarks pages in 3 documents and sees all 3 under the course's
Bookmarked section.

### T6 · Exam pack: one revision PDF from many pages *(M)*
Status: todo

- **Pick pages**, from three places, into a pack tray (a session state slice `pack`, like the
  capture tray): the course's bookmarks ("Add all bookmarked"), page search results ("Add
  these 12 pages"), and a thumbnail grid of a course's documents (multi-select).
- **Pack editor screen** (`'examPack'`): reorder (reuse `ThumbnailStrip` / `GridPagesModal`
  drag), remove, title (default "<course code> exam pack – <date>"), options: contents page,
  include annotations (on), page numbers footer.
- **Build** (`src/services/study/buildExamPack.ts`): a **new library document** in the same
  course with type `notes` (or a new `revision` type if added to `docTypes`):
  - copy each source page's master and thumbnail into the new document folder (one at a time),
    with its OCR (so the pack is searchable) and its annotations (copied rows with new ids);
  - an optional **contents page** first: "Source: <doc name>, p. 4", grouped by document, made
    with the S4 cover-layout helpers;
  - then `buildPdfFromPages` as for any document, and the usual library save path.
  Copying (not referencing) keeps the pack intact when a source document is deleted.
- Then the normal Reader / Share / Submit actions apply to it.
- Tests: build order and contents entries; copied pages keep OCR and annotations; deleting a
  source document leaves the pack intact; memory: pages processed one at a time
  (`processSequentially` spy).

**Done when:** a student builds a 30-page revision PDF from bookmarks and search results across
4 documents in under a minute, and it is searchable and annotated like the originals.

### T7 · Flashcards from highlights *(L — later, P4)*
Status: later (not part of P2; plan it in detail when P4 starts)

Outline only, so earlier steps keep room for it:
- Card = one highlight (T4): the front shows the line's sentence with the highlighted words
  hidden (cloze), the back shows the words and a crop of the page around them.
- Decks per course; spaced repetition with a simple Leitner box schedule stored locally
  (`cards` and `reviews` tables); a daily "Review 12 cards" entry on Home.
- Everything on-device; no AI generation in the first version.
- Depends on T1 (word boxes) and T4 (highlights with their text).

---

## Order and dependencies
T1 first (everything uses its mapping), then T2 (the §5 "done when"), then T3 (introduces
`PageCanvas`), then T4, then T5, then T6. T7 is later.

## Critical files
- `src/services/documents/pageMap.ts` (new), `src/services/ocr/ocrService.ts`, `src/types/models.ts`
- `src/services/persistence/{migrations,libraryRepo,dbService}.ts`
- `src/services/pdf/pdfService.ts` (export the placement helper; call `writeAnnotations`),
  `src/services/annotations/*` (new), `src/services/study/buildExamPack.ts` (new)
- `src/screens/{ReaderScreen,LibraryScreen,CourseScreen,HomeScreen}.tsx`, new `ExamPackScreen.tsx`
- `src/components/reader/{PdfPageView,PageCanvas (new),OverflowSheet,ReaderTopChrome}.tsx`
- `src/store/slices/{readerSlice,librarySlice}.ts`, a new `packSlice.ts`

## Verification (for the whole of §5)
1. `npm run typecheck && npm test` pass in CI.
2. On an Android device (dev build), with a seeded library of 500 pages:
   - search a word: page results with snippets; tap one: the right page, word highlighted,
     under 2 s;
   - copy a paragraph and paste it into a notes app; share a document as .txt;
   - highlight, draw and add a note; check them in the Reader, in Google Drive's PDF viewer,
     and again after Compress;
   - bookmark pages in 3 documents; build an exam pack from them plus search results; the pack
     is searchable and keeps the annotations; delete a source document and the pack still
     opens.
3. iOS: search jump works, and the highlight falls back to the OCR overlay.
