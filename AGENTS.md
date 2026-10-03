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
- **Progress:** `docs/plan/README.md` lists every step's status and commit and what comes next.
  Read it before starting. §0, §1, §2 (except E7's benchmark run), §3, §4, §5 T1–T6 and §7 R1–R4 are
  done in code; §7 R5 is too, except the SheetJS 0.20.3 swap (needs `cdn.sheetjs.com`); §8 B1–B5 are done in code (B6, Google Drive, waits for Pro). §9 O1 and O5's code (selector store, deferred boot) are done; O5's device measurements are open (`docs/qa/performance.md`); §9 O2–O4 and O6's code are done; §9's device work is open (`docs/qa/walkthrough.md`, `docs/qa/performance.md`). §10 M1–M8 are done in code (Play Console checklist, Firebase and AdMob setup open: `docs/policy/play-console.md`, `docs/firebase.md`, `docs/ads.md`; M4–M8 device checks open; M9–M11 parked). **Next:** plan §11 (`docs/plan/11-launch.md`),
  that swap, device checks (each plan file's Verification), E7's benchmark run, and
  §6 device checks (`docs/plan/06-languages.md`; L1–L4 are done, L3 without its device spike; L5–L6 wait for Bangla); §5 T7 (flashcards) is for later (P4).
  **§12 (reader + convert + light edit) is planned** (`docs/plan/12-convert-edit.md`, D1–D11, revised 2026-10-03); D1 (the
  Pro task gate, `services/pro/proTask*.ts`, `components/pro/useProTask.tsx`) and D2 (study-first
  reader: `components/reader/useReader*.ts`, `ReaderToolBar`, `services/documents/readerTools.ts`,
  reading settings in `settings.reading`) and D3 (Mark mode: `components/reader/MarkView.tsx`,
  `services/annotations/{markMode,marks}.ts`, imported PDFs too) and D4 (notes panel:
  `components/reader/NotesSheet.tsx`, `services/annotations/notesPanel.ts`) and D5 (Office → PDF:
  `services/convert/{toPdf,convertTask}.ts`, `components/reader/useConvertToPdf.tsx`) are done in code; next: D6. Conversions and file editing are Pro (one rewarded ad per task); marking, OCR, copy/extract text stay free.
  **§10 was revised (2026-10-02):** light ads + a rewarded "Pro day pass" + Firebase Remote Config,
  no login; paid Pro is parked (no Play payouts in Bangladesh). Never add text that sends users to
  pay outside Google Play (Play Payments policy); WhatsApp 01645724080 is a support contact only.

## Commands
- `npm install` (runs `patch-package`), `npm run android` / `npm run ios` (dev build),
  `npm start`.
- Typecheck: `npm run typecheck`. Tests: `npm test` (Jest, `jest-expo` preset, node env; mocks for
  expo-file-system/expo-sqlite/expo-asset/expo-notifications/expo-clipboard/rn-mlkit-ocr in `src/test/mocks`). CI runs both.

## Layout
```
App.tsx                 AppProviders > AppNavigator + Snackbar
src/bootstrap/          AppProviders (theme, ErrorBoundary, store), AppNavigator (screen switch, boot hooks)
src/navigation/         router.tsx: custom state router, useRouter().go(screen) — NOT React Navigation; `hub`/`tabHub` = where Back returns
src/screens/            Home (start screen once a course exists), Course, Capture, Review, Deliver, Library, Reader, Settings, Pro (day pass, §10 M6), ManageFolders (= courses), AcademicOptions
src/components/<area>/  UI split by screen area (capture, review, deliver, library, reader, settings, shared)
src/store/              AppStateContext (useAppSlices('library',…) / useAppSelector, useAppDispatch; useAppState is legacy and re-renders on everything), appReducer, slices/*, use*Persistence hooks
src/services/           all logic, no UI (see pipeline below)
src/theme/              tokens, useTheme(), spacing/radii, fontFamily/typeScale — never hard-code colors
src/i18n/               en.ts catalog, t()/useT() (from i18n/useT), tDoc() for document text, formatDate/formatNumber; settings.uiLanguage/documentLanguage
src/types/models.ts     SessionPage, LibraryDocument, LibraryPage, Course, Semester, DocType, PageOcr, OcrScript, DocFormat
src/services/pro/       Pro registry (PRO_FEATURES, FREE_FOREVER, lapse rules), entitlement (useIsPro, useProFeature; §10 M3), dayPass (daily cap, M6)
src/services/ads/       adPolicy (banner rules), adsSdk (consent + init), rewarded (day pass) - §10 M5/M6
src/config/             appInfo (APP_VERSION); runtime switches come from services/remote/remoteConfig (Firebase Remote Config, §10 M2)
src/utils/              fitBox (aspect-fit), sanitize, id (createId), format, docFormat
modules/pdf-native/     local Expo module (§7 R1): PDF page count/size, render page → JPEG, page text + word boxes
plugins/                local config plugins (withBackupRules: Android Auto Backup rules, §8 B1; withDocumentIntentFilters: strips the dev-client scheme from "Open with" filters)
```

## Main pipeline
1. **Capture**: `services/capture/scannerPipeline.ts` `runNativeScannerPipeline` uses the Google
   ML Kit doc scanner (`react-native-document-scanner-plugin`), then `capture/ingest.ingestPage`
   per page (master 2400 px q0.92, 400 px thumbnail, OCR), then `capture/BULK_ADD_PAGES`.
   Per-page work runs through `capture/ingestBatch.ts` (progress, cancel, mode post-processing:
   Book split, ID card compose). Gallery import (`ingestGalleryBatch`) and the no-Play-services
   camera fallback (`capture/scannerFallback.ts`) also auto-crop with `capture/quadDetector.ts`.
   Capture modes: `capture/captureModes.ts`. All sizes and qualities live in `capture/imageSpec.ts`.
2. **Review**: `ReviewScreen`. Rotation is a setting (`capture/ROTATE_PAGE`), never re-encoded;
   crop is `enhance/perspectiveCrop.warpPerspectiveCrop`; half-page merge is
   `compositeHalfPages`. Filter (`enhance`, `filterOptions`), `adjust` and rotation are stored
   per page; filter stats are measured at ingest. All filters live in `enhance/filters/`
   (`registry.ts`, applied only by `drawFiltered`). The live preview is `useFilteredPicture`
   (an SkPicture, no temp files); export is `skiaEnhance.renderPage`. Both rotate through
   `drawRotated`. Undo/redo: `store/pageHistory.ts`.
3. **Deliver**: `DeliverScreen.handleSaveInternal`, one page at a time: `renderPage` once at
   master spec (library) and once at the export preset if different, OCR on the final master,
   optional academic display copies (`pdf/academicRasterService`), then
   `pdf/pdfService.buildPdfFromPages(..., 'as-is' | preset)` (standard or 2-up, academic
   stamping, invisible OCR text via `pdf/textLayer.ts` glyphless font; visible cover/header/footer
   text in any script via `pdf/visibleText.ts`), then
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
  Since K1: `Semester` (archiving one archives its courses), `Course.sortOrder`, `Course.color`
  as a palette id (`services/courses/palette.ts` → `tokens.courseColors`), `doc.docType`.

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
- UI text comes from `src/i18n/en.ts` through `useT()` / `t()` (§6 L4); text that goes into
  documents uses `tDoc()` and `document.*`. `src/i18n/__tests__/hardcodedStrings.test.ts` fails on
  any UI literal in a `.tsx` outside `src/dev`.

## Patched dependencies
`patches/` is applied by `patch-package` on every `npm install`. When upgrading a patched
package, check whether the patch still applies (and is still needed) and regenerate it with
`npx patch-package <pkg>`.
- `react-native-document-scanner-plugin@2.0.4`: adds `galleryImportAllowed` and `scannerMode`
  to the scan options (TS spec in `src/`, its compiled `lib/typescript` types, and the Android
  `DocumentScannerModule.kt`). iOS (VisionKit) ignores them.
- `react-native-google-mobile-ads@17.2.0`: fixes a typo in `android/app-json.gradle`
  (`ext.googleAdsJson` → `ext.googleMobileAdsJson`). Without it, an `app.json` with no top-level
  `react-native-google-mobile-ads` key (ours: config goes through the Expo plugin) breaks the
  Gradle build with "Cannot get property 'googleMobileAdsJson'".

## Security
- `metro.config.js` once carried a hidden malicious payload (removed in 24f5ccf). Any change to
  config files (`metro.config.js`, `babel.config.js`, `app.json`, `package.json` scripts) must
  be reviewed for long lines / trailing whitespace hiding code.
- Telemetry is opt-in only (`services/telemetry/crash.ts`); never send document content.
