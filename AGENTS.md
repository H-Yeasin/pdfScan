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
- Current phase: **§0 Foundation** (`docs/plan/00-foundation.md`).

## Commands
- `npm install` (runs `patch-package`), `npm run android` / `npm run ios` (dev build),
  `npm start`.
- Typecheck: `npx tsc --noEmit`. Tests: none yet (they arrive in F1 with `jest-expo`).

## Layout
```
App.tsx                 AppProviders > AppNavigator + Snackbar (spike flags to be removed in F2)
src/bootstrap/          AppProviders (theme + store), AppNavigator (screen switch, boot hooks, DB init)
src/navigation/         router.tsx: custom state router, useRouter().go(screen) — NOT React Navigation
src/screens/            Capture, Review, Deliver, Library, Reader, Settings, Pro, ManageFolders, AcademicOptions
src/components/<area>/  UI split by screen area (capture, review, deliver, library, reader, settings, shared)
src/store/              AppStateContext (useAppState → {state, dispatch}), appReducer, slices/*, use*Persistence hooks
src/services/           all logic, no UI (see pipeline below)
src/theme/              tokens, useTheme(), spacing/radii, fontFamily/typeScale — never hard-code colors
src/types/models.ts     SessionPage, LibraryDocument, LibraryPage, PageOcr, OcrScript, DocFormat
src/utils/              fitBox (aspect-fit), sanitize, id (createId), format, docFormat
```

## Main pipeline
1. **Capture**: `services/capture/scannerPipeline.ts` `runNativeScannerPipeline` uses the Google
   ML Kit doc scanner (`react-native-document-scanner-plugin`), then `downscaleAndCompressPage`
   (1200 px, q 0.8), then `ocr/ocrService.runOcr` (ML Kit, per script), then
   `capture/BULK_ADD_PAGES`. Gallery import is `CaptureScreen.addPagesFromAssets` (no downscale
   or OCR).
2. **Review**: `ReviewScreen`. Rotate is `enhanceService.rotatePage` (re-encodes the image);
   crop is `enhance/perspectiveCrop.warpPerspectiveCrop`; half-page merge is
   `compositeHalfPages`. Filter and adjust are stored per page (`enhance`, `adjust`) and
   previewed live.
3. **Deliver**: `DeliverScreen.handleSaveInternal`: `skiaEnhance.bakeEnhance` per page, then
   optional academic rasters (`pdf/academicRasterService`), then
   `export/imageExportService.saveImagesToLibrary`, then `pdf/pdfService.buildPdfFromPages`
   (the single PDF builder: standard or 2-up layout, academic stamping, invisible OCR text
   layer), then the `library/ADD_FILE` action, then optional `export/deviceExportService`
   (Android SAF).
4. **Library ops**: `persistence/libraryOperations.ts` (merge, split, compress, sign,
   `promoteExternalToLibrary`). Files go in `library/[Courses/<seg>/]<docId>/` through
   `libraryFiles.getDocumentDir`.
5. **Reader**: `ReaderScreen` renders `document.pdf` with `react-native-pdf-jsi`; DOCX, XLSX,
   CSV and TXT use their own views. `documents/formatCapabilities.ts` decides which actions
   each format allows. External "Open with": `store/useExternalFileLinking` and
   `files/externalFileService`.

## Persistence (current state — F3/F4 will change this)
- Library: **one JSON blob** in AsyncStorage `library:index`
  (`persistence/libraryStore.ts`), rewritten on every change by
  `store/useLibraryPersistence.ts`. ⚠ If loading fails it returns `[]` and the next write
  wipes the library (fixed in F3).
- SQLite `pdfscan.db` (`persistence/dbService.ts`): a secondary copy used only for FTS5
  search (`searchDocumentsByText`). FTS tokens are escaped; LIKE wildcards are not.
- Settings: AsyncStorage `app:settings` (`persistence/settingsStorage.ts`).
- Two overlapping groupings: `folderId` (logical folders) and `courseFolder` (free text,
  physical path). They merge into one Course model in F4.

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

## Known issues (tracked in docs/plan/00-foundation.md)
- Every edit and export re-encodes the JPEG again; library pages are saved at the export
  quality (F5).
- OCR boxes aren't updated after rotate or crop (F5).
- The OCR text layer drops CJK and non-WinAnsi Latin lines (F6).
- "Protect" doesn't encrypt; Pro is a placeholder (hidden in F2).
