# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
If docs.expo.dev is blocked (cloud sessions), read the package source instead:
`npm pack <pkg>@<version> && tar xzf <pkg>-<version>.tgz` (e.g. config plugin options live in
`package/plugin/build/*.js`).

# Project map (read this instead of exploring the repo)

**PDF Scan**: an offline, privacy-first document scanner for students. Expo SDK 57,
React Native 0.86 (New Architecture), React 19, TypeScript strict. Android first.
It needs a dev build (native modules), so it does not run in Expo Go.

## Where the work is
- `docs/PLAN.md`: the product plan (sections §0–§11, phases).
- `docs/plan/NN-*.md`: step-by-step plans per section. **Implement one step per session. Read
  only that step**, open only the files it names, then update its `Status:` line and tick it
  in `docs/PLAN.md`.
- Current phase: **§1 Capture** (`docs/plan/01-capture.md`). §0 is done in code; its device checks are listed in `docs/plan/00-foundation.md` → Verification.

## Commands
- `npm install` (runs `patch-package`), `npm run android` / `npm run ios` (dev build),
  `npm start`.
- Typecheck: `npm run typecheck`. Tests: `npm test` (Jest, `jest-expo` preset, node env; mocks for
  expo-file-system/expo-sqlite/expo-asset/rn-mlkit-ocr in `src/test/mocks`). CI runs both.

## Layout
```
App.tsx                 AppProviders > AppNavigator + Snackbar
src/bootstrap/          AppProviders (theme, ErrorBoundary, store), AppNavigator (screen switch, boot hooks)
src/navigation/         router.tsx: custom state router, useRouter().go(screen) — NOT React Navigation
src/screens/            Capture, Review, Deliver, Library, Reader, Settings, Pro (hidden), ManageFolders (= courses), AcademicOptions
src/components/<area>/  UI split by screen area (capture, review, deliver, library, reader, settings, shared)
src/store/              AppStateContext (useAppState → {state, dispatch}), appReducer, slices/*, use*Persistence hooks
src/services/           all logic, no UI (see pipeline below)
src/theme/              tokens, useTheme(), spacing/radii, fontFamily/typeScale — never hard-code colors
src/types/models.ts     SessionPage, LibraryDocument, LibraryPage, Course, PageOcr, OcrScript, DocFormat
src/config/features.ts  FEATURES flags (pro: false)
src/utils/              fitBox (aspect-fit), sanitize, id (createId), format, docFormat
```

## Main pipeline
1. **Capture**: `services/capture/scannerPipeline.ts` `runNativeScannerPipeline` uses the Google
   ML Kit doc scanner (`react-native-document-scanner-plugin`), then `capture/ingest.ingestPage`
   per page (master 2400 px q0.92, 400 px thumbnail, OCR), then `capture/BULK_ADD_PAGES`.
   Gallery import (`CaptureScreen.addPagesFromAssets`) uses the same `ingestPage`. All sizes and
   qualities live in `capture/imageSpec.ts`.
2. **Review**: `ReviewScreen`. Rotation is a setting (`capture/ROTATE_PAGE`), never re-encoded;
   crop is `enhance/perspectiveCrop.warpPerspectiveCrop`; half-page merge is
   `compositeHalfPages`. Filter/adjust/rotation are stored per page and previewed with
   `useEnhancedPreview` → `skiaEnhance.renderPage`.
3. **Deliver**: `DeliverScreen.handleSaveInternal`, one page at a time: `renderPage` once at
   master spec (library) and once at the export preset if different, OCR on the final master,
   optional academic display copies (`pdf/academicRasterService`), then
   `pdf/pdfService.buildPdfFromPages(..., 'as-is' | preset)` (standard or 2-up, academic
   stamping, invisible OCR text via `pdf/textLayer.ts` glyphless font), then
   `export/imageExportService.saveImagesToLibrary` (page_N / display_N / thumb_N), then
   `library/ADD_FILE`, then optional `export/deviceExportService` (Android SAF).
4. **Library ops**: `persistence/libraryOperations.ts` (merge, split, compress = PDF-only
   rebuild, sign, `promoteExternalToLibrary`). Files always go in `library/<docId>/`
   (`libraryFiles.getDocumentDir`).
5. **Reader**: `ReaderScreen` renders `document.pdf` with `react-native-pdf-jsi`; DOCX, XLSX,
   CSV and TXT use their own views. `documents/formatCapabilities.ts` decides which actions
   each format allows. External "Open with": `store/useExternalFileLinking` and
   `files/externalFileService`.

## Persistence
- Library: SQLite `pdfscan.db` is the single source of truth (`persistence/dbService.getDb`,
  `migrations.ts` with `PRAGMA user_version`, `libraryRepo.ts`). `store/useLibraryPersistence`
  loads once, then diff-syncs changed documents/courses; it never writes after a failed load.
  Screens just dispatch - they never write to the DB. Paths are stored relative to the
  document dir. FTS5 search: `searchDocumentsByText`.
- The old AsyncStorage `library:index` blob is imported once by `legacyLibrary.ts`.
- Settings: AsyncStorage `app:settings` (`persistence/settingsStorage.ts`,
  `store/useSettingsPersistence.ts`).
- Courses (`Course`, `doc.courseId`; undefined = Unsorted) replaced folders + courseFolder.

## Conventions
- Process pages **one at a time** (memory on mid-range Android); avoid `Promise.all` over
  pages.
- Never mutate a source image: every operation writes a new file. Clean up temporary files
  with `cleanTemporaryCache`.
- OCR is best-effort: failures give `undefined` or empty and never block saving.
- State changes go through `dispatch` with slice actions (`'library/ADD_FILE'` and so on); no
  Redux.
- Comments explain *why* (often long); match that density and the existing names.
- Colors, spacing and type always come from `src/theme`.

## Security
- `metro.config.js` once carried a hidden malicious payload (removed in 24f5ccf). Any change to
  config files (`metro.config.js`, `babel.config.js`, `app.json`, `package.json` scripts) must
  be reviewed for long lines / trailing whitespace hiding code.
- Telemetry is opt-in only (`services/telemetry/crash.ts`); never send document content.
