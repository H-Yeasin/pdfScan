# Step plans: progress

Read this first to see what is done and what comes next. Each `NN-*.md` file has the detail for
its own steps. A step's `Status:` line and its "As built" notes describe the code as it is now.
The "Context" and "What the code looks like today" sections at the top of each file describe the
code **when the section was planned**, and are kept as history.

## Where things stand (2026-10-02)

| Section | File | Steps | State |
|---|---|---|---|
| §0 Foundation | [00-foundation.md](00-foundation.md) | F1–F8 | All done in code. Device checks open (see its Verification). |
| §1 Capture | [01-capture.md](01-capture.md) | C1–C7 | All done in code. Device checks open. C5 used the no-native-dependency detector; the OpenCV spike is still pending. |
| §2 Review and enhance | [02-review-enhance.md](02-review-enhance.md) | E1–E7 | E1–E6 done. **E7 in progress:** the tooling is done; the benchmark needs real pages and raters. |
| §3 Courses | [03-courses.md](03-courses.md) | K1–K6 | All done in code. Device checks open. |
| §4 Submit | [04-submit.md](04-submit.md) | S1–S8 | All done in code (S3–S8 have device checks open; S8 needs a new dev build). |
| §5 Study | [05-study.md](05-study.md) | T1–T7 | T1–T6 done in code (device checks open). T7 (flashcards) is for later (P4). |
| §6 Languages and scripts | [06-languages.md](06-languages.md) | L1–L6 | L1–L4 (the P2 groundwork) done in code; device checks open, L3's font spike was skipped (system fonts assumed). L5–L6 (Tesseract, packs) wait for Bangla (P4). |
| §7 Reader and PDF tools | [07-reader-tools.md](07-reader-tools.md) | R1–R6 | R1–R4 done in code (device checks open; R1 needs a new dev build for `modules/pdf-native`). **R5 in progress:** done in code except the SheetJS 0.20.3 swap (`cdn.sheetjs.com` was blocked). R6 waits for Pro. |
| §8 Backup and portability | [08-backup.md](08-backup.md) | B1–B6 | B1–B5 done in code (device checks open; B1's backup rules and B4's zip "Open with" need a new dev build). B6 (Google Drive) waits for Pro. |
| §9 Onboarding and UX polish | [09-onboarding.md](09-onboarding.md) | O1–O6 | O1 done in code (device checks open; needs a new dev build for the splash and predictive back). O2 and O3 done in code. **O5 in progress:** done in code; the measurements in `docs/qa/performance.md` are open. **Next: O4** (accessibility), then O6. |
| §10 Monetization | [10-monetization.md](10-monetization.md) | M1–M6 | Planned (2026-10-02). Pro launches with §8 B6 or §7 R6 (see M6). |
| §11 Launch and growth | — | — | Not planned yet. Next to plan: `docs/plan/11-launch.md` (see `docs/PLAN.md` §11). |

## Phases (from `docs/PLAN.md` §5)

"Done in code" means every step is implemented, typechecked and covered by Jest; the device checks
in each plan file's Verification are still open. A phase is **complete** only when its "done when"
checks pass on a device.

| Phase | Sections | Code status | Phase status |
|---|---|---|---|
| **P0: Foundation** | §0 | §0 F1–F8 done in code | **Done in code**, device checks open (upgrade from an AsyncStorage-era build keeps every document) |
| **P1: Student MVP** | §1, §2 (Ink + Board), §3, §4, §9 onboarding | §1, §2 (E1–E6), §3, §4 done in code; E7 benchmark run open | **Not complete**: §9 onboarding (onboarding screens, teaching empty states, accessibility, performance budget) is not planned yet; device checks open |
| **P2: Study** | §5, §6 groundwork, §8 zip export | §5 T1–T6, §6 L1–L4 and §8 B1–B5 done in code | **Done in code**; device checks open (L3's font spike, §8's backup and restore on a phone included) |
| **P3: Grow** | §10 Pro, §8 Drive, §11, iOS parity | — | Not started (§7 R1–R4 done in code, R5 all but the SheetJS swap; R6 waits for Pro) |
| **P4: Expand** | Bengali (§6 L5–L6), flashcards (§5 T7), more templates | Groundwork in place (script registry, OCR engines, any-script PDF text, i18n) | Not started |

**Next to unblock the phases:** finish §9 (finishes P1 in code; §8's zip export is done, so P2
is done in code), then the device checks for P0–P2.

The product-level checklist is `docs/PLAN.md` (§0–§11). Keep its ticks in step with the `Status:`
lines here.

### Step by step

| Step | Commit | Notes |
|---|---|---|
| F1 Tests + CI | bb99d51 | Jest (`jest-expo`), mocks in `src/test/mocks`, CI runs typecheck + tests |
| F2 Store hygiene | 009cccb | |
| F3 + F4 SQLite library, Course model | 3a39203 | `persistence/{migrations,libraryRepo}.ts`; AsyncStorage blob imported once |
| F5 Masters, edits as settings, one encode | 4345a55 | `skiaEnhance.renderPage`, `capture/imageSpec.ts` |
| F6 Glyphless OCR text layer | f84a669, 97ee2a6 | |
| F7 Small fixes, error boundary | c1a1d66 | |
| F8 Opt-in Sentry | e502f9b | |
| C1 Capture modes | 2249a8a | `capture/captureModes.ts` |
| C2 Scanner plugin patch | ab4d8be | `patches/react-native-document-scanner-plugin+2.0.4.patch` |
| C3 Book mode split | 15d95c9 | |
| C4 ID card mode | ee5a8aa | |
| C5 Gallery batch + auto-crop | da8e429 | |
| C6 Progress, cancel, haptics, "Scan more" | 53aba95 | |
| C7 Camera fallback | fbfe02b | |
| E1 Filter registry | a993721 | `enhance/filters/*`, applied only by `drawFiltered` |
| E2 Live SkPicture preview + Filter Lab | 389d29c | `useFilteredPicture`, `src/dev/FilterLabScreen.tsx` |
| E3 Shadow / lighting correction | f2398b5 | |
| E4 Ink filter | 45c2ceb | |
| E5 Board filter | 15b6487 | |
| E6 Filter strip, undo/redo, apply-to-all, loupe | cc0648b | `store/pageHistory.ts` |
| E7 Benchmark tooling | ae88e8e | the benchmark run itself is open |
| K1 Course + semester model | 9574adb | migration v3 |
| K3 Course editor, quick setup | 1e925cf | done before K2, as the plan orders |
| K2 Home hub, course pages | f98b0d8 | Home is the start screen once a course exists |
| K4 Document types | 080c5b7 | |
| K5 Course suggestions, class times | 10286d8 | migration v4 |
| K6 Organising existing documents | 18c9ed4 | migration v8 (`documents.archived`) |
| S1 Student profile | c4f8f75 | `settings.profile`, `submit/profile.ts`, `pdf/winAnsi.ts` |
| S2 Naming template, named shares | 5f81a98 | `submit/naming.ts`, `shareService.shareAs`, `sanitizeFileName` |
| S3 Size target | 6b6c94f | `submit/sizeTarget.ts`, `SIZE_LADDER`, `encodedBytes`; device check open |
| S4 Cover templates | 2097822 | `pdf/coverTemplates.ts`, `useCoverDefaults`, `CoverThumbnail` |
| S5 Footer presets, page size | 00bfc5d | `renderText`, `footerPresets.ts`, `pdf/pageSize.ts`, `store/useDeliverContext.ts` |
| S6 Submit flow, course presets | 7d92973 | migration v5, `submit/{preset,submitDocument}.ts`, `useSubmitDocument` |
| S7 Submission history | 9b7ec21 | migration v6, `submit/history.ts`, `SubmissionList` |
| S8 Deadline reminders | 31c0083 | migration v7, `expo-notifications`, `submit/deadlines.ts`, `store/useDeadlines.ts` |
| T1 Page mapping, word OCR | 0cfbddd | migration v9, `documents/pageMap.ts`, `pdfInfoBackfill.ts` |
| T2 Page search, jump, highlight | 38e4fd8 | `dbService.searchPages`, `PageResults`, `reader.target` |
| T3 Copy, extract, select text | 4cdba0a | `expo-clipboard`, `PageCanvas`, `study/textSelection.ts` |
| T4 Annotations | 5c60573 | migration v10, `services/annotations/*`, `AnnotateSheet`, `beforeSave` |
| T5 Bookmarks | 2a228ad | migration v11, `study/bookmarks.ts`, `BookmarkList` |
| T6 Exam pack | 5c14baa | `study/buildExamPack.ts`, `packSlice`, `ExamPackScreen` |
| L1 Script registry v2, per-course script | 8dc13df | migration v12 (`courses.ocr_script`), `resolveOcrScript`, `store/useScanOcrScript.ts` |
| L2 `OcrEngine` interface | 881af3e | `ocr/engines/*`, `ocrService.recognizePage` (failure reasons), `test/fakeScript.ts` |
| L3 Visible PDF text in any script | 9f5689a | `pdf/skiaText.ts`, `pdf/visibleText.ts`, `test/fakeShaper.ts`; **spike not run** (system fonts assumed) |
| L4a i18n layer, Settings + Home | 8de31f8 | `src/i18n/*`, `settings.uiLanguage`, `expo-localization` (new dev build), hard-coded string scan |
| L4b Capture + Review converted | 519540d | mode/filter specs carry `labelKey`/`hintKey`; capture service messages via `t()` |
| L4c Deliver, Submit, deadlines, document text | 10c1b6b | `document.*` + `tDoc()`, `settings.documentLanguage`, `footerPresetText()` |
| L4d Library, Reader, courses, shared, services | 2854eb4 | hard-coded string check fails for every `.tsx` outside `src/dev` |
| R1 Imported PDFs: thumbnails, text, search | 2b46521 | migration v13, `modules/pdf-native` (new dev build), `pdf/pdfNative.ts`, `documents/importedPdfIndex.ts`, `store/useImportedPdfIndexing.ts` |
| R2 Page tools for imported PDFs | 9f97fc1 | `pdf/{pdfOps,rasterPdf,pdfErrors}.ts`, `decoratePdf`, `usePageImage`; pages keep ids on merge/split, `syncLibrary` deletes removed documents first |
| R3 Edit pages after saving | 510eb3b, a123c21 | migration v14 (`pages.rotation`), `pdf/rotation.ts`, `persistence/pageEdits.ts`, `appendDocuments`, `EditPagesModal`, `deliver.appendTo` |
| R4 Reader conveniences | a68b7ed | migration v15 (`documents.last_page`), `documents/readerPosition.ts`, `PageScrubberSheet`; page rows not rewritten when unchanged |
| R5 Office formats: read-only, capped | 2e00ceb | `documents/{sheetService,docxService}.ts`, `DocxView`, `OPENABLE_FORMATS`; **SheetJS 0.20.3 swap still open** |
| B1 Storage health | 58ba0ee | migration v16 (`documents.missing_files`, `disk_bytes`), `services/storage/{integrity,usage}.ts`, `StorageScreen`, `useSpaceGuard`, `plugins/withBackupRules.js` (new dev build) |
| B2 Backup format | a762099 | `services/backup/zip/*` (STORE + Zip64, CRC patched into local headers), `backup/format.ts` (`exportRows`, `importPlan`, `insertRows`, `upgradeLibraryJson`) |
| B3 Back up and export | ac0eee5 | `backup/createBackup.ts`, `components/backup/{useBackupExport,BackupSheet}.tsx`, `BackupScreen`, `deviceExportService.saveFileToFolder` (streamed SAF), `settings.lastBackup*`/`backupFolder*` |
| B4 Restore and import | de148e2 | `backup/{restoreBackup,restoreSettings,incomingZip}.ts`, `RestoreHost` (`ui/OPEN_BACKUP`), `dbService.withWriteLock`, zip intent filter (new dev build) |
| B5 Reminders, automatic backups | 956c5d5 | `backup/{schedule,autoBackup}.ts`, `useBackupReminder`, `useAutoBackup`, `ExportHost`, `AutoBackupChip`, `settings.autoBackup*` |
| B2 leftover: reading isn't an edit | 766edc3 | `libraryRepo.documentEdited`: `updated_at` only moves on real edits (restore twice after reading adds nothing) |
| O1 Android back, start screen, splash | 1e998dc | `navigation/{backHandling,useBackHandler}.ts`, `bootstrap/{splash,startScreen}.ts`, `expo-splash-screen` (new dev build) |
| O5 Performance (code) | ffc68d3, 35016b8 | selector store (`useAppSlices`/`useAppSelector`), memo'd rows, `useDeferredBoot`, lazy xlsx/mammoth, `src/dev/seedLibrary.ts`; measurements open (`docs/qa/performance.md`) |
| O2 Onboarding | 84b2252 | `OnboardingScreen`, `services/onboarding/onboarding.ts`, `CourseSetupForm` (shared with `QuickSetupSheet`), `settings.onboardingDone` |
| O3 Empty states, hints | c4dd4f7 | `components/shared/{EmptyState,Hint,useHint}`, `services/hints/hints.ts`, `settings.hintsSeen`, `store/useGalleryImport` |

## How the branches came together

§0/§1 were built on branch `ccr-ae22e8ac-tnkzk5` while §2 was built on
`claude/zen-gauss-7xh4cp`. They were merged in **505563c** (on the §2 branch). The merge
reconciled the two render paths: F5's `renderPage` now draws through §2's `drawFiltered`.
Rotation is a page setting, applied by `drawRotated` in both export and the live preview.
`bakeEnhance`, `rotatePage` (in Review) and `useEnhancedPreview` are gone. Notes defaults to
`ink` and Board to `board`. §3 was built on top of that merge.

**Security:** commit f647948 on `main` hid a malicious payload at the end of `metro.config.js`.
It downloads and runs remote code whenever Metro loads the config. It was removed on the
§0/§1 branch (24f5ccf) and on the §2 branch (a907d20), but **`main` still has it until this
branch is merged**. If you edit `metro.config.js`, make sure the last line is just
`module.exports = config;`.

## Changes made after a step was marked done
- **Scanner launch (71da855):** Capture no longer opens the scanner every time it appears. It
  opens only when a "scan now" button sets `capture.scannerRequested`: Home's Scan, a course's
  Scan, Library's "Scan now", Review's Retake / Add more / Start Capture. The Scan tab, app
  start and Back from Review just show the Capture screen. `startScan(state, dispatch, courseId,
  { launch })` is the entry point for new scans.

## Device checks still open
No device check for §0–§3 is recorded as done; the agents that built them could only run
`tsc` and Jest. The Verification section at the end of each file lists what to check. Highest value first: §0 (upgrade from an
AsyncStorage-era build keeps every document), §3 (4 courses on Home, a scan in class time files
itself), §2 (Filter Lab checks for Ink and Board).

## Conventions for updating these files
- When you finish a step: set its `Status:` to `done (commit <sha>)`, add short "As built" notes
  wherever the code differs from the step text, tick it in `docs/PLAN.md`, and update the tables
  above.
- If a later change alters a finished step's behaviour, add it under "Changes made after a step
  was marked done" here, and a one-line note in that step.
