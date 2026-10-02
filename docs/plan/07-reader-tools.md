# §7 Reader and PDF tools: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement R1 from docs/plan/07-reader-tools.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §0 and §4 (done). R1–R3 work best after §5 T1 (page mapping, word boxes);
  where T1 isn't there yet, the step says what to do. New migrations take **the next free
  version** in `persistence/migrations.ts`.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
`docs/PLAN.md` says §7 is "already strong: maintain, don't expand". Checking the code shows
that the scanned-document tools are solid, but **PDFs that students receive** (lecture slides,
handouts, past papers from teachers) are second-class, and a few dependencies need care. This
plan therefore fixes gaps and risks; it adds no new tool families.

### What the code looks like today (checked while planning, 2026-10-02)
- **Scanned documents:** merge, split, compress (PDF-only rebuild), sign and submit work from
  the library masters (`persistence/libraryOperations.ts`, `pdfService.buildPdfFromPages`).
  Library multi-select offers Submit, Move, Set type, Archive, Merge, Split, Compress, Sign.
- **Imported PDFs** (`promoteExternalToLibrary`, `sourceKind: 'imported_pdf'`) are copied as
  `document.pdf` with **placeholder pages** (`fileUri: ''`, 850×1100, no OCR). So they:
  - are found by **name only** in library search (`searchHaystack` = the name);
  - have no thumbnails;
  - can't be merged, split, signed, annotated or submitted like scans
    (`formatCapabilities` branches on `sourceKind`).
- **No page editing after saving.** Reorder, rotate and delete exist only in Review
  (`GridPagesModal`) before a document is saved.
- **Reader** (`ReaderScreen` + `components/reader/PdfPageView`, the only importer of
  `react-native-pdf-jsi`): Find and highlight, night mode as a dim overlay, a password prompt
  for any load failure; it always opens at page 1.
- **`react-native-pdf-jsi@4.4.2`** (MIT, a single-maintainer fork of `react-native-pdf`,
  Android Java package `org.wonday.pdf`): the viewer, `searchTextDirect`, `highlightRects`
  (Android only). Its Android side also has undocumented `PDFExporter` methods
  (`exportPageToImage`, `mergePDFs`, `extractPages`, `rotatePage`, `getPageCount`, …), and it
  pulls in `io.legere:pdfiumandroid:1.0.32`. Its iOS side has none of these.
- **Office formats:** CSV, XLSX and XLS are shown by `SheetView` (the `xlsx` package); TXT by
  `TxtView`. **DOCX has no viewer**: `mammoth` is in `package.json` but not imported anywhere,
  while the README advertises DOCX and DOC. The in-app picker allows only PDF, TXT and CSV;
  "Open with" (`app.json` intent filters) registers PDF only.
- **`xlsx@0.18.5` from npm has known vulnerabilities** (prototype pollution CVE-2023-30533,
  ReDoS CVE-2024-22363) and parses files from outside the app. SheetJS publishes fixed
  versions (0.20.x) only on its own CDN, not on npm.
- **"Protect"** (PDF passwords) was hidden in F2. pdf-lib can't encrypt.

### Key design decisions
- **One small native module of our own** (`modules/pdf-native`, a local Expo module) for the
  few things JavaScript can't do well: page count and size, rendering a page to a JPEG, and
  extracting a page's text with word boxes. Android: `android.graphics.pdf.PdfRenderer` for
  rendering and `pdfiumandroid` for text (already in the app through pdf-jsi; pin the same
  version). iOS: PDFKit. We don't build on pdf-jsi's undocumented, Android-only exporter.
- **Imported PDFs keep their original pages.** Page operations on them (merge, split, extract,
  rotate, delete, reorder) are done at the PDF level with pdf-lib's `copyPages` and
  `setRotation`, which keeps vector text and costs no quality. Only operations that need
  pixels (compress, size target) rasterize, and they say so.
- **Rotation is lossless everywhere after saving**: the PDF page's `/Rotate` value, stored as
  `pages.rotation`, never a re-encoded image.
- **The PDF viewer stays behind `PdfPageView`.** That wrapper remains the only file that imports
  `react-native-pdf-jsi`, so the viewer can be swapped (for example back to upstream
  `react-native-pdf`) if the fork stops being maintained.

---

## Steps

### R1 · Imported PDFs become first-class: thumbnails, text and search *(L)*
Status: done in code (commit 2b46521); device checks open (needs a new dev build for the module)

- **Native module** `modules/pdf-native` (`npx create-expo-module --local`; read the Expo 57
  module docs or the `expo-modules-core` source first):
  - `getPageCount(uri)`, `getPageSize(uri, page)` (points; 0-based pages in the API, documented);
  - `renderPage(uri, page, { maxDim, quality }) → { uri, width, height }` (JPEG in the cache);
  - `getPageText(uri, page) → { text, words: { text, left, top, width, height }[] }` in page
    points, top-left origin;
  - encrypted PDFs reject with code `ENCRYPTED`.
  - JS wrapper `src/services/pdf/pdfNative.ts` with a Jest mock in `src/test/mocks`.
- **Import:** `promoteExternalToLibrary` and a new `indexImportedPdf(doc)` create real page
  rows, one page at a time (`processSequentially`) with progress:
  - a 400 px thumbnail per page (`THUMB_MAX_DIM`);
  - the page text from `getPageText`, stored like OCR (`ocr_text`, and `ocr_json` with words
    converted to a pixel space of the page rendered at `MASTER_MAX_DIM`; `width`/`height` are
    those pixel sizes). Migration: `pages.text_source TEXT` (`'ocr'` | `'pdf'`).
  - **No text on a page** (a scanned PDF): render a 2400 px master and run `runOcr` on it, so
    teachers' scanned handouts become searchable too (`text_source = 'ocr'`).
  - masters are otherwise rendered **on demand** (annotate, select text, raster operations),
    not stored for every page, to save space.
- Pages of an imported document map 1:1 to PDF pages (`pdf_layout` standard, no cover); if §5
  T1 exists, `pageMap` handles `imported_pdf` this way.
- **Backfill** for imported documents saved before R1: a background task at start-up indexes
  one document at a time, resumable (a `documents.indexed_at` column), and never blocks the UI.
- Large files: over 300 pages or 60 MB, index the first 300 pages and show "Search covers the
  first 300 pages".
- Tests: the import creates N pages with thumbnails and text; pages without text go through OCR;
  the backfill resumes after a restart; encrypted PDFs are imported but skipped for indexing
  with a clear status.

**Done when:** a 40-page lecture PDF from a teacher shows thumbnails, and library search finds a
word from its page 23 (and opens that page if §5 T2 is there).

**As built:**
- `modules/pdf-native` (written by hand from the SDK 57 `expo-module-template-local`, autolinked
  from `./modules`; `requireOptionalNativeModule`, so an older build just doesn't index).
  `getPageText` also returns the page's `width`/`height` in points, so boxes are scaled with the
  same size they were measured in. Android text boxes go through pdfium's `FPDF_PageToDevice`
  (handles `/Rotate`); iOS converts PDFKit's media-box space itself. Errors other than
  `ENCRYPTED` reject with `READ_FAILED`.
- Indexing runs after the import, not inside `promoteExternalToLibrary` (which stays instant and
  now sets `pdfLayout: 'standard'`): `store/useImportedPdfIndexing` indexes every imported PDF
  with `indexedAt` unset, which covers both fresh imports and the backfill. Progress is committed
  every 10 pages and a page counts as done once it has its thumbnail, so resuming is per page,
  not per document.
- Migration **v13** adds `pages.text_source`, `documents.indexed_at` and also
  `documents.index_state` (`done` | `partial` | `encrypted` | `failed`), shown as a second meta
  line in `FileRow` ("Search covers the first 300 pages", "Password-protected: not searchable",
  and "Reading pages for search… 12/40" while it runs).
- Large files: only the page limit is enforced (`INDEX_MAX_PAGES` = 300). A file over 60 MB
  with fewer pages is indexed in full: each page is read on its own, so file size alone
  doesn't cost memory.
- A page that fails to render keeps its text and has no thumbnail; it doesn't fail the document.
- Not done here: `pageMap.pdfRectFor` still places boxes in an A4 margin box, which is wrong for
  imported pages (they fill their own PDF page). Nothing calls it for imported documents yet
  (annotations are off for them); R2/R3 need it, along with each page's size in points.

### R2 · Page-level tools for imported PDFs *(M)*
Status: done in code (commit 9f97fc1); device checks open

- `src/services/pdf/pdfOps.ts` (pdf-lib):
  `mergePdfs(sources: { uri, pages?: number[] }[])`, `extractPages(uri, pages)`,
  `deletePages(uri, pages)`, `reorderPages(uri, order)`, `setRotation(uri, page, degrees)`.
  Loading an encrypted PDF fails with a typed error.
- `libraryOperations` chooses the path per document:
  - all scanned → today's rebuild from masters;
  - any imported → PDF-level: each scanned document contributes its own `document.pdf`
    (with its annotations, if §5 T4 exists), and the copied pages keep their page rows (text,
    thumbnails, bookmarks and annotations follow their page ids).
- Enable for imported PDFs in `formatCapabilities`:
  - **Merge** and **Split** (PDF-level);
  - **Sign**: `applySignatureToPdf` already edits an existing PDF; give it the page size from
    `getPageSize` instead of the image size;
  - **Submit** (§4): naming works as is; the cover page is prepended with pdf-lib; the footer is
    stamped onto existing pages; the size target first tries the original file and, if it's too
    big, rasterizes pages through the S3 ladder with a note: "To fit 2 MB, pages were turned
    into images. The text stays searchable." (The glyphless layer carries the extracted text.)
  - **Compress**: only the raster path, with the same note, and only if the result is
    actually smaller.
- Encrypted PDFs: tools are disabled with "This PDF is password-protected" (opening still works
  with the Reader's password prompt).
- Tests: each `pdfOps` function on a generated multi-page PDF (page count, order, rotation,
  text kept); a mixed merge (scanned + imported) keeps page rows and text; the size-target
  fallback; encrypted input gives the typed error.

**Done when:** a student can merge a teacher's PDF with their own scanned answers, sign it, and
submit it under 2 MB, and the teacher's pages still have selectable text when no
rasterizing was needed.

**As built:**
- `pdf/pdfOps.ts` writes to a `dest` file (it may be the source) and returns
  `{ uri, sizeBytes, pageCount }`; `mergePdfs` also returns `pagesPerSource`. Added
  `splitPdf` (loads the source once) and `stampImage` (Sign). Encryption is detected by
  reloading with `ignoreEncryption` and checking `isEncrypted`: pdf-lib's `EncryptedPDFError`
  fails `instanceof`. A PDF with only owner restrictions (opens without a password) also
  counts as encrypted here, since pdf-lib can't copy its encrypted streams; the student sees
  "This PDF is password-protected". `PdfEncryptedError` moved to `pdf/pdfErrors.ts`, shared
  with `pdfNative.ts`.
- **Merge/split keep page ids** (not only the rows' contents), so bookmarks and annotations
  follow their pages: `library/REPLACE_FILES` moves them to the new document that has their
  page. To make that possible on disk, `syncLibrary` now **deletes removed documents first**
  (freeing the page ids), then writes. An all-scans merge/split also writes the annotations
  into the rebuilt PDF now (before, they were dropped).
- A PDF-level merge takes a scan's own `document.pdf` when it is standard and coverless (so a
  signature burned in by Sign survives), otherwise a standard rebuild from its masters into
  the cache. The result is `sourceKind: 'imported_pdf'`. It is marked indexed only when every
  part was; otherwise the R1 indexer fills in the pages without a thumbnail.
- Compress for imported PDFs is `compressImportedPdf`, rasterizing through
  `pdf/rasterPdf.buildRasterPdf` (pages keep their own size, edge to edge; the text goes back
  as the glyphless layer). It replaces the original only if it's smaller. The snack says
  "Pages were turned into images; the text stays searchable", or "It's already as small as it
  gets".
- Sign: rather than `getPageSize` + `applySignatureToPdf`, the placement is made on the page
  rendered on demand (`components/shared/usePageImage`, 1600 px) and passed as fractions to
  `pdfOps.stampImage`, which maps them through the page's own media box and `/Rotate` with
  pdf-lib. Note: the existing `applySignatureToPdf` (scans) deletes the signature file it is
  given, which is the saved, reusable one; the imported path leaves it alone. Not fixed here.
- Submit: `submitPdfLevel` decorates the original (`pdfService.decoratePdf`: cover in front,
  border/header/footer stamped at each page's own size). Over the limit, it samples renders
  at the ladder levels (`findLevel`) and builds raster PDFs (`buildUnderLimit`);
  `SubmitResult.rasterized` makes `useSubmitDocument` show "To fit 2 MB, pages were turned
  into images. The text stays searchable." The preset's 2-in-1 layout is ignored for these
  (pages stay as the PDF has them). Stamps assume an unrotated page whose media box starts at
  0,0; a turned page gets its footer along the wrong edge (R3 brings rotation).
- `formatCapabilities`: `isPdfLevel`, `isPasswordProtected` (R1's `indexState: 'encrypted'`),
  `canUsePageTools`, `hasPageMasters`. Sign/Submit need `modules/pdf-native` for imported
  PDFs. Select/copy text, annotate and exam packs now check `hasPageMasters` (they draw on or
  copy masters). The Library's selection tools look off for a password-protected PDF but stay
  tappable to explain why.
- Tests: `pdf/__tests__/pdfOps.test.ts`, `persistence/__tests__/pdfLevelOps.test.ts` (mixed
  merge, rows and text kept, bookmarks/annotations moved through the reducer and the
  database, split, compress both ways, sign, submit as-is and rasterized),
  `documents/__tests__/capabilities.test.ts`. The pdf-native mock now writes JPEG-shaped files
  (`test/jpeg.ts`), so pdf-lib can embed renders.

### R3 · Edit pages after saving *(M)*
Status: done in code (commits 510eb3b, a123c21); device checks open

- Reader overflow → **Edit pages**: reuse `GridPagesModal` (from Review) in a library mode:
  - reorder (drag), rotate 90° (lossless: `pages.rotation` → `/Rotate`; migration
    `pages.rotation INTEGER NOT NULL DEFAULT 0`), delete (with Undo in the snack);
  - **Extract** selected pages to a new document (same course);
  - **Add pages**: from a new scan (`startScan` with an "append to document" target, reusing
    Review's flow) or from another library document.
- Saving: scanned documents rebuild `document.pdf` from masters with the new order and
  rotations; imported ones use R2's `pdfOps`. Thumbnails and the library display copies rotate
  with a transform, not a re-encode.
- Bookmarks, annotations and submissions keep pointing at the right pages because they refer
  to page ids (§5); deleting a page cascades its bookmarks and annotations.
- Tests: reorder, rotate and delete produce the expected PDF (page order, `/Rotate`); extract
  creates a new document with copied pages; append keeps the document id; a rotated page's
  OCR boxes still map correctly (rotation applied in `pageMap`).

**Done when:** a student can remove a wrong page, fix a sideways page and add a forgotten page
to a saved assignment without rescanning everything.

**As built:**
- **Rotation** (migration **v14**, `pages.rotation`; `LibraryPage.rotation`) is a clockwise turn
  on top of the stored page: width/height and OCR stay unturned. A standard build sets
  `/Rotate`, which leaves the page's own space, and so `pdfRectFor` and annotations, unchanged.
  A 2-in-1 column can't have its own `/Rotate`, so the page is drawn turned under a matrix
  (`pdf/rotation.ts`). `pageMap.pdfRectFor` applies the same turn, and a pdfjs test checks it
  for 90/180/270. Footers/headers on a turned page (`stampAcademicPage`, `decoratePdf`) are
  drawn in the page as shown, so they sit along the bottom the reader sees. This also fixes
  R2's note about rotated imported pages and media boxes not at 0,0. A rasterized imported
  page's text layer is turned the same way. Every build goes through
  `pdfService.toSourcePage`, so submissions, exam packs and rebuilds all carry the turn. For an
  imported PDF, `rotation` is the turn added since indexing (its PDF already has it); the R1
  indexer resets it when it re-reads a page.
- **Editing is a draft** (`persistence/pageEdits.ts`: `PageEdit`, `rotatePages`,
  `movePages`, `removePages`, `savePageEdit`). Save is one rebuild, not one per tap: scans
  from their masters, imported PDFs with `pdfOps.rearrangePages` (order, deletions and turns
  in one pass). **Delete's Undo is in the editor** (an undo bar until Save), not in the app
  snack: the snack sits under the modal, and a saved delete removes the page's files. A
  removed page's bookmarks and annotations go with it (`library/UPDATE_FILE`). An imported
  PDF must be fully indexed before it can be edited ("still being read").
- **Reorder** uses "Earlier" / "Later" buttons on the selected pages, not drag: there's no
  drag-and-drop list in the dependencies. `react-native-draggable-flatlist` (JS on top of
  Reanimated and Gesture Handler) could add drag later.
- **Extract** (`extractToNewDocument`) copies the selected pages (new ids; the source keeps
  them) into a new document in the same course; imported pages as PDF pages. Extract and Add
  pages wait until the draft is saved.
- **Add pages**: from another document, `libraryOperations.appendDocuments`; merge is now
  `combineInto` shared by both, and the target keeps its id and page ids. From a new scan,
  `startScan(..., { appendTo })` sets `deliver.appendTo`; Deliver shows "Adding pages to …",
  builds the pages as plain pages (no cover, stamps, 2-in-1 or size target), appends them,
  deletes the temporary document and opens the Reader. A scan session already in progress has
  to be finished first. A general scan clears a target left from an abandoned session.
- **File names**: since pages move, files copied into an existing document are named by page
  id (`copyPageInto({ byId })`), as are the R1 indexer's thumbnails. `applySignedPage` no
  longer writes `page_N.jpg` (which could be another page's master after a reorder); it uses
  new names and deletes the page's old files.
- Review's grid is now `components/shared/PageGrid`, used by `GridPagesModal` and
  `EditPagesModal`.
- Not done: the Annotate and Select text sheets still show a turned scanned page unturned
  (their marks still land correctly). The "library display copies" aren't shown anywhere since
  the Reader moved to the PDF engine, so only thumbnails needed the transform.

### R4 · Reader conveniences *(S)*
Status: done in code (commit a68b7ed); device checks open

- **Resume reading:** `documents.last_page` (migration), saved on page change (debounced); the
  Reader opens there unless a search target (§5 T2) says otherwise.
- **Page indicator and jump:** "12 / 40" in the bottom chrome; tap it to type a page number.
- **Thumbnail scrubber:** a bottom sheet with the page thumbnails (F5 thumbs or R1 thumbs);
  tapping one jumps there.
- Better load errors: tell "password needed" apart from "file damaged" when the engine's error
  allows it (check the error codes in pdf-jsi's source); otherwise keep the current prompt with
  a "Can't open this file" fallback after a wrong password.
- Night mode stays a dim overlay (pdf-jsi has no invert); note this as a known limit.
- Tests: the last-page save/restore reducer; jump input validation.

**Done when:** reopening a 40-page document returns to the page the student left, and any page
is two taps away.

**As built:**
- Migration **v15** (`documents.last_page`, `LibraryDocument.lastPage`): the PDF page, 1-based.
  After a reorder (R3) it's the same page number, not necessarily the same page. Saved by
  `library/SET_LAST_PAGE` 800 ms after the page settles, and on leaving the document; not
  before the saved page has been jumped to, so the viewer starting on page 1 can't overwrite
  it. `libraryRepo.syncLibrary` now skips rewriting a document's page rows when its `pages`
  array is the same one (so a page save, rename or star writes one row).
- `documents/readerPosition.ts`: `resumePage` (a search hit or bookmark wins; a saved page past
  the end opens at the last page), `parseJumpInput` (whole numbers 1…count only),
  `classifyPdfError`.
- Bottom chrome: the dots are replaced by "12 / 40" (tap → "Go to page" prompt, number pad).
  A **Pages** button (library documents with more than one page) opens `PageScrubberSheet`, a
  strip of the page thumbnails with turns shown. An invalid page number closes the prompt and
  says "Type a page from 1 to N" (the snack can't show above the prompt).
- Load errors: pdf-jsi reports "Password required or incorrect password." on both platforms
  (android `PdfView.onError`, ios `RNPDFPdfView`), and other failures with their own message
  ("Load pdf failed…"). `PdfPageView` was losing the message (`JSON.stringify(new Error())` is
  `{}`); it now passes it through. A password error shows "This PDF needs a password." (and
  "That password didn't work." after a try); anything else shows "Can't open this file". With
  no message, the old prompt is shown, and a failure after a password try falls back to
  "Can't open this file".
- **Known limit:** night mode is still a dim overlay; pdf-jsi has no invert or dark rendering
  (see `PdfPageView`).

### R5 · Office formats: read-only, safe, honest *(S)*
Status: in progress: everything but the SheetJS swap is done in code (commit 2e00ceb). **Open:** the
`xlsx` 0.20.3 tarball (cdn.sheetjs.com was blocked from the session that built this); device checks

- **Security:** replace `xlsx@0.18.5` (npm) with SheetJS **0.20.3** from
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (the official distribution) in
  `package.json`; check that `SheetView` still works (CSV, XLSX, XLS samples in tests). Cap
  parsing at 10 MB and 50,000 cells with a "File too large to preview" message.
- **DOCX:** a read-only viewer, since the dependencies already exist: `mammoth` converts to
  HTML, shown in `react-native-webview` with JavaScript **disabled**, no network
  (`originWhitelist` limited to `about:blank`, images only inline as data URIs), and app theme
  CSS. Text goes into the page text so library search finds it.
  If this proves unreliable, remove `mammoth` and the DOCX claims instead (record the
  decision in this step).
- **Legacy DOC:** not supported. Remove it from the README and from `DocFormat` handling
  (show "Old .doc files aren't supported; open in Google Docs and export as PDF").
- Picker and "Open with": allow exactly the formats that have a viewer (PDF, TXT, CSV, XLSX,
  XLS, DOCX); add the matching `app.json` intent filters (`text/plain`, `text/csv`, the Excel and
  Word MIME types).
- **Not promoted:** no editing, no conversion to PDF, no Office tools. The README describes them
  as "preview only".
- Tests: SheetView with the three formats; the size cap; DOCX text extraction for search; the
  picker's MIME list equals the formats with a viewer.

**Done when:** every format the app accepts can be opened, nothing it advertises fails, and
`npm audit` shows no `xlsx` advisories.

**As built:**
- **SheetJS swap not done yet.** `package.json` still has `xlsx@^0.18.5`: the build session
  couldn't reach `cdn.sheetjs.com`, and pointing `package.json` at the tarball without
  updating the lockfile would break `npm ci`. To finish, run
  `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` with that host reachable,
  re-run `npm test` (the sheet tests write and read real XLSX/XLS files) and `npm audit`. The
  code only uses `read`, `utils.sheet_to_json`, `decode_cell` and `encode_range`, which 0.20.3
  keeps.
- Parsing moved from `SheetView` to `documents/sheetService.ts` (`loadSheets`, caps
  `SHEET_MAX_BYTES` / `SHEET_MAX_CELLS`, `PreviewTooLargeError`). The cell cap counts
  non-empty cells. Rows are built from A1 to the last real cell, so a stray formatted cell at
  XFD1048576 can't blow up the row list. Cells are read as displayed (`raw: false`), without
  formulas, styles, HTML or macros.
- DOCX: `documents/docxService.ts` + `components/reader/DocxView.tsx`. Besides JavaScript off
  and `originWhitelist` limited to `about:blank`, every navigation is refused
  (`onShouldStartLoadWithRequest`), file access is off, and the page has a CSP
  (`default-src 'none'; img-src data:; style-src 'unsafe-inline'`). DOCX gets its own 20 MB
  cap (embedded photos are inlined, not parsed). No in-reader Find for DOCX (it would need
  JavaScript in the page). The text goes into a single synthetic page when the file joins the
  library, like CSV/TXT. mammoth bundles for Android (`expo export`, via its browser build); it
  hasn't been tried on a device yet.
- `.doc`: `DocFormat` keeps `'DOC'` only for documents added before; `detectDocFormat` never
  returns it, `importExternalFile` throws `LegacyWordDocError` (snack: the Google Docs
  message), and the Reader shows the same message for an old DOC document.
- Picker and intent filters: `formatCapabilities.OPENABLE_FORMATS` / `PICKER_MIME_TYPES` (plus
  the `text/comma-separated-values` alias). `app.json` VIEW registers all six formats; SEND
  registers all of them except `text/plain`, because SEND `text/plain` is how apps share plain
  text snippets, not files. A test checks the picker list and the VIEW filter against
  `OPENABLE_FORMATS`.

### R6 · Real PDF passwords *(L — later, with Pro in §10)*
Status: later

- Only when Pro is built (§10 lists "real PDF encryption" as a Pro feature). Until then
  "Protect" stays hidden (F2).
- Add `encrypt(in, out, { userPassword, ownerPassword?, allowPrint })` and
  `decrypt(in, out, password)` to `modules/pdf-native`:
  - iOS: PDFKit `PDFDocument.write(to:withOptions:)` with the user and owner password options
    (AES);
  - Android: PDFBox-Android (Apache 2.0) or qpdf; **measure the APK size per ABI first** and
    pick the smaller one that supports AES-256.
- Encryption applies to an export/share copy only; the library copy stays readable by the app.
  "Remove password" (decrypt) lets students unlock a PDF they know the password for, so R2's
  tools work on it.
- Tests: an encrypted file needs the password to open in pdf.js; a wrong password fails;
  decrypt then tools work.

---

## Order and dependencies
R1 (the native module), then R2, then R3, then R4, then R5. R5 is independent and can be done
earlier (its security fix is worth doing soon). R6 waits for §10 Pro.

## Maintenance rules (keep in mind for every step)
- `components/reader/PdfPageView.tsx` stays the only importer of `react-native-pdf-jsi`.
  When upgrading it, re-check `searchTextDirect`, `highlightRects` and `onPageSingleTap`, and
  the iOS build.
- `modules/pdf-native` pins `pdfiumandroid` to the version pdf-jsi uses, so the app doesn't
  ship two copies; re-check both on upgrades.
- Large files: every per-page loop goes through `processSequentially`; never load a whole PDF's
  pages as images at once.

## Critical files
- `modules/pdf-native/` (new), `src/services/pdf/{pdfNative (new),pdfOps (new),pdfService}.ts`
- `src/services/persistence/{libraryOperations,migrations,libraryRepo}.ts`,
  `src/services/documents/formatCapabilities.ts`, `src/services/files/externalFileService.ts`
- `src/screens/{ReaderScreen,LibraryScreen}.tsx`, `src/components/reader/*`,
  `src/components/review/GridPagesModal.tsx`
- `src/components/reader/{SheetView,DocxView (new)}.tsx`, `package.json`, `app.json`, `README.md`

## Verification (for the whole of §7)
1. `npm run typecheck && npm test` pass in CI; `npm audit` shows no `xlsx` advisories.
2. On an Android and an iOS device (dev builds):
   - import a 40-page text PDF and a 10-page scanned PDF: thumbnails appear, search finds words
     from both;
   - merge a teacher PDF with a scanned answer, sign, submit under 2 MB;
   - edit pages of a saved document: reorder, rotate, delete, add a page from a new scan;
   - reopen a long document: it resumes at the last page; jump to a page;
   - open a DOCX, an XLSX and a CSV from the Files app ("Open with").
3. A password-protected PDF opens with its password, and the tools explain why they are off.
