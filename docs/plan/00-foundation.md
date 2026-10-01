# §0 Foundation: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement F3 from docs/plan/00-foundation.md".
- Read `AGENTS.md` (auto-loaded) and the step you are implementing. Open only the files that
  step names unless something unexpected comes up.
- Steps are ordered. F1 comes first so every later step ships with tests.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`) and tick it in
  `docs/PLAN.md`. If the code no longer matches what a step describes, fix the step text too.

## Context
§0 is the first phase in `docs/PLAN.md`: the existing app must be trustworthy and store-ready
before any student features are built.

Decisions already made: app ID **`com.yeasin.pdfscan`**; crash reporting **Sentry, opt-in**
(off by default).

### What the code review found (this drives the steps)
1. **Risk of losing the whole library.** The library is one JSON string in AsyncStorage
   (`libraryStore.ts`, key `library:index`). It holds every document and every page's OCR
   blocks, and it is rewritten on every change (`useLibraryPersistence.ts`). On Android, a row
   larger than about 2 MB fails to read. `loadLibraryIndex` then returns `[]`, `loaded` becomes
   true, and the persist effect **overwrites the stored library with an empty one**. SQLite
   (`dbService.ts`) holds a second, partial copy that is used only for search.
2. **Quality drops at every step.** Scans are downscaled to 1200 px at JPEG 0.8
   (`scannerPipeline.ts`). Each rotate re-encodes the JPEG (`rotatePage` in `ReviewScreen`). The
   perspective crop, then `bakeEnhance` (92), then `saveImagesToLibrary`, which **stores library
   pages at the user's export quality**, then `embedPageImage` each re-encode again.
   `compressDocument` permanently overwrites the library page images with low-quality copies.
3. **OCR boxes go stale.** Rotating or cropping changes the image, but `page.ocr` keeps the old
   coordinates, so the invisible text layer ends up in the wrong place.
4. **The OCR text layer only works for Latin (WinAnsi) and Devanagari.** Chinese, Japanese,
   Korean and any Latin line containing a character outside WinAnsi are silently dropped
   (`pdfService.ts:54-58`, `:143-151`).
5. **Store hygiene.** `RECORD_AUDIO` comes from `expo-camera`'s plugin (`recordAudioAndroid`
   defaults to true; checked in the 57.0.3 source). The bundle ID is `com.anonymous.pdfScan`.
   `userInterfaceStyle` is `light`. Two spike screens are imported in `App.tsx`. "Protect" and
   "Unlock Pro" do nothing.
6. **Correction to my earlier review:** FTS input *is* already escaped
   (`dbService.ts:118-122`). Only the `LIKE` wildcards (`%`, `_`) are not.
7. `DeliverScreen` bakes all pages with `Promise.all`, which goes against the app's own rule of
   processing pages one at a time to save memory.
8. There are no tests and no CI.

---

## Steps (in order; each one is a separate commit)

### F1 · Test harness and CI *(first, so every later step ships with tests)*
Status: done (commit bb99d51). Device checks: see Verification.

- Add dev dependencies: `jest-expo@~57.0.5` (matches SDK 57), `jest`, `@types/jest`, and
  `pdfjs-dist` (used in tests only, to extract text from generated PDFs).
- `jest.config.js` with `preset: 'jest-expo'`. Add scripts `"test": "jest"` and
  `"typecheck": "tsc --noEmit"`.
- `src/test/mocks/`: an in-memory `expo-file-system` (`File`/`Directory`/`Paths`), plus
  `expo-asset` and `rn-mlkit-ocr` stubs.
- First tests are for existing pure code: `utils/fitBox`, `utils/sanitize`,
  `migrateLibraryIndex`, and the FTS query builder (moved out into a pure
  `buildFtsMatchQuery`).
- `.github/workflows/ci.yml`: `npm ci`, then `npm run typecheck`, then `npm test`, on push and
  PR. Also run `npx expo-doctor`, but don't let its failures fail the job.

**Done when:** CI is green on the branch and the test count is above 0.

### F2 · Store hygiene *(small)*
Status: done (commit 009cccb). Device checks: see Verification.

- `app.json`:
  - `ios.bundleIdentifier` and `android.package` set to `com.yeasin.pdfscan`.
  - Remove `RECORD_AUDIO` from `android.permissions`.
  - Add `android.blockedPermissions: ["android.permission.RECORD_AUDIO"]`.
  - `expo-camera` plugin options `recordAudioAndroid: false, barcodeScannerEnabled: false`.
  - `userInterfaceStyle: "automatic"`, after checking that `ThemeProvider` follows the system
    scheme.
  - `name: "PDF Scan"`.
  - Slug: keep `yeasin` for now, because EAS ties `projectId` to the slug. Renaming it needs
    the project renamed on expo.dev first, so it is noted as a manual step.
- `App.tsx`: remove the spike imports and flags; delete `src/dev/` (git history keeps it).
  Delete `sample.xlsx`.
- Hide unfinished features:
  - Remove `protect` from `SelectionBar.tsx` `TOOLS` and its handler in `LibraryScreen.tsx`.
  - Remove the "Password protect" row from `MoreOptionsPanel.tsx` and stop setting
    `locked: pw` in `DeliverScreen`.
  - Keep the existing `locked` badge and its disclosure for documents already marked.
  - Hide the Pro entry point (wherever `go('pro')` is triggered) behind a
    `FEATURES.pro = false` flag in a new `src/config/features.ts`.

**Done when:** the merged Android manifest from `npx expo prebuild --clean` has no
`RECORD_AUDIO`, and the app launches with no spike or Pro or Protect UI.

### F3 · Library storage moves to SQLite as the single source of truth *(critical)*
Status: done (commit 3a39203) (with F4). Device checks: see Verification.

- **Data-loss guard first** (a one-line fix that ships even before the rest):
  - In `useLibraryPersistence`, set `loaded` only on a *successful* load.
  - Make `loadLibraryIndex` throw instead of returning `[]` on a parse or read error.
  - On failure, show "Couldn't load library" and never persist.
- New schema with versioned migrations, using `PRAGMA user_version` and an ordered
  `MIGRATIONS` array in a new `services/persistence/migrations.ts`:
  - `documents`: every `LibraryDocument` field as a column (name, format, mode, pdf_path,
    content_path, size_bytes, created_at, updated_at, star, tag, locked, cover_kind,
    source_kind, course_id).
  - `pages`: id, document_id, idx, master_path, display_path, width, height, ocr_text,
    ocr_json.
  - `courses`: see F4.
  - Keep the FTS5 table and its triggers, now on `pages.ocr_text`.
- One-time import: if `library:index` exists in AsyncStorage and `user_version` is below N, read
  it in a single transaction (reusing `migrateLibraryIndex`), insert everything, then rename the
  key to `library:index:migrated-v1`. Delete that backup key a release later. Make the import
  idempotent (`INSERT OR IGNORE`).
- `services/persistence/libraryRepo.ts`: `loadAll()`, `upsertDocuments(docs)`,
  `deleteDocuments(ids)`, plus course CRUD.
- Replace the whole-blob write in `useLibraryPersistence` with a **diff sync**. Keep the
  previous `files` array in a ref and compare by id and object reference (the reducer is
  immutable, so changed documents are new objects). Then upsert the changed documents and delete
  the removed ones. The reducer and screens stay the same.
- `searchHaystack` is computed when loading and is no longer stored.
  `insertScannedDocument`'s separate write paths in Deliver, Reader and ExternalFileLinking
  become `libraryRepo` calls.
- Tests: migrations on an empty DB; importing a v1 and a v2 AsyncStorage blob; diff sync
  (star, rename, delete); a failed load never writes. Uses `expo-sqlite`'s Jest mock or a thin
  adapter over `better-sqlite3` in tests.

**Done when:** a seeded library of 500 documents with OCR loads in under 1 s on a mid-range
Android phone, toggling a star writes one row, and killing the app mid-save never loses earlier
documents.

### F4 · Folders + `courseFolder` become one **Course** model
Status: done (commit 3a39203) (with F3). Device checks: see Verification.

- `courses` table: id, name, code, color, semester (nullable), archived, created_at.
  `documents.course_id` is nullable (null means "Unsorted").
- Migration:
  - Each `LibraryFolder` becomes a course with the same id.
  - Each distinct `courseFolder` string becomes a course, reusing an existing folder course on
    a case-insensitive name match.
  - A document gets `folderId` if it has one, otherwise its course match.
- **Paths no longer depend on the course.** All files live in `library/<docId>/`. Files under
  `library/Courses/<seg>/<docId>/` are moved during migration (idempotent: skip if the
  destination exists), and the stored paths are updated. After this, moving a document to
  another course changes no files. `getDocumentDir(documentId)` loses its `courseFolder`
  parameter, which is updated at every call site (`libraryOperations`, `pdfService`,
  `LibraryScreen`, `ReaderScreen`, `DeliverScreen`, `deviceExportService`).
- Minimal UI only; the full course experience is §3:
  - Library tabs and `ManageFoldersScreen` labels say "Courses".
  - `DeliverScreen`'s free-text course field and folder picker are merged into one course
    picker (reuse `FolderPickerModal`).
  - Remove `deliver.courseFolder` from `deliverSlice`.
- Tests: migration merge rules, file moves, deleting a course moves its documents to Unsorted.

**Done when:** no code refers to `courseFolder` or `folderId` outside the migration, and every
pre-existing document still opens.

### F5 · Image pipeline: high-resolution master, edits that don't re-save, one encode per export
Status: done (commit 4345a55). Device checks: see Verification.

- `src/services/capture/imageSpec.ts` with these constants:
  - `MASTER_MAX_DIM = 2400`, `MASTER_JPEG_Q = 0.92`, `THUMB_MAX_DIM = 400`.
  - `EXPORT_PRESETS`, quality 1–5 mapped to `{maxDim, q}`: 1000/0.55, 1400/0.65,
    1800/0.75, 2200/0.85, 2400/0.92.
  - These replace every copy of the `0.2 + (quality - 1) * 0.2` formula (pdfService,
    imageExportService, libraryOperations, estimateSizeBytes).
- **Ingest** (one shared `ingestPage(uri)` used by both `scannerPipeline` and
  `CaptureScreen.addPagesFromAssets`, so gallery imports stop bypassing the downscale): create
  the master at 2400/0.92 and a 400 px thumbnail, and run OCR on the master.
- **Edits are stored as settings, not re-saved images:**
  - Rotation becomes `SessionPage.rotation`, a field that already exists but is unused. Review
    shows it with a `transform: rotate` style. Remove the `rotatePage` call that re-encodes on
    every tap.
  - Perspective crop still writes one new master (encoded once, at q 0.95).
  - Enhance and adjust settings already work this way.
- **Render once:** a new `renderPage(master, {rotation, enhance, adjust}, preset)` in
  `skiaEnhance.ts` does rotate, filter, downscale and a single JPEG encode in one Skia pass. It
  replaces `bakeEnhance` followed by `compressPage`. `embedPageImage` embeds the bytes it is given
  with no second encode.
- **OCR always matches the final pixels:** at save time, OCR runs on the rendered page, one page
  at a time with progress shown. Scan-time OCR is kept only for name suggestions. This fixes the
  stale-box bug after rotate or crop without any coordinate math.
- **The library keeps clean masters:**
  - `saveImagesToLibrary` stores the rendered page at master preset 5, whatever export
    quality was chosen. That quality affects only `document.pdf` and JPG exports.
  - Academic stamped images go to `display_path`; `master_path` stays clean.
  - `compressDocument` rebuilds only the PDF from the masters and never overwrites page images.
- `DeliverScreen`: replace the `Promise.all` bakes with a sequential loop.
- `compositeHalfPages`: scale the canvas from `MASTER_MAX_DIM` (about 1700×2400) instead of the
  hard-coded 1131×1600.
- `ThumbnailStrip` and the library grid use the thumbnails, so memory doesn't grow with 2400 px
  masters.
- Tests: preset table, the export path performs exactly one encode (mock spy), `ingestPage`
  downscales gallery images.

**Done when:** an A4 page with 8 pt text, exported at quality 5, can be read at 200 % zoom; one
rotate-and-enhance cycle encodes the JPEG once at export; library page files keep the same size
after Compress.

### F6 · OCR text layer for every script: a "glyphless font"
Status: done (commit f84a669, 97ee2a6). Device checks: see Verification.

Use the same technique as Tesseract's PDF output, instead of embedding one font per script
(CJK fonts are 10+ MB each).
- Ship one tiny TrueType font, about 1 KB, in which every code point maps to a single empty
  glyph of fixed width. Generate it with a committed script `scripts/make-glyphless-font.py`
  (fontTools) so there are no licensing questions. Output: `assets/fonts/glyphless.ttf`.
- New `src/services/pdf/textLayer.ts`:
  - Embed the font as a Type0 / CIDFontType2 with `Identity-H` encoding, `CIDToGIDMap`
    pointing every CID to the blank glyph, and a ToUnicode CMap. These are built as raw objects
    through pdf-lib's `PDFDict`/`PDFStream` low-level API.
  - Write each OCR line as raw content-stream operators: `BT /Fx size Tf 3 Tr` (invisible
    render mode, replacing `opacity: 0`), then `Tz` horizontal scaling so the run spans the
    line's box width (selection highlights then match the ink), then `<hex CIDs> Tj ET`.
  - CID equals the Unicode code point (BMP; characters outside the BMP are skipped and
    counted).
- This one font covers Latin with accents, CJK, Devanagari and Bengali later, with no extra
  code. The ToUnicode CMap stores the text in logical order, which is what search and copy need.
- Remove `embedDevanagariFont` and the `NotoSansDevanagari` asset (smaller app). Remove the
  silent `catch` drop path.
- Create `src/services/scripts/registry.ts` now: `{ id, label, ocrModel, status: 'ready' }` for
  the 5 ML Kit scripts. Settings `LanguageRow` reads from it. Bengali gets a commented entry
  with `status: 'planned'`, which leaves room without exposing it.
- Visible stamp text (header, footer, cover) stays Helvetica in §0. Characters outside WinAnsi
  are replaced with `?` through a `toWinAnsiSafe()` helper instead of failing silently. Proper
  visible fonts per script are §6.
- Tests (Jest, real pdf-lib, then pdfjs-dist `getTextContent`): build a PDF with OCR lines
  `"Café Œuvre"`, `"Łódź"`, `"数学作业"`, `"日本語"`, `"한국어"` and `"गणित"`, and assert each one
  is extracted exactly. Also assert that the drawn text box lies within ±2 pt of the image line
  box.

**Done when:** the test passes for all 6 strings, and on a device a CJK scan exported and opened
in Google Drive's PDF viewer is searchable.

### F7 · Small correctness fixes
Status: done (commit c1a1d66) (LIKE escaping landed in F3, ocrFailed in F5). Device checks: see Verification.

- `searchDocumentsByText`: escape `%`, `_` and `\` in the LIKE parameter and add `ESCAPE '\'`.
  Add a test.
- `runOcr` keeps returning `undefined` on failure, but the save path now records a per-page
  `ocrFailed` flag so the reader can offer "Retry OCR" later.
- Add an app-wide `ErrorBoundary` in `AppProviders` showing "Something went wrong. Your
  documents are safe." with a Restart button (`expo-updates` `reloadAsync` if available,
  otherwise remount).

### F8 · Opt-in crash reporting (Sentry)
Status: done (commit e502f9b). Device checks: see Verification.

- Install `@sentry/react-native` in the version whose Expo plugin supports SDK 57 (check its
  compatibility table when implementing; docs.expo.dev is blocked from this environment, so
  verify locally). Add the plugin in `app.json` with the org and project; the DSN comes from an
  EAS environment variable (`EXPO_PUBLIC_SENTRY_DSN`).
- `settingsSlice` gets `crashReportsEnabled: false` (default) and a Settings toggle with this
  text: "Send anonymous crash reports. Never includes your documents, names or scanned text."
- `src/services/telemetry/crash.ts`: `initCrashReporting(enabled)` calls `Sentry.init` only
  when enabled, with:
  - `sendDefaultPii: false`;
  - `beforeBreadcrumb` that drops `console` and `navigation` crumbs, because `console.warn`
    calls can include file names or OCR text;
  - `beforeSend` that strips `extra`, `contexts.app.device_name`, and any `file://` paths from
    messages.
  - Turning the toggle off calls `Sentry.close()`.
- Upload source maps through the EAS build hook, with `SENTRY_AUTH_TOKEN` as an EAS secret.
- Tests: `beforeSend` and `beforeBreadcrumb` scrubbers (pure functions); init is not called
  while the toggle is off.

**Done when:** a deliberate test crash with the toggle on shows up in Sentry with a readable
stack and no file paths, and with the toggle off no network request goes out (checked with a
proxy or the Android network inspector).

---

## Critical files
- Storage: `src/services/persistence/{libraryStore,dbService,libraryFiles,libraryOperations}.ts`,
  `src/store/useLibraryPersistence.ts`, new `migrations.ts` and `libraryRepo.ts`.
- Images: `src/services/capture/scannerPipeline.ts`,
  `src/services/enhance/{enhanceService,skiaEnhance,compositeHalfPages,perspectiveCrop}.ts`,
  `src/services/export/imageExportService.ts`, `src/screens/{CaptureScreen,ReviewScreen,DeliverScreen}.tsx`.
- PDF: `src/services/pdf/pdfService.ts`, new `textLayer.ts`, `assets/fonts/glyphless.ttf`.
- Config: `app.json`, `App.tsx`, `package.json`, `.github/workflows/ci.yml`, `jest.config.js`.
- Models: `src/types/models.ts` (`LibraryPage` gains `masterUri` / `displayUri` / `thumbUri`;
  `courseId` replaces `folderId` and `courseFolder`).

Existing code to reuse: `migrateLibraryIndex` (libraryStore), `fitBox`, `sanitize`,
`cleanTemporaryCache`, the Skia surface pattern in `bakeEnhance`, `FolderPickerModal`, the FTS
triggers in `dbService`.

## Verification (for the whole of §0)
1. `npm run typecheck && npm test` passes locally and in CI.
2. `npx expo prebuild --clean`, then check the merged `AndroidManifest.xml`: no `RECORD_AUDIO`,
   and the package is `com.yeasin.pdfscan`.
3. Manual test on a mid-range Android device (dev build, `npm run android`):
   - Install the **old** build, create about 20 documents spread over folders and course
     folders, install the new build, and confirm every document, folder and course migrated and
     opens.
   - Scan 10 handwritten pages, rotate 2, crop 1, export at quality 5 and at quality 2. Compare
     sharpness and size, and check that the library pages are unchanged after Compress.
   - Export a CJK and an accented-Latin scan, open them in Google Drive's PDF viewer, and
     confirm search and copy work.
   - Seed 500 documents with a dev script and measure cold start and library load time.
   - Turn crash reports on, trigger the test crash and check Sentry; turn them off and confirm
     there is no network traffic.
4. Update the README "Known gaps" section (Protect is removed; CJK is now searchable).

## Out of scope for §0 (belongs to later sections)
Exact size target (§4), new filters (§2), the full Course experience with semesters and colours
(§3), Bengali OCR engine (§6), real PDF encryption (§7).
