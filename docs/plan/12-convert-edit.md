# §12 Convert and light edit: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement D1 from docs/plan/12-convert-edit.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §7 R1 (imported PDFs indexed by `modules/pdf-native`), §7 R5 (office
  viewers), §6 L4 (i18n). D4 also needs R5's SheetJS 0.20.3 swap. All new UI text goes through
  `src/i18n/en.ts`.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.
- Step prefix is **D** (documents). C is §1 Capture.
- **Next: D1** (the Pro task gate). D2–D4 (the reader) don't depend on D1 and may go first.

## Context
**Planned 2026-10-03; revised the same day** (study-first reader, Pro tasks behind a full-screen ad). Since the "Open with" fix (the `withDocumentIntentFilters` plugin), file
managers offer PDF Scan for PDF, DOCX, XLSX/XLS, CSV and TXT. Students then want the same app
to *do* something with those files, not only show them: turn a teacher's Word handout into a PDF
for submission, get editable text out of a scanned page, fix a typo in a CSV.

Until now office files were read-only by design (§1 "not a general office suite", §7 R5).
**The owner's decisions (2026-10-03):**
1. **Convert + light edit.** Conversions, plus simple edits to TXT/CSV/XLSX/DOCX text and PDF
   forms. Editing that keeps every bit of formatting (a real Word/Excel engine) is out of
   scope: it would need a commercial SDK (Apryse, Syncfusion, OnlyOffice) with a paid licence
   and a much bigger app.
2. **Conversions that matter:** PDF/scan → Word, Word → PDF, Excel/CSV → PDF. (Scan table →
   Excel was considered and left out: OCR'd tables come out too rough.)
3. §1's line becomes "light conversions and edits for coursework, not a full office suite".
   Each step still has to answer "does this help a student scan, submit, or study?"

**Rules for every step:**
- **Never change the original.** Conversions always make a new library document. Edits to an
  office file save a copy (TXT/CSV, which lose nothing, may save in place).
- **Say what's lost.** DOCX/XLSX written by the app keep the content, not the exact layout,
  styles or charts. The UI says so before saving, never after.
- **Offline, one page at a time,** with the existing size caps (`sheetService`,
  `docxService`). Files from outside are untrusted: escape everything that goes into HTML, keep
  WebViews locked down (no network, no navigation).
- **Pro or free (decided 2026-10-03):** all conversions and file editing are Pro, unlocked per task by a full-screen rewarded ad (D1). Marking, OCR, copy/extract text stay free.

### What the code looks like today (checked 2026-10-03)
- Reader viewers are read-only: `components/reader/DocxView.tsx` (mammoth → HTML in a WebView
  with JS off and a strict CSP), `SheetView.tsx` (`services/documents/sheetService.loadSheets`,
  SheetJS 0.18.5, caps 10 MB / 50k cells), `TxtView.tsx` (`txtService.readTextWithEncodingFallback`).
  `services/documents/formatCapabilities.OPENABLE_FORMATS` = PDF, TXT, CSV, XLSX, XLS, DOCX.
- Non-PDF files enter the library through `promoteExternalToLibrary`
  (`services/persistence/libraryOperations.ts`): DOCX/CSV/TXT get one synthetic page whose
  `ocr.text` holds the text (search); XLSX/XLS get none. An imported PDF is
  `sourceKind: 'imported_pdf'` and R1 indexes it (`services/pdf/pdfNative.ts`: `getPageText`
  with word boxes, `renderPage`).
- Scans keep per-page OCR in `LibraryPage.ocr` (`PageOcr`, blocks with boxes).
- Available to reuse: `expo-print` (already used by `services/sharing/shareService.ts`),
  `pdf-lib`, `mammoth`, `xlsx`, `papaparse`, the store-only `ZipWriter`
  (`services/backup/zip/zipWriter.ts`; a store-only zip is a valid DOCX), the Reader overflow
  menu (`components/reader/OverflowSheet.tsx`, `OverflowItemId`), and T4's annotate layer
  (`components/reader/AnnotateSheet.tsx`).

### Revision 2026-10-03: the owner's further decisions
- "OCR conversion" = **scan/PDF → Word only**. Scanning with searchable text, copy text,
  select text and extract to .txt stay free (`FREE_FOREVER` keeps `ocr`, `reader`).
- **One ad per task:** one rewarded (full-screen) ad per conversion; for editing, one ad
  unlocks the editor **for that document for 30 minutes** (no ad per save). Day-pass holders see
  no ads. If no ad can load (offline, no fill, error), **the task runs anyway** so nobody is
  stuck.
- **Editing files is Pro, marking is free:** Pro = edit TXT/CSV/XLSX/Word, fill PDF forms, typed
  text boxes, plus all conversions (Office → PDF, scan/PDF → Word). Free = highlight,
  underline, strikethrough, pen, notes, bookmarks.

### What the review of the first version found (fixed in this version)
1. **D6 breaks the plan's own rule.** It saves filled forms "into the document's PDF (imported
   PDFs)", but the rules say "Never change the original". Fix: forms save a copy, like every
   other edit.
2. **The open question "Pro or free" is now answered** (above). The "Default: conversions are
   free" line and the "Open questions" section go.
3. **D6's text box and D7's "Edit" button depend on the current reader layout**, which this
   update replaces (marking moves into the new Mark mode; Edit/Convert move into the new tool
   bar). They are rewritten to match.
4. **The reader today is not study-first** (checked in code):
   - `ReaderScreen.tsx` is 824 lines;
   - highlighting = overflow → Annotate → `AnnotateSheet`, a separate full-screen editor showing
     one page at a time; select/copy/extract text are also overflow items;
   - the bottom `ReaderActionBar` holds Share, Sign, Export, Print;
   - marking has highlight (4 colours), pen (colours, 2 widths), note and eraser; no
     underline/strikethrough; no list of a document's highlights and notes;
   - the native viewer (`react-native-pdf-jsi`) can't draw, but supports `enablePaging`,
     `horizontal`, `fitPolicy`, `spacing`; `expo-keep-awake` isn't installed.
5. **Making these Pro conflicts with §10's ad rules** ("no full-screen interstitials", "never
   in the Reader"). A *rewarded* full-screen ad that the student chooses before a Pro task is
   allowed by AdMob policy (it is the format meant for "watch to unlock"). §10's rules are
   reworded: full-screen ads appear only after the student taps a Pro task and confirms; never
   automatically; no interstitials; banners still only on Home and Library.
6. **Flow risks after a full-screen ad** (from the code):
   - Android reports the app as backgrounded while the ad activity is on top. `useAppLock`
     records `backgroundedAt` unless its `authenticating` flag is set, so with "lock right
     away" **the app lock would ask for the PIN when the ad closes**;
   - Android may kill the app process during a long ad, losing the task the student asked for;
   - the existing `rewarded.ts` waits up to **30 s** for a load, which is too long before a
     task (fine for the day pass);
   - an ad shown while a modal sheet is open can fail or leave the sheet in a bad state (iOS
     presents over the top view controller);
   - AdMob ads expire about an hour after loading, so a preloaded ad must be refreshed.

## Steps

### D1 · Pro task gate: a full-screen ad, then the task continues *(M)*
Status: not started.

- `PRO_FEATURES` gains `convert` (Office → PDF, scan/PDF → Word), `editFiles`
  (TXT/CSV/XLSX/Word) and `pdfForms` (fill forms, typed text boxes), all `lapse: 'keepExisting'`
  (what was made stays). `FREE_FOREVER` is unchanged (its baseline test must still pass).
- `src/services/pro/proTask.ts` (pure decisions, fully tested):
  - `decide({ isPro, grants, feature, docId, now, adsAvailable, offlineRunsToday }) →`
    `'run' | 'offerAd' | 'runWithoutAd' | 'offerPro'`;
  - grants: `once` (a conversion) or `session { docId, until }` (editing; length from Remote
    Config `edit_unlock_minutes`, default 30);
  - fail-open: when no ad can load, `runWithoutAd`, counted per day; after Remote Config
    `offline_free_tasks_per_day` (default 5) it offers the day pass with a kind message (this
    stops airplane-mode abuse without leaving a normal student stuck).
- `src/services/ads/rewarded.ts` refactor: a generic `showRewarded({ timeoutMs })` used by both
  the day pass (30 s, as now) and tasks (**8 s**, Remote Config `task_ad_timeout_ms`), plus a
  **preloader**: when a screen with Pro tasks opens (Reader for a convertible or editable
  document, Library selection), load one rewarded ad in the background; reuse it if it is under
  50 minutes old, otherwise load fresh.
- `useProTask(feature)` hook and `ProTaskSheet`: "Watch a short ad to convert 'Handout.docx'"
  with "Watch ad" (primary) and "Get Pro for 24 hours" (the day pass screen). The sheet closes
  **before** the ad is shown.
- **Flow continuity (the core of this step):**
  - before showing the ad, write a `PendingProTask { id, feature, docId, params, rewarded: false, createdAt }`
    to AsyncStorage; set `rewarded: true` on the reward event; clear it when the task finishes;
  - while the ad is open, set a shared "external screen" flag (generalising `useAppLock`'s
    `authenticating`) so app lock, the entitlement refresh and other `AppState` handlers ignore
    that trip to the background;
  - on close: rewarded → start the task at once, with the same progress UI as without an ad
    (the Reader stays mounted under the ad, so no navigation happens); closed early → nothing
    runs, the screen is unchanged, snack "Watch to the end to convert";
  - after a process death: on the next start, a rewarded `PendingProTask` under 1 hour old
    offers "Finish converting 'Handout.docx'?" and runs it; older ones are dropped;
  - day-pass holders and an active session grant never see the sheet.
- Telemetry (M8 allow-list): `pro_task_ad_shown`, `pro_task_ad_rewarded`,
  `pro_task_run_without_ad` (feature id only).
- Tests: every `decide` case; session expiry; the offline cap; pending task write, reward,
  clear, and resume after a restart; app lock doesn't lock on return from an ad
  (`lockOnReturn` with the flag); closed early runs nothing; the preloaded-ad age rule.
- Done when (device): converting with a free account shows one full-screen ad, and when it
  closes the conversion runs and finishes on the same screen, with app lock on "right away";
  airplane mode runs the task without an ad (up to the cap).

### D2 · Reader layout for studying *(M)*
Status: not started.

- First split `ReaderScreen.tsx` (824 lines) into hooks and components (`useReaderDocument`,
  `useReaderFind`, `useReaderChrome`, `ReaderToolBar`) with no behaviour change, so the next
  steps don't grow it.
- New layout:
  - **top:** Back, title, page "12 / 40" (tap to jump; R4), Find, Bookmark, More;
  - **bottom tool bar (study first):** **Mark** (D3), **Select text**, **Notes** (D4),
    **Pages** (the R4 scrubber), and **Convert/Edit** with a Pro badge when the format
    allows it (through D1);
  - Share, Sign, Export, Print, Submit, Edit pages, Change type, Delete move to More.
  - Tap the page to hide or show the chrome (immersive reading); the chrome comes back on
    scroll-up.
- **Reading settings sheet** (per document where it matters, else global): continuous scroll or
  page by page (`enablePaging`), fit width or whole page (`fitPolicy`), page spacing, night
  overlay strength, **keep screen on while reading** (add `expo-keep-awake@~57`, check the
  version in the package source).
- Tests: the tool-bar items per format and Pro state; settings persistence; the split keeps the
  existing Reader tests passing.
- Done when: the most-used study actions are one tap away while reading, and the reading
  settings survive a restart.

### D3 · Mark mode: highlight, underline, strike, pen and notes while reading *(L)*
Status: not started.

Replaces the `AnnotateSheet` modal (free, `annotations` stays in `FREE_FOREVER`).
- `MarkView`: a vertical list of `PageCanvas` pages at screen width (scans: display or master
  images; imported PDFs: `pdfNative.renderPage` on demand), **windowed** (current page ±1 kept
  in memory, `processSequentially` for renders). Entering Mark mode opens at the page being
  read, and leaving returns the native viewer to the page last marked (§5 `pageMap`).
- Floating tool palette: **Highlight** (snaps to words, 4 colours), **Underline**,
  **Strikethrough** (both snap to words too), **Pen** (colours, 2 widths), **Note**, **Eraser**,
  Undo/Redo. One finger draws, two fingers scroll and zoom; a Hand tool to scroll with one
  finger. The last tool and colour are remembered.
- From **Select text**: selecting words shows "Highlight · Underline · Copy", so highlighting
  works without entering Mark mode.
- Annotation kinds gain `'underline' | 'strike'` (same word-rect data as highlights; a migration
  only if the column has a check constraint), written to the PDF as `/Underline` and
  `/StrikeOut` with QuadPoints and appearance streams (`services/annotations/pdfAnnotations.ts`).
- Saving: each mark is stored at once (as today); the PDF is updated in the background when
  leaving Mark mode (`updatePdfAnnotations`, debounced), then the native viewer reloads.
- Tests: snapping for underline and strike; the PDF writer emits the two new subtypes; window
  maths; page position kept between Read and Mark mode.
- Done when: a student can highlight and underline across several pages without leaving the
  document, and the marks show in the Reader and in other PDF apps.

### D4 · Notes panel *(S)*
Status: not started.

- A sheet listing the document's highlights, underlines, notes and bookmarks by page: colour
  dot, the marked text (from the snap text), the note text; filter by colour or kind; tap to jump
  to the page (and flash the mark).
- **Export notes** (free): a `.txt` (or `.md`) of the marked text and notes with page numbers,
  shared with `shareAs`.
- Tests: grouping and order; filters; the export format.

### D5 · Office → PDF (Word, Excel/XLS/CSV, TXT) *(M)*
Status: not started.

**Pro: `convert`, one full-screen ad per conversion** (through D1's `useProTask('convert')`; day-pass holders see none).
- The Reader entry point is D2's tool-bar **Convert** button (and More), not only the overflow item.
- New `src/services/convert/toPdf.ts`, one function per source, each returning print HTML:
  - DOCX: `docxToHtml` (`services/documents/docxService.ts`), wrapped with the CSS of
    `docxPageHtml` (light theme only, printable margins).
  - XLSX/XLS/CSV: `loadSheets` (keeps its caps) → one HTML `<table>` per sheet, sheet name as
    heading, `page-break-before` between sheets, header row repeated (`thead`), landscape when
    a sheet has more than ~8 columns.
  - TXT: `readTextWithEncodingFallback` → `<pre>` with `white-space: pre-wrap`.
  - Every cell/line is HTML-escaped. mammoth output has no scripts, and the page carries the
    `DocxView` CSP anyway.
  - `Print.printToFileAsync({ html, width, height })` → temp PDF.
- Move the PDF branch of `promoteExternalToLibrary` into `addPdfFileToLibrary(uri, name)` and
  use it in both places. The result is an `imported_pdf`, so R1 gives it thumbnails and search,
  and merge, sign and submit work on it. Name: `"<name>"` with the `.pdf` format tag. Delete
  the temp file afterwards (`cleanTemporaryCache`).
- `formatCapabilities.canConvertToPdf(format)`: DOCX, XLSX, XLS, CSV, TXT.
- Reader: overflow item `convertToPdf`, shown for library documents and for opened outside
  files. It shows progress, dispatches `library/ADD_FILE`, then a snackbar with "Open".
- Tests `src/services/convert/__tests__/toPdf.test.ts`: HTML per format, escaping
  (`<script>` in a cell stays text), sheet page breaks, the too-large error passes through,
  `expo-print` mocked as in `shareService.test.ts`.

### D6 · PDF/scan → Word *(M–L)*
Status: not started.

**Pro: `convert`** (scan/PDF → Word is the one "OCR conversion" that is Pro; OCR itself, copy and extract text stay free).
- Show the "keeps the text and its order, not the exact layout" notice **before** the ad, so nobody watches an ad and then cancels.
- New `src/services/convert/docxWriter.ts`: writes a minimal OOXML package
  (`[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`,
  `word/_rels/document.xml.rels`) with `ZipWriter`. Model: paragraphs (with a heading level),
  page breaks. All text is XML-escaped, and characters that XML 1.0 forbids are dropped.
- `src/services/convert/toDocx.ts`: text per page, **one page at a time**: `page.ocr` for scans,
  `pdfNative.getPageText` for imported PDFs (falling back to the page's stored OCR from R1).
  Rebuild lines from word boxes (same baseline), and paragraphs from gaps between lines. Mark a
  line as a heading when it is clearly taller than the page's median line. A page with no text
  gets one short line ("Page N: no text found").
- The result goes into the library through the DOCX branch of `promoteExternalToLibrary` (so it
  is searchable). Overflow item `convertToWord` for PDF/JPG documents with text, or with OCR
  that can still run.
- The UI says before converting: "Keeps the text and its order, not the exact layout."
- Tests: the package opens with mammoth (round trip in Jest), escaping, line/paragraph grouping
  from fixture boxes.

### D7 · Edit TXT and CSV *(M)*
Status: not started.

**Pro: `editFiles`, one ad unlocks editing that document for 30 minutes** (Remote Config `edit_unlock_minutes`); saving inside the session never shows an ad.

- TXT: a full-screen editor (multiline `TextInput`, monospace option, unsaved-changes guard on
  Back).
- CSV: tap a cell in `SheetView` to edit it; add and delete rows. Written with `Papa.unparse`.
- Saving writes a new file, then swaps it in for the document's `contentUri` and refreshes
  its search text. A file opened from outside is saved into the library (via
  `promoteExternalToLibrary`), and the original outside file is never written.
- Tests: the CSV round trip keeps quotes, commas and newlines; the TXT encoding stays UTF-8.

### D8 · Edit XLSX cells *(M)*
Status: not started. **Needs §7 R5's SheetJS 0.20.3 swap first** (0.18.5 has known advisories).

**Pro: `editFiles`** (same session rule as D7).

- Cell editing in `SheetView` for XLSX/XLS. Saved with `XLSX.write(wb, { type: 'array',
  bookType: 'xlsx' })` to a new library document ("<name> (edited)"). An XLS is saved as XLSX.
- Before saving, the UI warns: "Styles, charts and some formulas may be lost." It always saves a
  copy.
- Tests: values and formulas as text survive a round trip, and the cell cap applies.

### D9 · Edit Word text *(L)*
Status: not started.

**Pro: `editFiles`** (same session rule as D7). Needs D6's `docxWriter`.

- A separate `DocxEditor` WebView (DocxView stays locked and read-only): mammoth HTML in a
  `contenteditable` body, and a small toolbar for bold, italic, heading 1/2, bullet/numbered
  list and undo. JavaScript is on **only here**, with our own script inlined, a CSP that blocks
  every network load, and every navigation refused. Messages go back through `postMessage`.
- HTML → DOCX by extending `docxWriter` with runs (bold/italic), lists, simple tables and inline
  images (data URIs → `word/media/`).
- It always saves a copy, with a "layout may change" notice shown first. The text goes into the
  copy's synthetic page so search finds it.
- Tests: HTML → DOCX → mammoth round trip keeps headings, lists, bold/italic, tables.

### D10 · PDF: fill forms and add text *(M)*
Status: not started.

**Pro: `pdfForms`.** Two fixes to the first version: filled forms **always save a copy** (the original first version wrote into an imported PDF, against the "never change the original" rule), and the text-box tool lives in **D3's Mark palette** (marked Pro there; highlights, pen and notes stay free).

- Forms: `pdf-lib` `getForm()`. List text fields, checkboxes, radios and dropdowns in a sheet,
  fill them, optionally flatten, and save as a **new library document** ("<name> (filled)").
  A PDF without fields says so.
- Add text: a text-box tool in D3's Mark palette (position, size, color from the theme's
  annotation palette), burned in on export like the other annotations.
- Password-protected PDFs: not offered (`isPasswordProtected`).
- Tests: filling and flattening a fixture form; a text annotation lands at the right place on
  the PDF.

### D11 · Reading updates for Word and Excel *(M)*
Status: not started.

**Free.**

- Find in DOCX (search the mammoth text, scroll the WebView to a match through an injected,
  read-only anchor list) and XLSX (`IN_READER_FIND_FORMATS`).
- Sheets: pinch zoom and a frozen header row/first column.
- Edit and Convert entry points are D2's tool bar (through D1's gate); nothing extra here.

### Order
D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8 (after the SheetJS swap) → D9 → D10 → D11.
D2–D4 (reader) don't depend on D1 and could go first if the owner prefers.

## Verification
Per step: `npm run typecheck && npm test` (the step's new tests and
`src/i18n/__tests__/hardcodedStrings.test.ts`). Then on a device:
- Open each format both from Files "Open with" and from the library, then convert or edit it.
- The result opens in the Reader. A new PDF gets thumbnails and search, and can be merged and
  submitted. A new DOCX opens in DocxView and is found by search.
- The original file (library copy and the outside file) is unchanged.
- Oversized files show the existing "too large" message, and nothing half-written is left in
  `library/`.

**Done when:** a student can open a teacher's DOCX or XLSX from WhatsApp, turn it into a PDF and
submit it; turn a scanned page into an editable Word file; and fix a typo in a CSV, TXT, XLSX or
Word file, all offline.

For the Pro steps also: with a free account the task shows one full-screen ad and then finishes on
the same screen (app lock on "right away" doesn't interrupt it); with a day pass there is no ad;
in airplane mode the task runs without an ad up to the daily cap.
