# §12 Convert and light edit: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement D1 from docs/plan/12-convert-edit.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §7 R1 (imported PDFs indexed by `modules/pdf-native`), §7 R5 (office
  viewers), §6 L4 (i18n). D8 also needs R5's SheetJS 0.20.3 swap. All new UI text goes through
  `src/i18n/en.ts`.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.
- Step prefix is **D** (documents). C is §1 Capture.
- **Next: D9** (edit Word text; D8 waits for §7 R5's SheetJS 0.20.3 swap). D1–D7 are done in code.

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
Status: done in code (commit dc17a06); device check open (see "Done when").

**As built:**
- The three features are `status: 'planned'` (not listed on the Pro screen) until D5, D7 and
  D10 build them; flip each to `'live'` then.
- `decide` also takes `adsEnabled` (Remote Config `ads_enabled`) and `offlineFreePerDay`. With
  ads switched off by the owner there is no ad and no day pass to unlock with, so tasks just
  run, uncounted. `checkProTask` always passes `adsAvailable: true` (unknown until an ad is
  asked for); a failed load comes back through `watchAdForTask` as `runWithoutAd` / `offerPro`.
- A once grant is stored on the reward too and used up only when the task *finishes*, so a
  failed conversion can be retried within the hour without another ad.
- Code: `services/pro/proTask.ts` (pure rules, storage, runner registry),
  `services/pro/proTaskFlow.ts` (check → watch → complete, resume),
  `services/security/externalScreen.ts` (a counter; `useAppLock`'s unlock sheet uses it too;
  `appLock.backgroundedAtOnLeave`), `services/ads/rewarded.ts` (`showRewarded`,
  `preloadRewarded`, `isPreloadFresh`), `components/pro/useProTask.tsx` (returns `start`,
  `element`, `loadingAd`; a non-modal "Loading the ad…" overlay while it loads),
  `ProTaskSheet.tsx`, `ProTaskResumeHost.tsx` (an Alert, inside `AppLockGate`, after the library
  loads).
- `PendingProTask` also has `kind` (which runner finishes it) and `title` (for the resume
  message). D5/D6 call `registerProTaskRunner(kind, runner)` at module load of a module imported
  at start; a pending task with no runner is dropped.
- Telemetry params are numbers only (M8), so `feature` is `PRO_TASK_FEATURE_CODES`
  (convert 1, editFiles 2, pdfForms 3).
- Preloading only happens when the ads SDK is already running (banners started it), so opening
  the Reader never brings up the consent form. Nothing calls `useProTask` yet: D5 is the first.

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
Status: done in code (commit 020361d); device check open (see "Done when").

**As built:**
- Split: `components/reader/useReaderDocument.ts` (document, files, page/password/load state,
  resume and "where I left off"), `useReaderFind.ts`, `useReaderChrome.ts` (bars, immersive tap,
  keep-awake), `ReaderToolBar.tsx`, `ReadingSettingsSheet.tsx`. `ReaderActionBar` and
  `ReaderBottomChrome` are gone. `ReaderScreen.tsx` is ~700 lines: the signature flow and the
  sheets stay in it.
- Which actions show where is pure: `services/documents/readerTools.ts` (`readerTools`,
  `readerMoreItems`, `readerProTasks`). More takes its item list from there (`OverflowSheet`
  `items`), and scrolls on small phones.
- **Notes isn't in the tool bar yet**: D4 adds it (the panel doesn't exist). Mark opens T4's
  `AnnotateSheet` until D3; Mark and Select text show for scans only (`hasPageMasters`), as before.
- **Convert/Edit** shows only when `readerProTasks` returns a task, i.e. once that feature is
  `status: 'live'` in `PRO_FEATURES` (D5/D7/D10). Today none is, so it's hidden; the step that
  makes the first one live adds the task picker (through `useProTask`) in `handleTool`.
- Reading settings are **global** (`settings.reading`, `services/documents/readingSettings.ts`,
  persisted in `app:settings`, read field by field by `normalizeReading`); none seemed worth a
  per-document library column. Night moved there too (it used to be `reader.night`, unsaved), with
  Low / Medium / High dimming (Medium = the old 0.72 overlay). Layout, fit and spacing show for
  the PDF engine only. Keep screen on: `expo-keep-awake@~57.0.2`, tag `reader`, off by default (a native module:
  **needs a new dev build**).
- "Chrome comes back on scroll-up" = the page number going down (PDF engine); the text and sheet
  viewers show it on tap only.

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
Status: done in code (commit d41bfc0); device check open (see "Done when").

**As built:**
- `components/reader/MarkView.tsx` replaces `AnnotateSheet` (deleted). It's an overlay over the
  Reader, not a Modal. The column isn't a FlatList: one Reanimated layer (`transformOrigin` top-left,
  screen = content × scale + translate) holds every page as an empty box, and only `markWindow`'s
  pages (current ±1) draw their image and marks. The pure maths (layout, page under a point, touch
  → master pixels, clamp, zoom about the pinch, window) is `services/annotations/markMode.ts`.
- Imported PDFs can be marked too: `formatCapabilities.canMark` (indexed, not password-protected,
  pdf-native in the build) gates Mark and Select text in `readerTools`. Their pages render through
  `useMarkPageImages` (`processSequentially`, PREVIEW size, deleted when they leave the window).
  `pdfAnnotations.pdfLevelMapper` maps master pixels through each PDF page's crop box and
  `/Rotate` (minus `page.rotation`, a turn added after indexing; checked against pdf.js's own
  viewport in the test). A scan page merged into an imported PDF maps through `imagePlacement`.
- Underline and strike: no migration (the `kind` column has no check constraint); `libraryRepo`
  reads the new kinds. Both snap with `snapHighlight` and use the pen colours (`lineColor`; a yellow
  underline barely shows). `marks.markLine` gives the line (bottom of the word box / just above the
  middle) for both the overlay and the PDF appearance stream; QuadPoints are mapped corner by
  corner, so a turned page keeps the text direction.
- A tap with Highlight/Underline/Strike marks the word under it (nothing when there's no word);
  Hand scrolls with one finger (with fling). Undo and Redo cover add, erase and note edits.
- Remembered tool and colours: `settings.reading.mark` (`normalizeMark`), not a new storage key.
- Saving: leaving Mark mode returns the native viewer at once (`pdfPageFor` of the page last marked,
  else the page on screen); `useAnnotationPdfSync` then writes `document.pdf` (400 ms debounce,
  never two writes at once) and reloads the viewer, which reopens on the page being read
  (`PdfPageView.initialPage`, read once at mount: pdf-jsi jumps whenever its `page` prop changes).
- Select text gained Highlight and Underline (`snap.wordRects`), and shows imported pages through
  `PageCanvas`'s new `image` prop (`usePageImage`, turned back by `page.rotation`); Run OCR is
  hidden for them (their text comes from indexing).
- A scan's page with `rotation` is still shown unturned in Mark mode and Select text, as T4/T3 did.
- Device check open: drawing smoothness on a mid-range phone, two-finger scroll vs. a stray
  one-finger stroke, marks in another PDF app (including an imported PDF with `/Rotate`).

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
Status: done in code (commit 4a51962); device check open (the flash, and the export in another app).

**As built:**
- `services/annotations/notesPanel.ts` (pure): `documentNotes` (page order; on a page a bookmark
  first, then top to bottom, then oldest first), `filterNotes`, `notesFilterOptions` (only the kinds
  and mark colours present; none when there's a single one), `groupNotesByPage`,
  `formatNotesExport` with `notesExportLabels` (`document.notesExport.*`, the document language).
  Pen strokes aren't listed (nothing to read). A colour filter shows marks only.
- `components/reader/NotesSheet.tsx`, opened from the tool bar's **Notes** (`readerTools`: any
  library PDF/JPG, so an unindexed or locked PDF still lists its bookmarks). More → Bookmarks stays
  (it can remove bookmarks).
- Flash: the viewer draws PDF-space rects only, so `useMarkFlash` searches the PDF's text on that
  page for the mark's first five words (`flashQuery`; a scan's OCR layer or an imported PDF's text)
  and shows the hits for 1.6 s through `highlightRects`. No text, no flash; notes and bookmarks
  just jump.
- Export: a `.txt` of what the filter shows, `<name> notes.txt`, through `shareAs`
  (`textExport.writeExportText`).

- A sheet listing the document's highlights, underlines, notes and bookmarks by page: colour
  dot, the marked text (from the snap text), the note text; filter by colour or kind; tap to jump
  to the page (and flash the mark).
- **Export notes** (free): a `.txt` (or `.md`) of the marked text and notes with page numbers,
  shared with `shareAs`.
- Tests: grouping and order; filters; the export format.

### D5 · Office → PDF (Word, Excel/XLS/CSV, TXT) *(M)*
Status: done in code (commit 58f09ba); device check open (each format from the library and from
"Open with", with and without an ad; the printed margins and landscape sheets on paper size A4).

**As built:**
- `convert` is `status: 'live'`. It also covers D6 (scan/PDF → Word), so
  `readerTools.BUILT_CONVERSIONS.pdfToWord` (false until D6) keeps Convert off PDFs and scans;
  the Pro screen's label drops "and scans to Word" until then.
- `services/convert/toPdf.ts`: `printHtmlFor` (`docxPrintHtml`, `sheetPrintHtml`,
  `txtPrintHtml`) and `convertToPdf` (→ `Print.printToFileAsync` on A4, 595×842 pt →
  `addPdfFileToLibrary` → the temp file deleted in `finally`). The paper is **white** with the
  light theme's ink (the light theme's beige background would waste toner). DOCX uses
  `docxPageHtml(body, paper, { print: true })`, which adds `PRINT_PAGE_CSS` (`@page` margins,
  full-width tables, no row or picture cut across pages); sheets and TXT use the same CSS and CSP.
- Landscape is for the **whole** PDF when any sheet has more than 8 columns (per-sheet page
  orientation needs CSS named pages, which the print WebViews don't honour). A CSV gets no sheet
  heading (its "Sheet1" name is made up). Short rows are padded so tables stay rectangular.
- TXT had no size cap; printing holds it all in one WebView, so `TXT_PRINT_MAX_BYTES` (2 MB)
  throws `PreviewTooLargeError` like the sheet and DOCX caps.
- "Say what's lost": DOCX, XLSX and XLS ask first (an Alert: layout, fonts, headers for Word;
  colours, formulas, merged cells, charts for sheets). TXT and CSV, which lose nothing, don't.
- `addPdfFileToLibrary(uri, name, pageCount)` in `libraryOperations` (the PDF branch of
  `promoteExternalToLibrary`, which now calls it); it removes the new folder if the copy fails.
  The page count comes from expo-print's `numberOfPages`; R1's indexer corrects it anyway.
- Reader: `components/reader/useConvertToPdf.tsx` (gate + "Converting to PDF…" overlay + snack
  with **Open**, which switches the Reader to the new PDF). The tool bar's Convert/Edit runs it
  directly (the only live task for an office file; D7 adds the picker), and More has
  **Convert to PDF** (`readerMoreItems(subject, { proTasks })`). The grant's `docId` is the
  library id, or the outside file's app-owned copy's uri.
- Pro task: `services/convert/convertTask.ts` (kind `officeToPdf`, params `uri`/`name`/`format`,
  validated by `sourceFromParams`) registers the restart runner; `ProTaskResumeHost` imports it.
  A failed conversion rethrows so the once grant isn't used up; `useProTask`'s Watch path now
  catches that instead of leaving an unhandled rejection.

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
Status: done in code (commit 6ebed74); device check open (a scan, an imported PDF with a text
layer, a scanned PDF from outside; the DOCX opened in Word, Google Docs and the app's DocxView;
with and without an ad).

**As built:**
- `readerTools.BUILT_CONVERSIONS.pdfToWord` is true: Convert/Edit on a scan (PDF or JPG) or a PDF
  (library or "Open with", not one that needs a password) runs Convert to Word; More has
  **Convert to Word** (`convertToWord`). The Pro screen's label is "…to PDF, and scans to Word".
- `services/convert/docxWriter.ts`: `writeDocx(dest, blocks)` through the backup code's
  `createZip` (store-only). Blocks: paragraphs (heading 1/2, `\n` → `<w:br/>`, tabs →
  `<w:tab/>`) and page breaks; A4 with 2.54 cm margins; styles named "heading 1/2" (Word's
  navigation pane, mammoth's `<h1>`/`<h2>`). `xmlText` escapes and drops what XML 1.0 forbids
  (controls, U+FFFE/U+FFFF, lone surrogates).
- `services/convert/toDocx.ts`: a library page uses the text it has (`page.ocr`: a scan's OCR, or
  the text R1 already read from an imported PDF, which is `getPageText` → `pdfTextToOcr`), so
  `getPageText` runs only for pages R1 hasn't read; a page without text gets OCR (a scan's
  master, or an imported/outside PDF page rendered at master size and deleted). A PDF from
  outside is read page by page with `getPageCount`/`getPageText`. A password or a build without
  `modules/pdf-native` stops the conversion; other per-page failures give "Page N: no text
  found" (`document.word.noText`, through `tDoc`).
- Lines come from OCR lines (an imported PDF's are rebuilt from word boxes by `pdfTextToOcr`);
  consecutive lines on the same row that OCR split are joined (`readingLines`). Paragraphs break
  at a new OCR block, a gap over 0.8 × the median line height, a jump back up (next column) or a
  heading edge; end-of-line hyphens before a lower-case letter are mended. Headings: ≥ 1.35 ×
  median → heading 2, ≥ 1.8 × → heading 1, only on pages with 3+ lines and lines ≤ 120 chars.
- The temp DOCX (`cache/convert/`) goes in through `promoteExternalToLibrary`'s DOCX branch
  (mammoth text → search), then is deleted. Named like the source.
- Reader: `components/reader/useConvertToWord.tsx` says what's lost (an Alert) **before** the
  gate, then shows "Converting to Word… page N of M" (D5's `Converting` overlay) and a snack with
  **Open**. The OCR script is the document's course's, else the app setting. Only one of the two
  conversion gates preloads an ad (the one the open file's format uses).
- Pro task kind `pdfToWord` in `convertTask.ts`: params `{ docId }` (looked up again at the
  restart; a deleted document is skipped) or `{ uri, name }` for an outside PDF's app-owned copy.
- Tests: `src/services/convert/__tests__/toDocx.test.ts` (mammoth round trip, the package's parts,
  escaping, line/paragraph/heading grouping from fixture boxes, the three sources, the runner).

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
Status: done in code (commit bfcba77); device check open (a TXT and a CSV from the library and
from "Open with", with and without an ad; re-opening Edit inside the 30 minutes shows no ad; Back
with unsaved edits asks first; a semicolon CSV and a Latin-1 TXT).

**As built:**
- `editFiles` is `status: 'live'`. It also covers D8 (XLSX) and D9 (Word), so
  `readerTools.BUILT_EDITS` (`text: true`, `sheet`/`docx` false) keeps Edit off XLSX and DOCX;
  the Pro screen's label is "Edit text and CSV files" until then.
- The gate covers **opening** the editor (Pro task kind `editFile`); saving never checks again,
  so an editor still open when the session ends still saves. No restart runner: the session grant
  is saved on the reward, so after a process death tapping Edit opens the editor without an ad
  (the pending task is dropped as one with no runner).
- One full-screen `components/reader/FileEditor.tsx` for both formats (not edit-in-place in
  `SheetView`, which stays read-only): Close/Back asks before discarding, Save closes it with a
  snack. TXT is a multiline `TextInput` (monospace toggle, on by default like TxtView; the system
  font otherwise, for every script), capped at `TXT_EDIT_MAX_BYTES` (1 MB). CSV is
  `CsvGrid.tsx` (SheetView's `computeColumnWidths`, a row-number column): tap a cell to edit it
  in a multiline prompt (a cell may be cleared or hold commas, quotes, line breaks), tap a row
  number to insert a row below or delete it, **Add row** at the end. Same caps as the viewer.
- `services/edit/textEdit.ts`: CSV is parsed like the viewer (Papa, blank lines skipped) and
  written with `Papa.unparse` using the **delimiter and line ending it was read with**; values are
  quoted only where needed. Everything is written UTF-8 (a Latin-1 fallback read says so first).
- Saving a library document writes `document-<id>.<ext>` beside the old file and patches
  `contentUri`, `sizeBytes`, the synthetic page's `ocr.text` (same page id) and
  `searchHaystack`; the viewer remounts on the new uri. Older copies are removed at the next save
  (by file name), never the one the stored document still points at.
- A file from outside goes through `promoteExternalToLibrary` from a temp copy (`cache/edit/`,
  deleted after); the Reader switches to the new document, and `proTask.carryGrant` moves the
  edit session to its id so the student isn't asked again. The editor says up front that the
  edit goes into the Library.
- Convert/Edit on a TXT/CSV asks "Convert or edit" (an Alert); More has **Edit** (`editFile`).
- Tests: `src/services/edit/__tests__/textEdit.test.ts` (CSV round trip with quotes, commas, line
  breaks and `\r\n`; semicolons; row/cell edits; caps; UTF-8 output incl. after a Latin-1 read;
  the swap and the pruning; an outside file never written; carrying the session).

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
