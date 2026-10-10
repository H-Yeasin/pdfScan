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
  done in code; §7 R5 is too (SheetJS 0.20.3 from `cdn.sheetjs.com`); §8 B1–B5 are done in code (B6, Google Drive, waits for Pro). §9 O1 and O5's code (selector store, deferred boot) are done; O5's device measurements are open (`docs/qa/performance.md`); §9 O2–O4 and O6's code are done; §9's device work is open (`docs/qa/walkthrough.md`, `docs/qa/performance.md`). §10 M1–M8 are done in code (Play Console checklist, Firebase and AdMob setup open: `docs/policy/play-console.md`, `docs/firebase.md`, `docs/ads.md`; M4–M8 device checks open; M9–M11 parked). **Next:** §14 pre-launch fixes are done in code (`docs/plan/14-prelaunch-fixes.md`: Q1, the ad gate failing closed, Q2, release ad config + diagnostics, Q3, bottom insets on screens (`shared/BottomBar`), and Q4, modals/snackbar/keyboard edge-to-edge (`shared/bottomBarHeight`, guard test `screens/__tests__/safeArea.test.ts`), and Q5, bulk delete + Select all (`library/confirmDelete`, `SelectAllButton`, `libraryUi/SELECT_ALL`), and Q6, the add-cover service (`persistence/addCover.ts`, `canAddCover`), and Q7, its UI (`library/useCoverTarget.ts`, `deliver.coverTarget`, Academic options' target mode), are done in code (the owner's AdMob checklist in `docs/ads.md` and §14's device checks are open; they block the release), then §15 brand refresh, which comes before §11 (`docs/plan/15-brand-refresh.md`, V1–V5: new logo, icons, animated splash, logo-green accent; V2 needs a new dev build; V1 is done in code: the logo sources in `assets/brand/`, `theme/brand.ts` `BRAND`, `components/brand/markGeometry.ts`, guard test `theme/__tests__/brandSync.test.ts`; V2 is done in code: `scripts/make-icons.mjs` makes every icon and splash image from the SVGs, `assets/notification-icon.png`, splash/tile constants in `theme/brand.ts`, its prebuild + dev build + device checks are open; V3 is done in code: the default accent (id `teal`, shown as "Forest") is the logo's greens; V4 is done in code: `components/brand/BrandMark.tsx` (`BrandTile` + `BrandMark`, Onboarding and Settings → About); V5 is done in code: the splash intro, `bootstrap/splashIntro.ts` + `components/brand/{IntroMark,SplashIntro}.tsx`, it releases the native splash itself; all of §15 is done in code, its device checks are open), then **§16–§18, planned 2026-10-09 and before §11** (`docs/plan/16-speed.md` G1–G9: speed; G1, the privacy hotfix, is done in code: `crash.ts` is the only Sentry start, guard test `services/telemetry/__tests__/sentryInit.test.ts`, the owner rotates the DSN; G2, router v2, is done in code: `navigation/{navStack,ScreenStack,screenRole}`, its device checks are open; G3, the boot diet, is done in code: `navigation/lazyScreens`, `submit/sizeFormat`, `enhance/filters/filterIds`, guard test `src/__tests__/bootImports.test.ts`, its device check is open; G4, the boot waterfall, is done in code: fonts embedded on Android (`app.json`, needs a new dev build), `warmDb()` / `warmSettings()` from `App.tsx`, the library load without word boxes (`documents/pageOcr.ts`), schema v17, its device checks are open; G5, re-render hygiene, is done in code: the `libraryUi` slice (`store/slices/libraryUiSlice.ts`, actions `libraryUi/…`, selection as a Set), `bootstrap/BootEffects.tsx`, `utils/useDayClock.ts`, dev render counts (`utils/renderCounts.ts`), its device check is open; `docs/plan/17-design-flow.md` U1–U14: the design system and the Home · Files · [Scan] · Tools · Me shell; `docs/plan/18-reader.md` W1–W23: the one-page-surface reader that replaces react-native-pdf-jsi; W1, sign on the right page, is done in code: `services/signature/signaturePlacement.ts` (`signatureDraw`, `signTargets`), its device check is open; W2, Find and chrome hygiene, is done in code: `services/reader/findRunner.ts`, `useReaderFind` `close()`/`toggle`, its device check is open; W3, safe writes, is done in code: `services/files/atomicWrite.ts` (replace a file through it, never `delete()` then `write()`), `storage/integrity.recoverInterruptedWrites`, `pdfService.ensureDocumentPdfOnce`, its device check is open; W4, non-PDF quick fixes, is done in code: `SheetView` `sheetRowHeight`, `txtService.readTextPrefix`, DOCX `padTop` + `DOCX_TAP_SCRIPT`, its device check is open; W5, position robustness, is done in code: `services/documents/readerPosition.ts` (`openingPage`, `heldSubject`, `pdfPageAfterEdit`, `pageLabel`), `useReaderDocument` `reload(to?)` (only the active Reader follows the store and saves `lastPage`), its device check is open; W6, the ReaderScreen split, is done in code: `services/reader/readerSheets.ts` (what is open over the page: one `sheet`, one `tool`), `ReaderScreen` keys `components/reader/ReaderDocumentView` on the file (no reset effects: per-file state just lives under the key), `useReaderSheets`, `useReaderOverflowActions` (a handler per `ReaderMoreItemId`), `useReaderSigning`, `ReaderSheets`, `ReaderLoadProblem`, its device check is open; W7, pdf-native version 2, is done in code: `services/pdf/pdfSession.ts` (`acquirePdfSession`: a shared open pdfium document; use it, not the raw session calls in `pdfNative.ts`), `hasPdfSessions()`, `PdfWrongPasswordError`, Android `PdfSessions.kt` / `PageRenderer.kt` / `ImageDecoding.kt`, iOS `PdfSessions.swift` (never built), `src/dev/ReaderLabScreen.tsx`, its dev build is made and its device check passed on Android (iOS never built); W8, surface geometry, is done in code: `services/reader/{surfaceGeometry,pageSpace,surfacePages,fastScroll}.ts` (`annotations/markMode.ts` re-exports the column functions from `surfaceGeometry`; the bars' insets go through `scrollRange`, never into the layout; `surfacePages` loads `pdfService`, keep it off the boot path), JS only; W9, render queue, page cache, dark matrix, is done in code: `services/reader/{renderPlan,renderQueue,pageCache,darkMatrix}.ts` (`planRenders` → `RenderSpec[]`, `createRenderQueue`, `openPageCache` / `prunePageCache`, `nightMatrix`), `utils/hash.ts`, `components/reader/surface/useRenderQueue.ts` (`renderToCache`, `usePageImages`), JS only; W10, the read-only surface behind a flag, is done in code: `components/reader/surface/PageSurface.tsx` (+ `SurfacePageView`, `useSurfaceView`, `useSurfaceGestures`, `usePdfSession`, `FastScroller`, `PagePill`), `services/reader/{chromeState,readerEngine,readerHold}.ts`, `remoteConfig` `readerSurface` (`reader_surface`, off; a dev switch in Settings → Developer), `useReaderChrome(keepAwake, locked)` (Reanimated `progress`, measured `bars`), `ReaderDocumentView` `goToIdx` (the surface counts library pages from 0, the rest of the Reader PDF pages from 1), it passed a first run on the emulator and the owner's check on a real phone (never give the view that carries a gesture an opacity of 0 on Android: the window goes blank; fade a child instead); W11, links, contents, landscape, accessibility, is done and checked on a phone: `services/reader/{links,outline}.ts` (`linkAt`, `safeLinkUrl`: a link out of the app is only ever offered, for http/https/mailto/tel; `flattenOutline`, `currentSection`), `components/reader/{OutlineList,PageTextSheet,useReaderOrientation}` (landscape only while the surface is the active viewer with no tool open; leave the Reader through its `back`, which locks portrait first), `PageScrubberSheet` "Pages | Contents", sheet kind `'pageText'`, JS only; the order across the three is in `docs/plan/README.md`), then plan §11 (`docs/plan/11-launch.md`),
  device checks (each plan file's Verification), E7's benchmark run, and
  §6 device checks (`docs/plan/06-languages.md`; L1–L4 are done, L3 without its device spike; L5–L6 wait for Bangla); §5 T7 (flashcards) is for later (P4).
  **§12 (reader + convert + light edit) is done in code** (`docs/plan/12-convert-edit.md`, D1–D11, revised 2026-10-03); D1 (the
  Pro task gate, `services/pro/proTask*.ts`, `components/pro/useProTask.tsx`) and D2 (study-first
  reader: `components/reader/useReader*.ts`, `ReaderToolBar`, `services/documents/readerTools.ts`,
  reading settings in `settings.reading`) and D3 (Mark mode: `components/reader/MarkView.tsx`,
  `services/annotations/{markMode,marks}.ts`, imported PDFs too) and D4 (notes panel:
  `components/reader/NotesSheet.tsx`, `services/annotations/notesPanel.ts`) and D5 (Office → PDF:
  `services/convert/{toPdf,convertTask}.ts`, `components/reader/useConvertToPdf.tsx`) and D6 (scan/PDF → Word:
  `services/convert/{toDocx,docxWriter}.ts`, `components/reader/useConvertToWord.tsx`) and D7 (edit TXT/CSV:
  `services/edit/textEdit.ts`, `components/reader/{FileEditor,CsvGrid,useEditFile}.tsx`) and D8 (edit XLSX/XLS cells, saved
  as a copy: `services/edit/sheetEdit.ts`, FileEditor's sheet mode) and D9 (edit Word text, saved as a copy:
  `services/edit/{docxEdit,htmlToDocx}.ts`, `components/reader/DocxEditor.tsx`) and D10 (fill PDF forms, saved as a
  copy: `services/edit/pdfForm.ts`, `components/reader/{FormFillSheet,useFillForm}.tsx`; Mark mode's Pro Text tool,
  `'text'` annotations as /FreeText; any-script appearances: `services/pdf/textAppearance.ts`) and D11 (Find in DOCX via
  `services/documents/docxFind.ts`, XLSX/XLS Find, sheet pinch zoom and frozen first row/column in `SheetView`) are done
  in code; §12's device checks are open. Conversions and file editing are Pro (one rewarded ad per task); marking, OCR, copy/extract text stay free.
  **§10 was revised (2026-10-02):** light ads + a rewarded "Pro pass" (1 hour per ad since 2026-10-04, `docs/plan/13-pro-pass-one-hour.md`) + Firebase Remote Config,
  no login; paid Pro is parked (no Play payouts in Bangladesh). Never add text that sends users to
  pay outside Google Play (Play Payments policy); WhatsApp 01645724080 is a support contact only.

## Commands
- `npm install` (runs `patch-package`), `npm run android` / `npm run ios` (dev build),
  `npm start`. Clean builds, release builds, APK/AAB, signing, env vars: `docs/build.md`.
- Typecheck: `npm run typecheck`. Tests: `npm test` (Jest, `jest-expo` preset, node env; mocks for
  expo-file-system/expo-sqlite/expo-asset/expo-notifications/expo-clipboard/rn-mlkit-ocr in `src/test/mocks`). CI runs both.

## Layout
```
App.tsx                 AppProviders > AppNavigator + Snackbar
src/bootstrap/          AppProviders (theme, ErrorBoundary, store), AppNavigator (start screen, Back, the layers; reads single fields only), BootEffects (renders null; hosts the persistence/indexing/reminder hooks)
src/navigation/         router.tsx: custom state router, useRouter().go(screen)/back() — NOT React Navigation; navStack.ts = a back stack per tab (pure); ScreenStack.tsx keeps screens mounted (hidden) — use useScreenRole() for on-screen-only work; lazyScreens.ts loads a screen's module on its first render
src/screens/            Home (start screen once a course exists), Course, Capture, Review, Deliver, Library, Reader, Settings, Pro (Pro pass, 1 hour, §10 M6), ManageFolders (= courses), AcademicOptions
src/components/<area>/  UI split by screen area (capture, review, deliver, library, reader, settings, shared)
src/store/              AppStateContext (useAppSlices('library',…) / useAppSelector, useAppDispatch; useAppState is legacy and re-renders on everything), appReducer, slices/*, use*Persistence hooks
src/services/           all logic, no UI (see pipeline below)
src/theme/              tokens, useTheme(), spacing/radii, fontFamily/typeScale — never hard-code colors
src/i18n/               en.ts catalog, t()/useT() (from i18n/useT), tDoc() for document text, formatDate/formatNumber; settings.uiLanguage/documentLanguage
src/types/models.ts     SessionPage, LibraryDocument, LibraryPage, Course, Semester, DocType, PageOcr, OcrScript, DocFormat
src/services/pro/       Pro registry (PRO_FEATURES, FREE_FOREVER, lapse rules), entitlement (useIsPro, useProFeature; §10 M3), dayPass (daily cap, M6)
src/services/ads/       adPolicy (banner rules), adsSdk (consent + init), rewarded (Pro pass, 1 hour) - §10 M5/M6
src/config/             appInfo (APP_VERSION); runtime switches come from services/remote/remoteConfig (Firebase Remote Config, §10 M2)
src/utils/              fitBox (aspect-fit), sanitize, id (createId), format, docFormat
modules/pdf-native/     local Expo module (§7 R1): PDF page count/size, render page → JPEG, page text + word boxes; version 2 (§18 W7): pdfium sessions (open once; page/region → JPEG, links, outline, password), decodeImage
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
5. **Reader**: `ReaderScreen` → `components/reader/ReaderDocumentView` renders `document.pdf` with `react-native-pdf-jsi` (or, with `reader_surface` on, PDFs and scans on `components/reader/surface/PageSurface`, §18 W10); DOCX, XLSX,
   CSV and TXT use their own views. `documents/formatCapabilities.ts` decides which actions
   each format allows. External "Open with": `store/useExternalFileLinking` and
   `files/externalFileService`.

## Persistence
- Library: SQLite `pdfscan.db` is the single source of truth (`persistence/dbService.getDb`,
  `migrations.ts` with `PRAGMA user_version`, `libraryRepo.ts`). `store/useLibraryPersistence`
  loads once, then diff-syncs changed documents/courses; it never writes after a failed load.
  Screens just dispatch - they never write to the DB. Paths are stored relative to the
  document dir. FTS5 search: `searchDocumentsByText`.
- Word boxes load on demand (§16 G4). `loadAll` reads each page's text but not `pages.ocr_json`:
  a page with stored boxes has `ocr: { text, blocks: [], blocksRow }`. Code that reads
  `ocr.blocks` of a library page must first `await withPageBlocks(pages)`
  (`services/documents/pageOcr.ts`); the PDF builders (`buildPdfFromPages`, `buildRasterPdf`),
  Convert to Word and the Reader (`usePageOcr` → `library/SET_PAGE_OCR`) already do. Saving a page
  whose boxes were never loaded keeps the stored ones (`libraryRepo`). `ocr.text` is always there.
- The old AsyncStorage `library:index` blob is imported once by `legacyLibrary.ts`; the `meta`
  table (`persistence/meta.ts`) records that it's over, so a launch doesn't read AsyncStorage for it.
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
- Keep the boot path light (§16 G3): nothing imported by `App.tsx`, the store, the boot hooks or a
  start screen (Home, Capture, Onboarding) may statically import pdf-lib, xlsx, mammoth, the WebView,
  react-native-pdf-jsi or `enhance/filters/registry.ts`. Load those inside the function that needs
  them (`require(...) as typeof import(...)`), and use `import type` for types.
  `src/__tests__/bootImports.test.ts` fails with the import chain otherwise. Screens load through
  `navigation/lazyScreens` in `AppNavigator`, never a top-level import.
- State changes go through `dispatch` with slice actions (`'library/ADD_FILE'` and so on); no
  Redux. `library` is only what is saved; what a screen shows of it (search, selection, tab, the open
  course, indexing progress) is `libraryUi` (§16 G5). A reducer returns the same state when nothing
  changes. A hook that reads a whole slice belongs in `BootEffects`, not AppNavigator.
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
