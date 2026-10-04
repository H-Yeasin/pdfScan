# §14 Pre-launch fixes: step-by-step plan

## How to use this file
- Implement **one step per session** ("Implement Q1 from docs/plan/14-prelaunch-fixes.md").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are implementing.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §14.
- Step prefix **Q** (quality). Not to be confused with the phases P0–P4.
- **§14 blocks the Play release**, so it comes before §11 (launch). Suggested order: Q1 → Q2 (ads,
  revenue and policy), Q3 → Q4 (insets: every screen), Q5 (bulk delete), Q6 → Q7 (covers).

## Context
**Planned 2026-10-04.** The owner tested the app before publishing and found four critical problems:

1. **Pro tasks unlock without an ad.** Converting and editing should cost one full-screen rewarded ad
   per task (§12 D1), but the app converts and opens the editors without showing any ad.
2. **No bulk delete in the Library.** Documents can only be deleted one at a time, from inside the
   Reader.
3. **No cover page for documents already in the Library.** A cover can only be added while saving a
   new scan (Deliver → Academic options). Converted files (Word/Excel → PDF) and imported PDFs can't
   get one.
4. **The bottom of the app sits under the Android navigation bar.** On phones with the 3-button bar
   (and, less visibly, with gesture navigation), bottom bars, buttons, sheets and the snackbar are
   drawn underneath the system buttons.

**Owner's decisions (2026-10-04):**
- **Ad gate: strict, with a small grace.** A task runs only after a rewarded ad is watched to the end,
  except (a) an active Pro pass, (b) a live grant (the edit session the ad unlocked, a once grant kept
  after a failed task), or (c) a phone that is **really offline**, capped by
  `offline_free_tasks_per_day`, whose default goes from 5 to **1**. A broken SDK, a missing ad unit,
  consent that doesn't allow ads, or no fill **never** runs a task for free. The student sees
  "The ad couldn't load" with **Try again** (and the Pro pass).
- **Covers on library documents:** after the student sets up the cover and taps Apply, they choose
  **Save as a copy** or **Replace** (or Cancel).

## What the code looks like today (2026-10-04)

### 1. The ad gate fails open
- `src/services/remote/remoteConfig.ts` `REMOTE_DEFAULTS`: `adsEnabled: false`,
  `adsRewardedUnitAndroid: ''`, `offlineFreeTasksPerDay: 5`. Without a successful Firebase fetch
  (no Firebase project yet, first launch offline, fetch error) the app runs on these defaults.
- `src/services/pro/proTask.ts` `decide()`:
  ```ts
  if (input.isPro) return 'run';
  if (findGrant(...)) return 'run';
  if (!input.adsEnabled) return 'run';          // ← every task is free while ads are off
  if (input.adsAvailable) return 'offerAd';
  return input.offlineRunsToday < input.offlineFreePerDay ? 'runWithoutAd' : 'offerPro';
  ```
  The comment says "Off means the owner switched ads off", but the **code default** is off, so
  every unconfigured or offline-first install gets every Pro task free.
- `src/services/ads/rewarded.ts` `createAd()` returns null when ads are off, the SDK isn't `ready`
  (consent denied, no Play services, init failed) or no unit is set (`''` by default).
  `showRewarded` then returns `'unavailable'`, and a load timeout or SDK error returns `'failed'`.
- `src/services/pro/proTaskFlow.ts` `watchAdForTask()` treats `'unavailable'` and `'failed'` the same
  as being offline: it runs the task (`runWithoutAd`) up to `offline_free_tasks_per_day` (5) a day.
- `app.json` → `react-native-google-mobile-ads` plugin → `androidAppId` is still Google's **sample
  app ID** (`ca-app-pub-3940256099942544~3347511713`). A release build with it can't serve real ads,
  so every ad fails and the task runs free.
- `src/components/pro/useProTask.tsx` `start()`: `'run'` and anything else that isn't `offerAd` or
  `offerPro` share one branch (`completeProTask`). Nothing records *why* a task ran without an ad.
- Offline detection: `expo-network` (`components/ads/BannerSlot.tsx` uses
  `network.isInternetReachable ?? network.isConnected`). There's no NetInfo dependency, and none is
  needed.

### 2. No bulk delete
- `src/components/library/SelectionBar.tsx` `TOOLS`: submit, move, type, archive, export, merge,
  split, compress, sign. There's no delete and no "Select all".
- The only delete is `ReaderScreen.tsx` (`id === 'delete'`): an `Alert` (`reader.deleteTitle` /
  `reader.deleteBody`), then `dispatch({ type: 'library/REMOVE_FILES', ids: [doc.id] })` +
  `deleteDocumentFiles(doc.id)`.
- `librarySlice` `library/REMOVE_FILES` already takes `ids: string[]` and drops the selection,
  submissions, annotations and bookmarks of those ids. `store/useLibraryPersistence` diff-syncs the
  removal to SQLite.
- `useDocumentListActions` (the selection logic) is used by Library, Home, Course, Storage and
  ExamPack.

### 3. Covers only in Deliver
- `src/services/pdf/pdfService.ts`:
  - `buildPdfFromPages(..., academicConfig)` builds a scan's PDF with the cover as page 0 (the OCR
    text layer already accounts for the offset).
  - `decoratePdf(pdfDoc, config, pageSize)` (§7 R2) stamps the border, header and footer on every page
    of **any** PDF and puts the cover in front. Today only `submit/submitDocument.submitPdfLevel` and
    `pdf/rasterPdf.ts` use it, on a temporary submission copy, never on the library document.
- `src/screens/AcademicOptionsScreen.tsx` edits `deliver.academicConfig` (`deliver/SET_ACADEMIC_CONFIG`),
  which belongs to the scan session (reached from Review and Deliver). It has a preview built from the
  session's pages.
- `LibraryDocument.coverKind?: 'template' | 'imported_image'` records whether page 0 is a cover.
  `applySignatureToDocument` relies on it.
- `LibraryDocument.sourceKind?: 'scanned' | 'imported_pdf'`. Converted PDFs (§12 D5) are PDF-level
  documents. D6's output is a DOCX, not a PDF.

### 4. Edge-to-edge without bottom insets
- Expo SDK 57 / React Native 0.86 on Android are always **edge-to-edge** (Android 15+ enforces it
  too). The app draws behind the status bar and the navigation bar. Each screen has to pad itself.
- `SafeAreaProvider` is in `bootstrap/AppProviders.tsx`. Almost every screen uses
  `<SafeAreaView edges={['top']}>`: Home, Library, Course, Review, Deliver, Capture, Settings, Pro,
  Storage, Backup, AcademicOptions and ManageFolders. Only Onboarding, ExamPack and
  `DocumentPickerModal` include `'bottom'`.
- Bottom-anchored UI with no inset: `SelectionBar`, `ReaderToolBar`, `CaptureControls`,
  `review/PreviewControls`, `review/ThumbnailStrip`, the Deliver save button, `shared/Snackbar`,
  `ads/BannerSlot`, `reader/PageScrubberSheet`, `reader/SelectTextSheet` and the Mark mode tools.
- Modals with no insets: `reader/CsvGrid`, `deliver/FolderPickerModal`, `shared/SignatureModal`,
  `shared/SignatureCaptureModal`, `shared/SignaturePlacementOverlay`, `shared/TextPromptModal`,
  `review/CropOverlay`, `backup/RestoreHost` and `backup/BackupSheet`.
- **Done right already (the pattern to copy):** `CourseScreen` (`paddingBottom: 96 + insets.bottom`
  on the list, `bottom: spacing.lg + insets.bottom` on the Scan button), `ReadingSettingsSheet`
  (`paddingBottom: insets.bottom + spacing.md`), and `ReaderTopChrome` (`paddingTop: insets.top`).

---

## Q1 · Ad gate fails closed *(M)*
Status: planned.

Goal: no Pro task runs without a rewarded ad watched to the end, except a Pro pass, a live grant, or
a genuinely offline phone within the daily grace.

Files: `src/services/pro/proTask.ts`, `src/services/pro/proTaskFlow.ts`,
`src/services/ads/rewarded.ts`, `src/services/remote/remoteConfig.ts`,
`src/components/pro/useProTask.tsx`, `src/components/pro/ProTaskSheet.tsx`, `src/i18n/en.ts`, tests.

Changes:
- **Remote Config** (`remoteConfig.ts`):
  - New key `pro_tasks_free` → `proTasksFree: boolean`, default **false**. This is the owner's only
    switch to make Pro tasks free (a promotion, or an ads outage). `ads_enabled` no longer
    frees tasks.
  - `offlineFreeTasksPerDay` default **5 → 1** (the parser keeps `int(0, 50)`).
  - `adsEnabled` default becomes **true** in release builds (`!__DEV__`), so a phone that never
    reached Firebase still starts the SDK and can show the task ad. It stays the owner's switch for
    banners and the SDK. Document that turning it off in the console stops banners **and** makes Pro
    tasks unavailable (not free) unless `pro_tasks_free` is also on.
- **`decide()`** (`proTask.ts`): new order
  1. `isPro` → `'run'`
  2. live grant → `'run'`
  3. `proTasksFree` → `'run'`
  4. otherwise → `'offerAd'`

  `adsEnabled`, `adsAvailable` and the offline count leave `DecideInput`. The no-ad cases are
  decided *after* the ad was tried (step below), with the reason known. Update the type comments.
- **Why an ad didn't show** (`rewarded.ts`): `ShowResult` becomes
  `'rewarded' | 'closedEarly' | { unavailable: AdUnavailableReason }` (or keep strings and add a
  `reason` field), with `AdUnavailableReason = 'adsOff' | 'noUnit' | 'sdk' | 'consent' | 'noFill' |
  'timeout'`. `createAd()` returns the reason instead of null. `startAds` already sets `status:
  'unavailable'` for consent. Keep the distinction between `canRequestAds === false` (`consent`) and
  an init error (`sdk`) in `AdsSdkState` (add `reason`).
- **`watchAdForTask()`** (`proTaskFlow.ts`): after a non-rewarded, non-closed result:
  - Read the network with `expo-network` `getNetworkStateAsync()`
    (`isInternetReachable ?? isConnected`). **Offline** → if `offlineRunsOnDay < offlineFreeTasksPerDay`,
    record it and return `{ outcome: 'runWithoutAd' }`; else `{ outcome: 'offerPro' }`.
  - **Online** (or unknown) → `{ outcome: 'adUnavailable', reason }`. The task does **not** run.
    Log `pro_task_ad_unavailable` with a numeric reason code (Q2 adds it to the allow-list).
  - `TaskAdOutcome` gains `'adUnavailable'`. `'offerPro'` keeps its meaning (offline grace used up).
- **`useProTask`**: `start()` keeps `'run'` → `completeProTask`. After `watch()`:
  - `adUnavailable` → re-open the sheet in an **error state** (keep the request) instead of a snack.
  - `runWithoutAd` → `completeProTask` + a snack "Offline: this one's free. Next time it needs a short
    ad." (`pro.task.offlineFree`), so the grace isn't silent.
- **`ProTaskSheet`**: an `error?: AdUnavailableReason` prop. Title "The ad couldn't load", body by
  reason (`pro.task.adUnavailable.{noFill,timeout,sdk,consent,noUnit,adsOff}`). Buttons:
  **Try again** (calls `watch` again with the same request), **Get Pro pass** (`go('pro')`), and for
  `consent` **Ad choices** (`AdsConsent.showPrivacyOptionsForm()`, then `startAds({ retry: true })`).
  The Pro pass itself needs an ad, so the Pro screen shows the same reason when its ad fails (check
  `watchAdForPass`'s `'unavailable'` copy).
- **Audit the entry points.** Every gated action must go through `useProTask.start`, or through
  `resumeProTask` after a reward:
  - `components/reader/useConvertToPdf.tsx`, `useConvertToWord.tsx`, `useEditFile.tsx`,
    `useFillForm.tsx`, Mark mode's Pro Text tool (D10), and `ReaderScreen`/`OverflowSheet` menu
    handlers. Grep for `convertToPdf(`, `convertToWord(`, `saveSheetCopy`/`docxEdit`/`pdfForm` writers,
    and `completeProTask(` outside `useProTask`/`proTaskFlow`.
  - The external "Open with" flow (`store/useExternalFileLinking`, `files/externalFileService`): editing
    an outside file must hit the same gate (D7's `carryProTaskGrant` only carries an *existing* grant).
  - Library selection tools: none convert today. Confirm that.
  - Any dev shortcut that grants Pro or tasks must be inside `if (__DEV__)`.
- Keep: `closedEarly` → nothing runs (already correct). The pending-task resume only offers tasks with
  `rewarded: true` (already correct).

Tests:
- `proTask.test.ts`: `decide` table (Pro, grant, `proTasksFree`, else `offerAd`; ads off no longer
  runs).
- `proTaskFlow.test.ts`: mock `showRewarded` and `expo-network`. Unavailable + online →
  `adUnavailable` and no offline run recorded. Unavailable + offline → `runWithoutAd` once, then
  `offerPro`. `rewarded` → grant saved. `closedEarly` → nothing.
- `remoteConfig` test: `pro_tasks_free` parse and default, `offline_free_tasks_per_day` default 1.
- `ProTaskSheet`/`useProTask` render test: the error state shows Try again, and Try again calls the
  ad again.
- Add `expo-network` to `src/test/mocks` if it isn't mocked yet.

## Q2 · Release ad config and diagnostics *(S)*
Status: planned.

Goal: a release build serves real ads, and a broken setup is visible instead of silently blocking or
freeing tasks.

Files: `docs/ads.md`, `docs/firebase.md`, `docs/policy/play-console.md`,
`src/services/telemetry/usage.ts` (allow-list), `src/screens/SettingsScreen.tsx` (dev-only line),
`src/i18n/en.ts`.

Changes:
- **Owner checklist** (`docs/ads.md`, linked from `docs/policy/play-console.md`'s pre-release list):
  1. AdMob → create the app → put the **real** app ID in `app.json`
     (`react-native-google-mobile-ads.androidAppId`, and `iosAppId` later). This is a config-file
     change: review the diff for long lines and trailing whitespace (AGENTS.md security note).
     It needs a new build.
  2. Create a **rewarded** unit and a **banner** unit. In the Firebase Remote Config console set
     `ads_rewarded_unit_android`, `ads_banner_unit_android`, `ads_enabled = true`,
     `offline_free_tasks_per_day = 1`, `pro_tasks_free = false`, and publish.
  3. Check `app-ads.txt` on the developer website (AdMob requirement).
- **Telemetry:** add `pro_task_ad_unavailable` (params `feature`, `reason`: numeric codes, never
  document data) and `pro_task_offline_free` to the M8 allow-list.
- **Dev diagnostics:** in `__DEV__`, Settings shows one line under the dev section: SDK status and
  reason, "rewarded unit set: yes/no", and the Remote Config source (defaults / fetched). This makes the
  owner's release checks quick on a dev build.
- Update `docs/firebase.md`'s key table (`pro_tasks_free`, the new `offline_free_tasks_per_day`
  default) and the D1 notes in `docs/plan/12-convert-edit.md` ("fail-open offline" becomes
  "fail-closed; offline grace 1 a day", under "Changes made after a step was marked done").

Tests: telemetry allow-list test includes the new events. No UI test for the dev line.

## Q3 · Bottom insets on every screen *(M)*
Status: planned.

Goal: with the 3-button bar or gesture navigation, nothing interactive sits under the system bar. Bar
backgrounds continue under it, so the app looks finished edge to edge.

Files: new `src/components/shared/BottomBar.tsx` (+ `useBottomInset`), the screens in `src/screens/`,
and the bottom bars listed in "What the code looks like today" §4.

Changes:
- **`BottomBar`**: `({ style, children })` → a `View` with the bar's own background color and
  `paddingBottom: insets.bottom` (`useSafeAreaInsets`). Also `paddingLeft/Right` from the insets in
  landscape. `useBottomInset(extra = 0)` returns `insets.bottom + extra` for lists and floating
  buttons.
- **Rule per screen:**
  - No bottom-anchored UI → `SafeAreaView edges={['top', 'bottom']}`, and `['left','right']` too
    where the screen can rotate.
  - A bottom bar → keep `edges={['top']}` and wrap the bar in `BottomBar`.
  - Scrolling content → `contentContainerStyle.paddingBottom` includes `useBottomInset(...)`, so the
    last row can scroll above the bar (copy `CourseScreen`).
  - Floating buttons → `bottom: spacing.lg + insets.bottom` (copy `CourseScreen`).
- **Apply to:** Library (+ `SelectionBar`, and its list padding while selecting), Home, Course (check
  it while selecting), Storage, ExamPack, Review (`PreviewControls`, `ThumbnailStrip`), Deliver (save
  button, the scroll), Capture (`CaptureControls`; the camera preview stays full-bleed), Reader
  (`ReaderToolBar`; landscape left/right insets for `ReaderTopChrome` and the tool bar), the editors
  (`FileEditor`, `DocxEditor` save bars), Settings, Pro, Backup, AcademicOptions and ManageFolders.
- **Small screens and large text** (the "not responsive" half of the report): at 360 dp width and font
  scale 1.3, check that `SelectionBar` still scrolls and shows a partial next item (it gains Delete and
  Cover in Q5/Q7), the Deliver and Pro buttons wrap instead of clipping, and row titles truncate with
  `numberOfLines`. Fix what breaks; don't redesign.

Tests:
- Jest setup: `react-native-safe-area-context`'s mock (`initialWindowMetrics` with
  `insets.bottom = 48`). Render `LibraryScreen` in selection mode and assert the `BottomBar` padding is
  48. Same for `ReaderToolBar`.
- The guard test is in Q4.

## Q4 · Sheets, modals, snackbar, keyboard and a guard test *(S–M)*
Status: planned.

Changes:
- **Modals:** every `<Modal>` gets `statusBarTranslucent` and `navigationBarTranslucent` (so its
  window is edge-to-edge like the app, and the insets are the same), and pads its content: sheets
  `paddingBottom: insets.bottom + spacing.md` (copy `ReadingSettingsSheet`), full-screen modals a
  `SafeAreaView` with all edges. Files: the 9 listed in §4 above, plus a pass over the sheets that
  already pad (`ProTaskSheet`, `OverflowSheet`, `NotesSheet`, `FormFillSheet`, `ReadingSettingsSheet`,
  pickers).
- **Snackbar** (`shared/Snackbar.tsx`) sits at `bottom: insets.bottom + spacing.md`. On screens with a
  bottom bar, it sits above the bar (a `bottomOffset` from the screen, or measure the bar).
  **BannerSlot** pads below itself with `BottomBar` when it's the last thing on the screen.
- **Keyboard:** with edge-to-edge, check `TextPromptModal`, `FileEditor`, `DocxEditor` (WebView),
  `CsvGrid` and the Course editor. The focused field must stay above the keyboard
  (`KeyboardAvoidingView behavior="padding"` inside modals; Android `softwareKeyboardLayoutMode`
  stays at Expo's default `resize`).
- **Navigation bar look:** Android draws a translucent scrim behind the 3-button bar automatically.
  Keep it (contrast); don't add `expo-navigation-bar`.
- **Guard test** `src/screens/__tests__/safeArea.test.ts` (source scan, same style as
  `src/i18n/__tests__/hardcodedStrings.test.ts`):
  - every `SafeAreaView` in `src/screens/*.tsx` lists `'bottom'` **or** the file renders `BottomBar`
    / uses `useBottomInset` (an explicit allowlist for full-bleed screens like Capture and Reader,
    with a comment saying why);
  - every `<Modal` in `src/**/*.tsx` has `navigationBarTranslucent`.

## Q5 · Bulk delete and Select all *(S)*
Status: planned.

Files: `src/components/library/SelectionBar.tsx`, `src/components/library/useDocumentListActions.tsx`,
`src/screens/LibraryScreen.tsx` (selection header), `src/screens/CourseScreen.tsx`,
`src/store/slices/librarySlice.ts`, `src/i18n/en.ts`, tests.

Changes:
- **`SelectionBar`**: `SelectionToolId` gains `'delete'`. It goes **last** in `TOOLS` (destructive
  actions at the end), uses `trash-outline` in `tokens.danger` for icon and label, and is never disabled
  (any format, password-protected included).
- **`handleSelectionTool('delete')`** (`useDocumentListActions`):
  - `Alert.alert(t('library.deleteSelected.title', { count }), t('library.deleteSelected.body', { count }),
    [Cancel, Delete (destructive)])`. Plural strings (`one`/`other`): "Delete 3 documents?" / "They and
    their files will be permanently removed from this phone. This can't be undone." For one document,
    reuse the Reader's wording with its name.
  - On confirm: `dispatch({ type: 'library/REMOVE_FILES', ids })`, then `deleteDocumentFiles(id)` for
    each id **one at a time** (a `for` loop, no `Promise.all`; AGENTS.md convention), then
    `library/CLEAR_SELECTION` and a snack `library.deleted` ("Deleted {count} documents").
  - Dispatch first, then delete files: the UI updates at once, and a failed file delete only leaves
    orphan files (Settings → Storage can clean them) rather than a row whose files are gone.
- **Select all:** new action `library/SELECT_ALL { ids: string[] }` that sets `selection` to `ids` and
  turns on `selMode`. The selection header in Library (and Course) gets a "Select all" / "Select none"
  toggle (`library.selectAll` / `library.selectNone`). The ids are the **visible** list: current tab,
  course and search results, the same array the `FlatList` renders.
- **Edge cases:** archived documents can be deleted like any other. Submissions, annotations and
  bookmarks go via the reducer cascade (already there). The FTS index rows go with the document in
  `libraryRepo` (check that the diff-sync deletes `pages_fts` rows; add it if not). A doc that is the
  home screen's "last opened" disappears from it.

Tests:
- `librarySlice` tests: `SELECT_ALL`, and `REMOVE_FILES` with several ids clears them from the
  selection and cascades.
- `SelectionBar` test: Delete is present and enabled for a mixed selection (PDF + DOCX + protected PDF).
- `useDocumentListActions` test: confirm → one `REMOVE_FILES` with all ids, `deleteDocumentFiles` called
  once per id in order. Cancel → nothing.
- `hardcodedStrings` stays green.

## Q6 · Add a cover to a library PDF: the service *(M)*
Status: planned.

Goal: any PDF in the Library (scanned, imported, merged, converted from Word/Excel/CSV/TXT) can get a
cover page (plus the preset's border, header and footer), saved as a copy or replacing the document.

Files: new `src/services/library/addCover.ts` (or a function in
`services/persistence/libraryOperations.ts` beside merge/split/sign, which is the better home if it
fits), `src/services/pdf/pdfService.ts` (no behaviour change expected), `src/i18n/en.ts`
(`document.withCover` via `tDoc`), tests.

API:
```ts
addCoverToDocument(input: {
  doc: LibraryDocument;
  config: AcademicConfig;          // coverPage required; border/header/footer optional
  pageSize: PageSizeId;
  mode: 'copy' | 'replace';
  annotations: Annotation[];       // for the replace index shift
  bookmarks: Bookmark[];
}): Promise<{ doc: LibraryDocument; annotations?: Annotation[]; bookmarks?: Bookmark[] }>
```

Rules:
- **Allowed for:** `doc.format === 'pdf'` and not password-protected (`isPasswordProtected`). A
  `canAddCover(doc)` helper goes in `documents/formatCapabilities.ts`, so the Selection bar and the
  Reader menu share it. A DOCX (D6's output) can't: the UI hint says "Convert to PDF first".
- **Building the PDF (never mutate the source; AGENTS.md):**
  - **Scanned** (`sourceKind !== 'imported_pdf'`, pages with masters): rebuild with
    `buildPdfFromPages(pages, 'as-is', { ...config })` into a new file. This keeps the OCR text layer
    and page mapping that `buildPdfFromPages` already offsets for a cover, and keeps the document a
    scan, so compress, filters and sign keep working. Process pages one at a time (that function
    already does).
  - **PDF-level** (`imported_pdf`, merges with imported parts, converted PDFs): `loadPdf(doc.pdfUri)` →
    `decoratePdf(pdfDoc, config, pageSize)` → save to a new file.
  - **The document already has a cover** (`doc.coverKind` set): for a scan, rebuilding with the new
    config replaces it. For a PDF-level doc, remove page 0 before `decoratePdf`, so the result never
    has two covers.
- **mode `'copy'`:** a new id via `createId`, files in `getDocumentDir(newId)`, name
  `tDoc('document.withCover', { name })` ("{name} (cover)"), same `courseId`, `docType` and
  `semester`, `coverKind = config.coverPage.mode`, page records copied (scan) or rebuilt from the
  PDF's page count (PDF-level, via `modules/pdf-native` as the R1 import does), and a new thumbnail
  rendered from page 0. Annotations, bookmarks and notes are **not** copied (a copy is a fresh
  document). The caller dispatches `library/ADD_FILE`.
- **mode `'replace'`:** write the new PDF to `document.cover.tmp.pdf` in the document folder, then
  delete `document.pdf` and move the temp file into place, so a crash mid-write never loses the
  document. Set `coverKind`. `sizeBytes`, `updatedAt` and the thumbnail are updated.
  - **Index shift:** if the document had **no** cover before, every page index moves by +1:
    annotations' `pageIndex`, bookmarks, notes, and `lastPage` (`library/SET_LAST_PAGE`). With a cover
    before, nothing moves. Return the shifted arrays; the caller dispatches `library/UPDATE_FILE` +
    `library/SET_ANNOTATIONS` / `SET_BOOKMARKS` (or a single new `library/APPLY_COVER` action, if
    that's simpler for the diff-sync).
  - For scans, `doc.pages` doesn't change (the cover isn't a page record, as with Deliver), so
    `applySignatureToDocument`'s cover handling via `coverKind` stays right.
  - **Search:** re-index the document's text (the cover adds no OCR text, and page numbers in FTS
    results shift with the cover; follow how merge/split re-index).
- **Failure:** any error leaves the original untouched (temp file deleted) and throws. The UI shows a
  snack. A cover image that can't be embedded is already skipped by `buildCoverPage` with a warning;
  surface that as "The cover photo couldn't be used" rather than silently saving with no cover
  (compare page counts).
- **Tier:** free, like Deliver's cover. The University cover's logo stays Pro (M4) through the same
  `useProFeature` check the screen already does.

Tests (`addCover.test.ts`, with the existing pdf-lib and file-system mocks):
- PDF-level copy: the new doc has page count +1, the original's file bytes are unchanged, and
  `coverKind` is set.
- PDF-level replace with no cover before: annotations and bookmarks shift +1. With a cover before: page
  count unchanged, no shift, no double cover.
- Scanned replace goes through `buildPdfFromPages` with the config.
- An error in `decoratePdf` → the original is untouched and no temp file is left.
- `canAddCover`: pdf yes, protected pdf no, docx/xlsx/csv/txt no.

## Q7 · Add a cover to a library PDF: the UI *(M)*
Status: planned.

Files: `SelectionBar.tsx`, `useDocumentListActions.tsx`, `ReaderScreen.tsx` +
`components/reader/OverflowSheet.tsx` (`services/documents/readerTools.ts` for the menu entry),
`AcademicOptionsScreen.tsx`, `store/slices/deliverSlice.ts` (or a small `ui` field),
`navigation/backHandling.ts`, `src/i18n/en.ts`, tests.

Changes:
- **Entry points:**
  - `SelectionBar`: a `'cover'` tool (`document-attach-outline` or similar, label "Cover"), enabled
    when exactly one document is selected and `canAddCover(doc)`. A DOCX selection shows it dimmed;
    tapping says "Convert to PDF first" (same pattern as the password-protected tools).
  - Reader overflow: "Add cover page" ("Change cover page" when `coverKind` is set) for PDFs.
- **Target mode for `AcademicOptionsScreen`:**
  - New state `deliver.coverTarget?: { docId: string; from: 'library' | 'reader' }`, set by
    `deliver/SET_COVER_TARGET` before `go('academicOptions')` and cleared on leaving.
  - In target mode the screen edits a **local** config that starts from the profile's defaults
    (`settings.profile`, the same defaults Deliver starts from). It never touches the scan session's
    `deliver.academicConfig`. The cover section is open first. Border, header and footer are still
    offered (they apply too).
  - The preview renders the target document's first page (PDF-level: `pdf-native` render page 0; scan:
    its first master) instead of the session's pages.
  - The primary button reads **Apply** (`library.cover.apply`) and needs a cover mode other than
    `none`.
- **The save choice** (owner's decision): Apply opens a small sheet (or `Alert` with three buttons):
  - **Save as a copy**: "Keeps the original. Adds '{name} (cover)' to the Library."
  - **Replace**: "Changes this document. Its notes and bookmarks move with the pages."
  - **Cancel**: back to the options, nothing changed.
- **Run:** a progress overlay ("Adding cover…"), then `addCoverToDocument`, then the dispatches. A snack
  "Cover added" with **Open** (for a copy: opens the new document in the Reader). After Replace from
  the Reader, go back to the Reader on the same document, which re-renders the new PDF (bump the
  Reader's key or `pdfUri` cache-buster). After a copy from the Library, return to the Library with the
  new document at the top.
- **Back:** `backHandling.ts` returns to the Library or the Reader per `coverTarget.from`, and clears
  the target.
- **Strings:** `library.tools.cover`, `library.cover.{apply, saveCopy, saveCopyHint, replace,
  replaceHint, adding, added, open, convertFirst, photoFailed}`, `reader.addCover`,
  `reader.changeCover`. Nothing hard-coded.

Tests:
- `AcademicOptionsScreen` in target mode: Apply is disabled with cover `none`. Apply → the choice
  sheet. Save as a copy calls the service with `'copy'`.
- `SelectionBar`: Cover enabled for one PDF, disabled for two docs or a DOCX.
- `backHandling` returns to the right screen and clears the target.

---

## Verification
For every step: `npm run typecheck` and `npm test` pass. Device checks (dev build first, then a
**release** build with the real AdMob app ID and units for Q1–Q2):

**Q1–Q2 Ad gate**
1. Online, ads configured: Convert to PDF → sheet → Watch → watch to the end → it converts. Close
   the ad early → nothing converts, snack says so.
2. Online, no rewarded unit set (or the sample app ID in a release build) → "The ad couldn't load",
   **the task does not run**. Try again repeats the attempt.
3. Airplane mode: the first task of the day runs with the "Offline: this one's free" snack. The second
   one offers the Pro pass, and it does not run.
4. Ads switched off in Remote Config (`ads_enabled = false`, `pro_tasks_free = false`) → tasks don't
   run. `pro_tasks_free = true` → tasks run without an ad.
5. Active Pro pass → no sheet. Edit session (30 min) → saving twice asks once.
6. Kill the app during the ad after the reward → next start offers to finish.
7. The "Open with" route (a DOCX from WhatsApp) → editing or converting asks for the ad too.

**Q3–Q4 Insets** (a phone with **3-button navigation**, and the same phone with gesture navigation;
a 360 dp phone; font scale 1.3)
8. Every screen: Home, Library (also while selecting), Course, Capture, Review, Deliver, Reader (and
   Mark mode, Select text, the page scrubber, landscape), the editors, Settings, Pro, Storage, Backup,
   AcademicOptions, ManageFolders, ExamPack and Onboarding. No button, bar, chip or list end sits under
   the system bar. Bar backgrounds continue under it.
9. Every sheet and modal (signature, crop, text prompt, folder picker, backup, restore, CSV grid,
   Pro task, overflow, notes, form fill) and the snackbar and banner sit above the bar.
10. The keyboard in the text prompt, CSV/TXT/XLSX editor and Word editor never covers the focused field.

**Q5 Bulk delete**
11. Select 5 documents (mixed formats, one archived) → Delete → confirm. They are gone from the list,
    still gone after a restart (SQLite), their notes and bookmarks are gone, and Settings → Storage shows
    the space freed. Cancel leaves everything.
12. Select all in a search result selects only the visible results.

**Q6–Q7 Covers**
13. An imported PDF, a Word file converted to PDF, and a scan: add a template cover, **Save as a
    copy**. The original is unchanged, and the copy has the cover as page 1.
14. The same with **Replace**. Notes, highlights and bookmarks stay on their pages (now +1). Signing a
    page after that lands on the right page. "Change cover page" replaces the cover, not adding a second.
15. A photo cover (imported image) on a converted PDF. A DOCX shows "Convert to PDF first".
16. Search still finds text in a document after Replace, and opens the right page.
