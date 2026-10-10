# §16 Speed and safety: step-by-step plan

## How to use this file
- Implement **one step per session** ("Implement G2 from docs/plan/16-speed.md").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are implementing.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §16.
- Step prefix **G** ("go fast"). The other letters are taken (F C E K S T L R B O M H Q V D, and the phases
  P0–P4).
- **§16–§18 ship before §11** (launch). They interleave; the order across the three files is in
  `docs/plan/README.md` and at the end of this file. **G1 is the first step of all three.**
- **New dev builds:** G4 (embedded fonts), G6 (`expo-image`) and G8 (R8, build properties). Batch G4's
  and G6's native changes into §18 W7's dev build if they land close together, so the owner builds
  three times, not six.

## Context
**Planned 2026-10-09.** The owner: "the app must feel fast", and the app "feels vibe coded". A read-only
performance audit (2026-10-09) found that the selector store and memo'd rows from §9 O5 are undone at
the root, every screen loads at boot, and every navigation mounts screens twice. It also found a
privacy problem that blocks the release: an unconditional Sentry init with session replay.

**Owner's decisions (2026-10-09):**
1. §16–§18 ship **before** the Play launch.
2. The navigation is restructured (§17 U5: Home · Files · [Scan] · Tools · Me). G2's router has to carry
   those tabs.
3. The Reader rotates to landscape (§18). The router and shell must tolerate an orientation change
   on that one screen.

## What the code looks like today (2026-10-09)

### 1. Privacy: Sentry starts on every launch
- `App.tsx:1` is `// @ts-nocheck`. `App.tsx:8-25` calls `Sentry.init` with a hard-coded DSN,
  `sendDefaultPii: true`, `enableLogs: true`, `replaysSessionSampleRate: 0.1`,
  `replaysOnErrorSampleRate: 1` and `integrations: [mobileReplayIntegration(), feedbackIntegration()]`.
  `App.tsx:31` wraps the app in `Sentry.wrap`. The Sentry wizard added it in a5e4cf8.
- That goes around the opt-in path: `services/telemetry/crash.ts:52-66` `initCrashReporting(enabled, dsn = EXPO_PUBLIC_SENTRY_DSN)`
  (`sendDefaultPii: false`, no screenshots, scrubbed breadcrumbs and events), started late by
  `AppNavigator`'s `useDeferredBoot`. AGENTS.md: "Telemetry is opt-in only; never send document
  content." Session replay records the screen, so it would send scanned pages.
- The same commit committed 129 build files under `modules/pdf-native/android/build/` (`.dex`,
  `results.bin`).

### 2. Boot sequence (until the first usable screen)
1. **Bundle load:** `index.ts` → `App`. Everything `App` imports runs before the first frame: all 16
   screens (`bootstrap/AppNavigator.tsx:16-39`), including the dev-only FilterLab (`:39`, `:86`). Through them
   come pdf-lib (its `@pdf-lib/standard-fonts` decompresses every encoding at load),
   react-native-pdf-jsi (with crypto-js and blob-util), webview, Reanimated, papaparse and the i18n catalog.
   `Notifications.setNotificationHandler` runs at module scope (`store/useDeadlines.ts:15`).
2. Even with lazy screens, boot-path code pulls in heavy libraries:
   - the filter registry (all filters and their Skia shaders), through `services/persistence/settingsStorage.ts:4`,
     which imports `FILTERS` from `enhance/filters/registry.ts`. (Skia itself is needed at boot since
     §15 V5: `components/brand/SplashIntro.tsx` draws the intro with it, so it stays.)
   - pdf-lib, through `useLibraryPersistence` → `pdfInfoBackfill` → `pdfService.ts`;
   - pdf-lib, through `useExternalFileLinking` → `externalFileService.ts:3`.
3. **`FontGate`** (`bootstrap/AppProviders.tsx:11-16`, wrapped at `:24-28`) sits **above**
   `AppStateProvider`, `RouterProvider` and `AppNavigator`. No data loading starts until the 5 fonts
   (`theme/typography.ts:26-29`) have loaded at runtime.
4. **AppNavigator mounts** with a blank view, and its effects start:
   - `getDb()` (`persistence/dbService.ts:13-24`) opens the database, sets `PRAGMA foreign_keys`, checks
     migrations, and reads AsyncStorage for the legacy import (`legacyLibrary.ts:149`) on every launch.
     There is no WAL.
   - `loadAll` (`libraryRepo.ts:222-231`) runs 9 sequential `SELECT *`, including every page's `ocr_text`
     and `ocr_json`. It `JSON.parse`s each page's word boxes (`:157-166`) and builds `buildSearchHaystack`
     per document (`:255`), all on the JS thread. Then 9 dispatches follow.
   - `backfillPdfInfo` follows at once, not deferred (`useLibraryPersistence.ts:55`). It opens PDFs with
     pdf-lib (`pdfService.ts:40-58` `inspectPdf` reads the whole file). A failed file is retried on every
     launch.
   - Alongside: `loadSettings` (about 30 dispatches), `loadSavedSignature`, `loadEntitlement`
     (SecureStore), `useAppLock`, `useLastNotificationResponse`.
5. `bootReady` → `replace(start)` → `setBooting(false)` → the start screen renders under §15 V5's
   `SplashIntro`, which released the native splash on its first frame and fades out once boot is done.
6. After the library loads: `pruneExternalOpens` (synchronous file-system calls,
   `externalFileService.ts:78-90`) and `getInitialURL`. A cold "Open with" parses the whole PDF with
   pdf-lib just to count pages (`externalFileService.ts:50-54`); `pdfNative.getPageCount` exists
   (`pdf/pdfNative.ts:34`).
7. 1.5 s later, `useDeferredBoot` runs: crash reporting, usage stats, Remote Config, reminder clean-up,
   imported-PDF indexing, the integrity check, auto backup and ads.

### 3. Navigation mounts screens twice
- `navigation/router.tsx` keeps one `screen` plus `previousScreen`, `hub` and `tabHub`; there is no stack.
  `backHandling.ts:48-77` hard-codes each screen's Back target (Settings → `hub`, Storage → `settings`,
  whoever opened them).
- `AppNavigator.tsx:284-300` renders the outgoing screen as an **unkeyed** conditional child before the
  incoming one. On `go()`, slot 1 swaps screen type, so the old screen unmounts and the new one mounts.
  Then the effect at `:263-274` sets `outgoing`, and a **fresh copy** of the old screen mounts in slot 0
  just to slide out for 240 ms (`navigation/transitions.ts:4`). That is 2 mounts and 2 unmounts per
  navigation. The remounted copy re-runs its mount effects: the Reader reopens and re-parses its file;
  Home and Library request a new banner (`components/ads/BannerSlot.tsx:14-38`).
- Every screen unmounts on leave, so Library and Course come back scrolled to the top with their filters
  reset (`LibraryScreen.tsx:55-59`, `CourseScreen.tsx:53-54,78`).
- `TabBar` is rendered by each tab screen (`components/shared/TabBar.tsx`), so it slides with the screen.

### 4. The root re-renders on everything
- `AppNavigator.tsx:112` subscribes to the whole `capture`, `library` and `settings` slices. It hosts
  hooks that subscribe to the whole `library` slice: `useLibraryPersistence.ts:19`,
  `useStorageIntegrity.ts:14`, `useImportedPdfIndexing.ts:18`, `useDeadlines.ts:26`.
- `ScreenFrame` (`AppNavigator.tsx:58`) and the screens aren't memoized. So every search keystroke
  (`LibraryScreen.tsx:219`), selection tap, scan progress tick (`ingestBatch.ts:121`) and indexed PDF page
  (`useImportedPdfIndexing.ts:44`) re-renders the navigator and the whole current screen.
- `appReducer.ts` `slicesReducer` (`:55-67`) always builds a new root object, so `AppStateContext.tsx:26`'s `next === state`
  never short-circuits, and every selector runs on every dispatch.
- `HomeScreen.tsx:61,70`: `Date.now()` in the `soon` memo's deps defeats it.
- `useAppState()` has no callers left.

### 5. Lists and images
- FlatList only; `@shopify/flash-list` isn't installed. Library and Course use `DOC_LIST_TUNING`
  (`components/library/docListTuning.ts:6-12`). Only `PageScrubberSheet.tsx:48` has `getItemLayout`.
  `ThumbnailStrip` is a ScrollView.
- Inline `renderItem` (`LibraryScreen.tsx:320-331`, `CourseScreen.tsx:300-308`) runs for every visible
  row on every render: `selection.includes`, `getMatchSnippet` (lower-cases every page's OCR text on each
  keystroke, `services/search/searchService.ts:13-27`) and `courseColorOf`.
- Each `FileRow` render builds about 3 new `Intl` objects (`i18n/index.ts:112,181,190,197-205`,
  `utils/format.ts:8-19`), which is slow in Hermes.
- RN `Image` everywhere; `expo-image` isn't installed. Without a 400 px thumbnail, rows fall back to the
  2400 px master: `FileRow.tsx:59`, `EditPagesModal.tsx:62`, `PagePickerModal.tsx:77`,
  `PageResults.tsx:85`, `BookmarkList.tsx:37`, `SortUnsortedSheet.tsx:71`, `ExamPackScreen.tsx:130`.
- Review: `PagePeekCarousel.tsx:145,161` shows neighbouring masters while Skia prefetches the same pages
  (two decodes). `previewImageCache.ts:41-61` does a full decode plus a GPU → CPU copy on the JS thread.

### 6. Heavy work on the JS thread
- Review sliders: `AdjustSlider.tsx:41-44` calls `runOnJS` every frame → `setLiveAdjust`
  (`ReviewScreen.tsx:92,130,710`). The 921-line screen re-renders and re-records the picture each frame.
- Scanning: pages appear only after the whole batch (`ingestBatch.ts:116-130`). OCR (`ingest.ts:44`) and
  Skia stats (`:46`) run inline per page.
- Deliver renders each page twice (`skiaEnhance.ts:38-64`, synchronous decode + JPEG encode) and re-runs
  OCR on every page (`DeliverScreen.tsx:213-216`) even when only the filter changed.
- Imported-PDF indexing dispatches per page and commits the full page list every 10 pages
  (`importedPdfIndex.ts:27`). The sync then deletes and re-inserts every page with FTS triggers
  (`libraryRepo.ts:493-523`): quadratic for a 300-page PDF.
- `libraryRepo.ts:575-577` deletes one row at a time; `:712-722` runs the full 8-array diff on every
  change.
- "Copy to device folder" sends the whole PDF through JS as base64 (`deviceExportService.ts:39-41`).
  The streaming `saveFileToFolder` in the same file (`:86-115`) is already there.
- `buildPdfFromPages` keeps every page's JPEG bytes in the JS heap until save (`pdfService.ts:255,524`).
- (Reader-specific items, such as parsing XLSX/DOCX on every mount and Mark mode's pdf-lib save, are
  in §18.)

### 7. Build
- On: Hermes and the New Architecture (`app.json`, `gradle.properties`).
- Off: R8 and resource shrinking (no `expo-build-properties`; the generated `android/app/build.gradle`
  defaults to false); the React Compiler.
- `metro.config.js` is 21 lines and clean; there's no `babel.config.js`.
- `expo-blur` has 0 imports. `react-native-view-shot` is used in 1 file (`signature/signatureService.ts:3`).
- react-native-pdf-jsi calls `console.log` on every native event in release builds. That goes away
  with §18 W18.

---

## G1 · Privacy hotfix: one opt-in Sentry path *(S)*
Status: done in code (2026-10-09). JS only. Open: Verification 1 on a release-like build, and the
owner rotates the DSN (below).

As built:
- `App.tsx` is a plain, typechecked `export default function App()`: no `@ts-nocheck`, no Sentry
  import, `Sentry.init` or `Sentry.wrap`. `holdSplash()` stays at module scope. A comment says why
  Sentry isn't there, so a second run of the Sentry wizard stands out in review.
- `crash.ts`: a comment only (the only place Sentry starts; replay, screenshots, the view hierarchy
  and `sendDefaultPii` stay off). Its options were already right.
- Nothing native starts Sentry either: the SDK's Android manifest sets `io.sentry.auto-init` to
  false, and `app.json`'s `@sentry/react-native/expo` plugin doesn't set `useNativeInit`. The two
  Sentry entries in `app.json` and `getSentryExpoConfig` in `metro.config.js` are build-time only
  (source map upload and debug IDs), so they stay.
- `sentryInit.test.ts` scans every `.ts`/`.tsx`/`.js` file from the repo root (skipping native
  projects, build output, `node_modules`, docs and tests, which mock Sentry). Beyond the plan, it
  also checks that only `crash.ts` imports `@sentry/react-native` itself (not its `/metro` or
  `/expo` helpers), so a named `init` import can't get around the `Sentry.init(` check. Run against
  the old `App.tsx`, 7 of its 8 checks fail.
- `.gitignore` has `modules/*/android/build/` and `modules/*/ios/build/`. The 129 files under
  `modules/pdf-native/android/build/` are untracked (`git rm --cached`; still on disk for local
  builds).
- **Owner, still open:** the DSN `App.tsx` carried is public in the repo's history (a5e4cf8 onward).
  Rotate it in Sentry (Settings → Client Keys), put the new one in the EAS variable
  `EXPO_PUBLIC_SENTRY_DSN`, and check the Sentry project for replays or events from before this fix.

Goal: crash reports start only when the student opts in, with no session replay and no PII. The repo
stops tracking build output.

Files: `App.tsx`, `services/telemetry/crash.ts` (comment only), `.gitignore`,
`modules/pdf-native/android/build/` (untracked), new `src/services/telemetry/__tests__/sentryInit.test.ts`.

Changes:
- `App.tsx`: remove `// @ts-nocheck`, the `Sentry` import, `Sentry.init(...)` and `Sentry.wrap`. Keep
  `holdSplash()` at module scope and export a plain `App`. The ErrorBoundary in `AppProviders` already
  reports through `reportCrash`.
- `crash.ts`: unchanged behaviour. Add a comment that it is the **only** place Sentry starts (§16 G1),
  and that replay, screenshots and `sendDefaultPii` stay off because pages are student documents.
- Keep the dev "Send test error" row (a5e4cf8); it already goes through `crash.ts`.
- `.gitignore`: add `modules/*/android/build/` and `modules/*/ios/build/`. Then
  `git rm -r --cached modules/pdf-native/android/build`.
- **Owner:** the DSN that was committed is public in the repo's history. Rotate it in Sentry (Settings →
  Client Keys) and put the new one in the EAS variable `EXPO_PUBLIC_SENTRY_DSN`.

Tests: `sentryInit.test.ts` (a source scan like `hardcodedStrings.test.ts`). `Sentry.init(` appears only in
`services/telemetry/crash.ts`. No source file contains `mobileReplayIntegration`, `replaysSessionSampleRate`,
`replaysOnErrorSampleRate` or `sendDefaultPii: true`. `App.tsx` has no `@ts-nocheck`.

Device check: Verification 1.

## G2 · Router v2: a back stack, kept instances, a persistent tab bar *(M)*
Status: done in code (2026-10-10). JS only. Open: Verification 2–3 on a device, and the iOS check
below.

As built:
- **Hiding: `display: 'none'`, not `<Activity>`.** RN 0.86's Fabric renderer supports Activity, but a
  hidden Activity unmounts its effects and runs them again when shown. The screens reset state in
  effects: `useReaderDocument`'s per-file reset (`[contentKey]`) would set the page count to 0 under a
  PDF that's still open after only Reader → Pro → Back. So hidden layers keep their effects running,
  and what must only happen on screen asks `useScreenRole()`: `useBackHandler` (an overlay left open
  on a hidden screen doesn't take Back), `useHint` (a hidden screen can't use up a hint),
  `useReportBottomBar` (only the active screen's bar counts for the Snackbar; it re-reports its last
  height when shown, since a hidden view gets no new onLayout), `BannerSlot` (requests only while
  active, keeps its ad while hidden), Capture's light `StatusBar`, and the Reader's keep-awake.
  On Android, Fabric makes a `display: 'none'` view INVISIBLE and keeps its native children laid out
  (`useTraitHiddenOnAndroid` is off in RN 0.86), so scroll positions and a loaded banner survive.
  **iOS** culls hidden views: check there that scroll positions come back.
- `navigation/navStack.ts` (pure): `{ tab, stacks, prevTab }`; `TABS` is the one tab list (order =
  the tab bar's). Root entries have fixed keys (`root:<tab>`), so a reset gives back the same mounted
  root. Beyond the plan:
  - **one instance of a screen per stack**: pushing a screen that's lower down drops it and what's
    above it, then pushes a fresh one. The Reader and a course page show the store's current
    `readerId` / `activeCourseId`, so a hidden older copy would show the new document. Pushing the
    screen already on top does nothing (an "Open with" file re-renders the Reader in place, as before);
  - `resolveGo` is the router's `go` as a pure function: a tab root on its own tab = back to the root;
    on another tab = a **jump** that leaves both tabs at their roots (Scan from a course page, the
    Library after a save, Home after the introduction: what was open there is over) and cross-fades;
    `'back'` to a screen on the stack = `popTo`; **course/reader/examPack from the Scan tab go to
    `prevTab`** (a saved scan lands on its course page in Home or Library, and Back goes to that
    tab's root, as before), the Scan tab starting at Capture again (until §17 U5);
  - the tab bar uses `switchTab` (keeps each stack; a second tap resets). Today it's only shown on
    roots, so the kept stacks matter from §17 U5 on.
- `router.tsx`: `go`, `go(to, 'back')`, `screen`, `replace` and `navTick` kept; new `back()`,
  `switchTab(tab)`, `tab`, `nav` and `transition` (`{ kind, dir, from }`). `previousScreen`, `hub`,
  `tabHub`, `detourFrom` and `HubScreen`/`TabHub` are gone: every screen Back button that used them
  (Settings, Reader, Course, Pro, Exam pack, Academic options, and Storage/Backup/Manage
  courses/Filter lab, which went to Settings) calls `back()`. Deliver's `go('review', 'back')`, Review's
  `go('capture', 'back')` and the cover target's `go(from, 'back')` stay (they resolve to `popTo`).
- The layers live in `navigation/ScreenStack.tsx` (AppNavigator renders `<ScreenStack screens={SCREENS} />`
  under `AppLockGate`; the screen map is a prop so the render test can pass mocks): the **shell**
  (visited tab roots + the one `TabBar`) and the active tab's pushed entries, each a memo'd keyed
  layer. Root ↔ root moves the two roots inside a still shell; any other transition moves the outer
  layers, the shell standing in for a root. Inactive tabs' pushed entries aren't mounted (only a
  content push from the Scan tab leaves any). `progress` rests at 0 so a transition's first frame
  already draws both layers where they start; every layer keeps `RESTING_STYLE` under its animated
  style (a layer can fade once and slide later).
- `TabBar` takes no props: the shell renders it under the roots (hidden with the shell under a pushed
  screen, absent while the Library is selecting), with Capture's chrome on the Scan tab
  (`captureChromeStatic.tabBar`). Home, Library and Capture dropped theirs; `safeArea.test.ts`'s
  allowlist now names `BannerSlot` / `SelectionBar`.
- `backHandling.resolveBack` gets `tab` and `canPop` instead of the hubs and returns a new `pop`
  step. Fixed targets: Review → Capture, Deliver → Review, Academic options → `coverTarget.from`.
  Onboarding alone on its stack (the first-run boot screen) exits.
- `useCoverTarget`: a Replace made from the Reader opens a fresh Reader (`go('reader')`), because the
  kept one still has the old file open at the same path.
- Tests: `navStack.test.ts`, `backHandling.test.ts` (rewritten: Capture → Settings → Back, the
  low-space guard's Storage, the start tab, the discard confirm, the first-run introduction),
  `router.test.tsx` (rewritten), `ScreenStack.test.tsx` (mocked screens: one mount each across
  push → pop and tab switches, the leaving screen kept until its slide ends, roots mounted only once
  shown, one tab bar).
- Hidden screens still re-render on store changes (Activity would have deferred that). G5's
  re-render work matters more now that Home and Library stay mounted.

Goal: Back goes to where you came from, lists keep their scroll and filters, and no navigation ever
remounts a screen. The shell is ready for §17 U5's tabs.

Files: `navigation/router.tsx`, new `navigation/navStack.ts` (pure), `navigation/backHandling.ts`,
new `navigation/screenRole.ts`, `bootstrap/AppNavigator.tsx`, `navigation/transitions.ts`,
`components/shared/TabBar.tsx`, the tab screens (stop rendering their own `TabBar`), `types/navigation.ts`,
`components/ads/BannerSlot.tsx`, tests.

Changes:
- **`navStack.ts`** (pure, tested): the state is `{ tab: TabId; stacks: Record<TabId, Entry[]> }`, with
  `Entry = { key: string; screen: ScreenName }` (key from `createId`). Actions:
  - `push(screen)`, `pop()`, `switchTab(tab)` (keeps each tab's stack, like Google Files),
    `replace(screen)` (boot), `popTo(screen)`, and `resetTab(tab)`. A second tap on the active tab resets
    it to its root.
  - Detours (`pro`) are ordinary pushes, so `detourFrom` goes.
  - Today's tabs are `home | library | capture`. §17 U5 changes the set to `home | files | tools | me`, so
    keep the tab list in one constant.
- **`router.tsx`** keeps its public API so the many `go()` calls don't change:
  - `go(to)` = `switchTab` when `to` is a tab root, else `push`;
  - `go(to, 'back')` = `popTo(to)` when `to` is on the stack, else `push` with a back transition;
  - new `back()` = `pop`.
  - `previousScreen`, `hub` and `tabHub` are derived from the stack for the screens that still read them.
    Remove them once no caller is left; grep `previousScreen`, `hub`, `tabHub`.
- **`AppNavigator`** renders, under `AppLockGate`:
  - every tab's **root**, mounted once it's been visited and hidden while inactive;
  - the active tab's stack entries above it, each a keyed layer `<ScreenLayer key={entry.key}>`.
  - The slide moves the *existing* layers: the leaving one stays mounted until the slide ends, then it is
    removed (pop) or hidden (tab switch).
  - Hidden tab roots: try React 19.2 `<Activity mode="hidden">` first (effects pause; state is kept). Check
    on a device that Fabric hides the subtree; if it doesn't, use a `View` with `display: 'none'` around a
    `memo`'d root.
  - Pushed entries below the top stay mounted too (scroll position survives), capped at 6 per tab, the
    oldest dropped.
  - Keep §15 V5's `SplashIntro` (+ its boundary) as the root's last child, outside the layers and the
    `booting` switch (`AppNavigator.tsx:309-316`), so the intro is never remounted.
- **`screenRole.ts`**: `ScreenRoleContext` + `useScreenRole(): 'active' | 'hidden' | 'outgoing'`. Each
  layer provides it.
  - `BannerSlot` requests an ad only while `active`, and keeps its ad while hidden (no new request on a
    tab switch).
  - §18 W5 uses the role so only the active Reader loads and saves its position.
- **The tab bar** is rendered once by the shell, below the layers, only when the top entry is a tab root.
  It reports its height through the existing `bottomBarHeight` mechanism (`useReportBottomBar`), so §14
  Q3's insets keep working. The tab screens drop their own `<TabBar>`.
- **`backHandling.resolveBack`** keeps its order: sheet → selection/search → screen → exit. "Screen" now
  means `pop()` when the stack has more than its root. On a root it means: go to Home if another tab is
  active, otherwise exit, with the scan-in-progress confirm kept (`confirmDiscard`). The per-screen
  `backTarget` table shrinks to the special cases:
  - Review → Capture (until §17 U5 removes Capture);
  - Academic options' `coverTarget.from`;
  - Deliver → Review.
- Transitions: push and pop slide (the existing 240 ms; a cross-fade under reduced motion). Tab
  switches cross-fade in 150 ms, because the tabs are siblings, not a hierarchy (§17 U13 tunes this).

Tests:
- `navStack.test.ts`: push and pop, switching tabs keeps each tab's stack, a second tap resets, `popTo`, the
  per-tab cap, `replace` at boot.
- `backHandling.test.ts` (updated): Settings opened from Capture goes back to Capture; Storage opened from
  the low-space guard goes back to the screen that opened it; the root exits; the scan-discard confirm.
- A render test with the jest renderer and mocked screens: a screen's mount count stays 1 across
  push → pop and across tab switches.

Device checks: Verification 2–3.

## G3 · Boot diet: load screens and heavy libraries on first use *(M)*
Status: done in code (2026-10-10). JS only. Open: Verification 4 on a device (cold start against
G9's baseline), the reminder check below, and the first-open cost of Reader, Review and Deliver.

As built:
- **Lazy screens.** `navigation/lazyScreens.ts`: `lazyScreens(loaders)` turns AppNavigator's
  `{ review: () => require('../screens/ReviewScreen').ReviewScreen, ... }` into a `ScreenMap` whose
  properties are getters. A loader runs on the first read (ScreenStack reads a screen when its layer
  first renders) and the component is kept, so the memo'd layers always get the same one.
  `ScreenStack` and its test didn't change. Each `require` is cast to `typeof import(...)`, so a
  wrong export name fails the typecheck. `filterLab` is `__DEV__ ? loader : () => NoScreen`; Expo's
  Metro worker folds `__DEV__` before it collects requires, so the Filter Lab isn't in a release
  bundle (checked in an exported bundle).
- **The plan's file list wasn't enough: the store itself loaded pdf-lib.** `store/appReducer` →
  `deliverSlice` → `submit/preset` → `sizeTarget` (pdfService, and skiaEnhance → the filter registry)
  and → `pdf/coverTemplates` → `visibleText` (pdf-lib; it builds Helvetica's metrics at module scope).
  Fixed at the two edges: new `submit/sizeFormat.ts` holds `MB` and `formatLimit` (sizeTarget
  re-exports them; `preset` and `useSubmitDocument` import them from there), and `coverTemplates`
  requires `visibleText` on the first `measureText` / `helveticaWidth` call (both keep their names
  and signatures).
- **Boot hooks.** `pdfInfoBackfill`: the default `inspect` requires pdfService only when a document
  needs reading. `externalFileService`: a local `pdfLib()`. `useExternalFileLinking`: requires
  libraryOperations inside `openUri`. `convertTask`: the two runners are still registered at import
  (ProTaskResumeHost didn't change), and each requires its converter when a task runs.
- `enhance/filters/filterIds.ts`: `FILTER_IDS` (picker order) and `AVAILABLE_FILTER_IDS`;
  `settingsStorage.sanitizeDefaultEnhance` reads them, `registry.ts` re-exports them, and
  `filters/__tests__/filterIds.test.ts` fails if the registry and the list drift apart.
- **Beyond the plan: the start screens are kept clean too.** A lazy screen map doesn't help the start
  screen: it's required during boot. Home (and the Library) reached pdf-lib through three hooks:
  `useDocumentListActions` → libraryOperations, `useCoverTarget` → addCover, `useSubmitDocument` →
  submitDocument / history / sizeTarget. Each now requires its service inside the action (merge,
  split, compress, sign, add a cover, submit, share again). Without this, pdf-lib would have loaded
  with Home's first render and the step would have gained little.
- `useDeadlines.configureNotifications()` (runs once) holds `setNotificationHandler`; AppNavigator
  calls it in an `afterBoot` effect. **Check on a device:** a reminder that fires in the first ~2 s of
  a cold start with the app open isn't shown as a banner. If that matters, call it from the first
  effect instead.
- Metro `inlineRequires` is not turned on (it waits for G9's numbers); `metro.config.js` didn't change.
- **Test:** `src/__tests__/bootImports.test.ts` parses files with the TypeScript compiler (so a
  comment or a string can't count, type-only imports are skipped, and a `require` inside a function
  is lazy). Roots: `index.ts`, and each screen `chooseStartScreen` can return (Home, Capture,
  Onboarding), whose files it reads from AppNavigator's `lazyScreens({...})`. It fails, with the import
  chain, on `pdf-lib`, `xlsx`, `mammoth`, `react-native-webview`, `react-native-pdf-jsi` or
  `filters/registry.ts`; the allow-list is empty. It's a little stricter than Babel: an `import { X }`
  used only as a type counts, so write `import type`. Also `navigation/__tests__/lazyScreens.test.ts`.
- **Measured on the bundle, not on a phone** (`npx expo export --platform android --no-minify
  --no-bytecode`, then the modules reachable from the entry points through top-level requires):

  | | Modules run at startup | Their source |
  |---|---|---|
  | Before (bb4dbf2), any start screen | 2,301 of 3,078 | 12.1 MB of 16.5 MB |
  | After, Home | 1,854 | 9.0 MB (−25%) |
  | After, Capture | 1,751 | 8.6 MB (−28%) |
  | After, Onboarding | 1,705 | 8.5 MB (−30%) |

  pdf-lib, `@pdf-lib/standard-fonts`, react-native-webview, react-native-pdf-jsi, papaparse, the filter
  registry, pdfService and libraryOperations no longer run at startup (SheetJS and mammoth already
  didn't). Source size is only a proxy for time: Verification 4 is still the test.
- **The cost moved; measure it in G9.** The first open of the Reader (pdf-jsi, WebView), Review or
  Deliver (pdf-lib) now evaluates those modules during that navigation, once per run. If the first
  open stutters, load the likely next screen after `useDeferredBoot` (reading `SCREENS.reader` is
  enough to load it).

Goal: the first frame loads only what the start screen (and §15 V5's splash intro) needs. pdf-lib, xlsx,
mammoth, the filter registry and the other screens load when they're first used.

Files: `bootstrap/AppNavigator.tsx` (`SCREENS`), new `services/enhance/filters/filterIds.ts`,
`services/persistence/settingsStorage.ts`, `services/documents/pdfInfoBackfill.ts`,
`services/files/externalFileService.ts`, `services/pdf/pdfService.ts` consumers on the boot path,
`store/useDeadlines.ts`, new `src/__tests__/bootImports.test.ts`.

Changes:
- `SCREENS` becomes a map of **synchronous lazy getters**:
  `review: () => require('../screens/ReviewScreen').ReviewScreen`. Each is read once when the screen
  first renders and then cached. The router stays synchronous; no `React.lazy` and no Suspense flash.
  `filterLab` is added only under `__DEV__`.
- `filterIds.ts`: the filter id list and defaults, with no import of the filter registry or Skia. `settingsStorage.ts` and anything
  else on the boot path import it instead of `registry.ts`. `registry.ts` re-exports the ids so that
  nothing else changes.
- pdf-lib as a lazy require on the boot path, like `sheetService`'s `XLSX()` (with a
  `function pdfLib() { return require('pdf-lib') as typeof import('pdf-lib'); }` helper):
  `externalFileService.ts`, `pdfInfoBackfill.ts`, and every `pdfService` import reached from boot hooks.
  The imports stay as they are in services only reached after a user action.
- `useDeadlines.ts`: move `Notifications.setNotificationHandler` into a `configureNotifications()` that
  deferred boot calls once. A notification that arrives in the first 1.5 s still shows: the default
  handler shows nothing in the foreground, so check on a device that this doesn't matter. If it does,
  call it from the first effect instead.
- Optional, measure first: Metro `inlineRequires` (`transformer.getTransformOptions`). It changes
  module order app-wide, so only turn it on if G9 shows a real gain, and then run the whole walkthrough.
  Any `metro.config.js` change must be reviewed for hidden code (AGENTS.md security rule).

Tests: `bootImports.test.ts` walks the static import graph from `App.tsx` with a small resolver over
`src/`. It **fails** if a module reached at boot imports `pdf-lib`, `xlsx`, `mammoth`, `react-native-webview`,
`react-native-pdf-jsi` or `services/enhance/filters/registry.ts`. Skia is allowed (the splash intro
needs it). Lazy `require` inside functions doesn't
count. The allow-list is empty, so a new static import breaks the test. Existing tests stay green.

Device check: Verification 4 (cold start, against the `docs/qa/performance.md` baseline).

## G4 · Boot waterfall: data before fonts, less work in `loadAll` *(M; needs a new dev build)*
Status: done in code (2026-10-10). **Needs a new dev build** (`npx expo prebuild`, then rebuild) for the
embedded fonts; the JS works in the current dev build (it loads the fonts at run time, as before). Schema
is now **v17**. Open: Verification 4–5 on a device, and the font check after the new build.

As built:
- **Fonts.** `app.json`: the `expo-font` plugin gets `android.fonts` with the five files from
  `node_modules/@expo-google-fonts/{caprasimo,figtree}/…` (SDK 57 docs and the plugin source: on
  Android the file name is the family name, and the files are named exactly like `fontFamily`'s
  values). `useAppFonts` didn't change: `useFonts` starts out `loaded` when every family is already
  registered natively, so an Android build with the fonts has them on the first render; Expo Go, the
  web and an older dev build load them at run time as before. **Android only:** on iOS an embedded
  font is named by the font file's own name ("Figtree-Regular"), not ours, so embedding there would
  only add dead files; iOS keeps the runtime load. `theme/__tests__/embeddedFonts.test.ts` fails if
  `fontFamily` and app.json's list drift (on a phone that would only be a silent fallback to the
  runtime load). `npx expo config` shows the plugin options are in the resolved config.
- **FontGate is gone, not moved.** Moving it below the providers (the plan) wouldn't have helped: the
  boot hooks live in `AppNavigator`, which would still have been its child. `AppNavigator` calls
  `useAppFonts()` itself and waits for the fonts in `bootReady`, next to the settings and the library,
  so the hooks start on the first render and no screen draws text before the fonts are in. (G5's
  `BootEffects` can take the hooks from there.) The 3 s `SPLASH_TIMEOUT_MS` still shows the app if
  anything hangs.
- **Module scope.** `App.tsx` calls `warmDb()` (`dbService`: starts `getDb()`'s memoised open) and
  `warmSettings()` (`settingsStorage`: one read that the boot's first `loadSettings()` takes; later
  calls, such as a backup's, read again). The library load itself still starts in
  `useLibraryPersistence`'s effect, on the promise that is already running.
- **Legacy import.** Migration **v17** adds a `meta` key/value table (`persistence/meta.ts`,
  `getMeta`/`setMeta`). `importLegacyLibraryIfPresent` returns at once when `legacyImportDone` is set,
  and sets it last, after an import or after finding nothing; a failed import leaves it unset and is
  tried again. `meta` isn't in backups (it describes this phone's file).
- **`loadAll` without `ocr_json`.** The pages query names its columns and selects
  `ocr_json IS NOT NULL AS has_boxes` instead of the JSON. A page with stored boxes loads as
  `{ text, blocks: [], blocksRow: <its page id> }` (new optional `PageOcr.blocksRow`: "the boxes are
  still in the database, in this row").
  - **Reading them:** `libraryRepo.loadPageOcr(db, pages)` (it takes the pages, not a document id, so
    it also works for a copy whose own row isn't written yet) and `documents/pageOcr.ts`
    `withPageBlocks(pages)`, which reads between library writes (`withWriteLock`). Called in **one
    place per consumer kind** instead of at every entry point: `pdfService.buildPdfFromPages` and
    `rasterPdf.buildRasterPdf` load the boxes of the pages they're given (so merge, split, compress,
    sign, submit, add cover, exam pack and Edit pages need nothing; `toSourcePage` now passes the
    page id), `toDocx.readPagesText` does for Convert to Word, and the Reader's
    `components/reader/usePageOcr.ts` dispatches `library/SET_PAGE_OCR` for Select text and Mark
    mode's snap-to-word. `SET_PAGE_OCR` only fills pages that are still waiting.
  - **Writing (the part the plan didn't spell out):** every page save deletes and re-inserts the
    document's page rows, so a page whose boxes were never loaded would have been written back
    without them. `syncLibrary` (and `upsertDocuments`, `insertIfMissing`) first reads the stored
    JSON of such pages, **before any delete**, and writes it back unchanged. It looks in the page's
    own row first, then in the row `blocksRow` names: `copyPageInto` gives a copy a new id while its
    boxes are still in the original's row, and the original may be deleted later.
  - **Loading boxes is not a change.** `SET_PAGE_OCR` makes a new `pages` array; without care the
    sync would rewrite every page of every document the Reader opens and move `updated_at` (which
    backups compare). `libraryRepo` remembers the OCR objects it loaded (a `WeakSet`), and a document
    that differs from the stored one only by them is skipped; `documentEdited` ignores it too.
  - Not converted, on purpose: anything that only reads `ocr.text` (search snippets, Copy text,
    titles) - the text is still loaded.
- **`searchHaystack` is removed from `LibraryDocument`.** Not every search goes through FTS: the
  Library filters in memory while the FTS query is on its way (and if it fails). `searchService`
  now builds that text on the first search, per document object, in a `WeakMap`. The ~20 places that
  built it by hand (Deliver, merge/split, page edits, add cover, exam pack, text edit, the reducer's
  `UPDATE_FILE`) no longer do. `getMatchSnippet` didn't change (it reads `ocr.text`).
- **PRAGMAs.** `journal_mode = WAL` and `synchronous = NORMAL` with `foreign_keys` in the one `execAsync`
  after the open. Nothing copies `pdfscan.db`: backups read rows through the same connection
  (`backup/format.ts`), restores write under `withWriteLock`, and Android's backup takes the whole
  `SQLite/` folder, log file included (`plugins/withBackupRules.js`). So there is no checkpoint call.
- **Backfill.** `store/usePdfInfoBackfill.ts` runs it from `AppNavigator` with `libraryAfterBoot`,
  once per library load; `useLibraryPersistence` no longer does. `pdfInfoBackfill` reads the page
  count and the last page's size with `pdfNative` (pdf-lib only in a build without the module). An
  unreadable PDF gets `pdfInfoFailed` (new column `documents.pdf_info_failed`, v17; not an edit; reset
  in a backup's export) and isn't opened again. **A missing file is skipped, not marked**, so it is
  read when it comes back (a restore). pdfium's sizes have `/Rotate` applied and pdf-lib's don't; that
  can't matter here, because a document without `pdfLayout` was built before pages could be turned.
- **External open:** §18 W3 landed it first (`getPageCount`, `undefined` on any failure). Checked.
- **Deletes:** `deleteRows` runs `DELETE … WHERE id IN (…)` per 500 ids.
- **Dev seeder:** the Filter Lab has "Seed with word boxes" (`seedLibrary(…, { wordBoxes: true })`)
  for Verification 5: seed once without and once with, and compare cold starts.
- **Measured in Node, not on a phone** (the sqlite test mock; 500 documents × 4 pages × 250 words,
  median of 7): with word boxes the library holds 52.6 MB of `ocr_json` and 3.6 MB of text. The old
  load (every column, each page parsed, the search text joined) took **132 ms**; `loadAll` now takes
  **6 ms**, the same as for the library without boxes (5 ms). A phone is several times slower and
  also copies those strings across JSI, so the old figure there is seconds; Verification 5 is the
  real test.
- **Left for G7:** imported-PDF indexing still saves the whole page list every 10 pages. For a
  document resumed after a restart, each of those saves now also reads back the boxes of the pages
  indexed earlier. G7's incremental writes remove both.
- **Tests:** `libraryRepo.test.ts` (the load's SQL has no `ocr_json`; `loadPageOcr`; boxes survive a
  reorder, a copy under a new id whose original is then deleted, and a merge; loading boxes opens no
  transaction and keeps `updated_at`; batched deletes; the failed mark), `documents/__tests__/
  pageOcr.test.ts` (a PDF built from a just-loaded document still has its text layer: it fails
  without the call in `buildPdfFromPages`; Convert to Word), `pdfInfoBackfill.test.ts` (native
  reader; `pdfService` is mocked to throw on load), `legacyImport.test.ts` (one AsyncStorage read per
  database; a failed import isn't marked), `settingsWarm.test.ts`, `search/__tests__/
  searchService.test.ts`, `librarySlice.test.ts` (`SET_PAGE_OCR`), `embeddedFonts.test.ts`.
  `bootImports.test.ts` passes unchanged.

Goal: the database and settings start loading in the first millisecond, the library load doesn't grow
with OCR data, and nothing PDF-heavy runs before the first screen.

Files: `app.json` (`expo-font` plugin), `bootstrap/AppProviders.tsx`, `theme/typography.ts`,
`services/persistence/{dbService,libraryRepo,legacyLibrary}.ts`, `store/useLibraryPersistence.ts`,
`services/documents/pdfInfoBackfill.ts`, `services/files/externalFileService.ts`, `bootstrap/useDeferredBoot.ts`, tests.

Changes:
- **Fonts:** read the SDK 57 `expo-font` docs first (config plugin `fonts` option). Embed Caprasimo and
  Figtree from `@expo-google-fonts/*` at build time, with family names equal to the `fontFamily` values in
  `typography.ts`. `useAppFonts` then returns ready at once on native builds; keep the runtime load as the
  fallback for Expo Go and web. `FontGate` moves **inside** `AppStateProvider` and `RouterProvider`, so
  data loading never waits for fonts. Review the `app.json` diff for long lines (security rule).
- **Start I/O at module scope:** `dbService.ts` exports `warmDb()`, called from `App.tsx` next to
  `holdSplash()`; `getDb()` returns the same promise. Do the same for the settings read
  (`settingsStorage.loadSettings`).
- `legacyLibrary.importLegacyLibraryIfPresent`: once the import has run (or found nothing), record that
  in `PRAGMA user_version` or a meta row, and skip the AsyncStorage read after that.
- **`loadAll`:** select page rows **without** `ocr_json`. Word boxes load per document on demand, through
  a new `libraryRepo.loadPageOcr(docId)` plus a `library/SET_PAGE_OCR` action, the first time the Reader,
  Select text, PDF building or Convert to Word needs them. Grep `.ocr.` and `blocks` to find every
  consumer, and give each one an `await ensurePageOcr(doc)` first. `searchHaystack`: drop it if every
  search goes through FTS (`searchDocumentsByText`, `dbService.searchPages`); otherwise build it lazily on
  the first search. Check `getMatchSnippet`'s needs (G6 precomputes the snippets).
- **PRAGMAs:** `journal_mode = WAL` and `synchronous = NORMAL` once, after the open. Check that backup's
  `withWriteLock` and the zip export read a consistent database. Checkpoint before a backup reads the
  file, if the backup copies the `.db` file directly.
- **Backfill:** `backfillPdfInfo` moves into deferred boot and uses `pdfNative.getPageCount/getPageSize`
  (`pdf/pdfNative.ts`). Fall back to pdf-lib only where the native module is missing. A failed file is
  marked (a `pdfInfoFailed` flag on the patch) and not retried each launch.
- **External open:** `externalFileService.ts:50-54` uses `pdfNative.getPageCount` (`undefined` on
  ENCRYPTED or unavailable). §18 W3 does the same; whichever lands first does it, the other checks it.
- **Deletes:** `libraryRepo.ts:575-577` deletes in one `DELETE … WHERE id IN (…)` per table, in batches
  of 500.

Tests: `libraryRepo` with the sqlite mock: `loadAll` doesn't select `ocr_json`, `loadPageOcr` returns the
blocks, and the batch delete. `pdfInfoBackfill` with the `pdfNative` mock (no pdf-lib parse). The
legacy import's skip flag. The ratchet in `bootImports.test.ts` still passes.

Device check: Verification 4–5. After `npx expo prebuild --clean` and the new dev build, check that every
screen still shows Caprasimo and Figtree.

## G5 · Re-render hygiene *(M)*
Status: done in code (2026-10-10). JS only. Open: Verification 6 on a device (the render counts).

As built:
- **`libraryUi` slice** (`store/slices/libraryUiSlice.ts`): `selection`, `selMode`, `tab`, `search`,
  `searchOpen`, `searchResultIds`, `indexing`, and the three other UI-only fields of `library`,
  `activeCourseId`, `homeSemesterId` and `highlightDeadlineId` (otherwise `SET_TAB`, opening a
  course and a tapped reminder would still change `library`). Their actions are now `libraryUi/…`
  (`TOGGLE_SELECTION`, `SET_SEL_MODE`, `CLEAR_SELECTION`, `SELECT_ALL`, `SET_TAB`, `SET_SEARCH`,
  `TOGGLE_SEARCH_OPEN`, `SET_SEARCH_RESULT_IDS`, `SET_INDEXING`, `SET_ACTIVE_COURSE`,
  `SET_HOME_SEMESTER`, `SET_HIGHLIGHT_DEADLINE`). The slice also follows `library/REMOVE_FILES`,
  `REPLACE_FILES`, `DELETE_COURSE` and `DELETE_DEADLINE` (a deleted document leaves the selection,
  and so on). Every case returns the same state when nothing changes. `library` is now only what
  is saved, plus the load status.
- **Selection is a `ReadonlySet<string>`** (insertion order kept): `.has(id)` in the rows and
  `SelectAllButton`, `.size` in the headers, `[...selection]` for `REPLACE_FILES`.
- **`appReducer`** returns `state` when every slice reducer returned its own state, so the store's
  `next === state` check stops there.
- **`bootstrap/BootEffects.tsx`** (memo'd, renders `null`, mounted by AppNavigator from the first
  render, above the lock) hosts the persistence, signature, external-file, reminder, indexing,
  backfill, integrity and auto-backup hooks, and the crash / usage / entitlement / remote config /
  notifications / ads effects. The hooks themselves still read the whole `library` slice; they
  re-render only this component.
- **AppNavigator** reads single fields (`loadStatus`, `settings.loaded`, the app lock switch, "has
  an active course", `processingStatus`, `errorMessage`). The Android Back handler and the start
  screen's choice read the rest from the store at that moment (`useAppStore().getState()`), not
  from a subscription.
- `ScreenLayer` and `ScreenFrame` were already memo'd with stable props (G2); nothing to change.
- **Home:** `utils/useDayClock.ts` (`now`, `today`): changes at midnight (a timer), when the app
  comes back to the foreground, and when Home is shown again after a minute or more. Not only
  `today`, because the deadline list's "overdue" needs the time. A test that mounts Home has to
  unmount it (the midnight timer keeps Jest waiting otherwise).
- **Render counts (dev only):** `utils/renderCounts.ts` `useRenderCount(name)` (not in `src/dev`:
  the screens import it, and `bootImports.test.ts` keeps `src/dev` out of AppNavigator's static
  imports) and `src/dev/RenderCountOverlay.tsx`, turned on in Settings → Developer → Render counts.
  It counts only while shown. Counted: AppNavigator, BootEffects, ScreenStack, TabBar, Home, Library,
  Course, SearchBar, FileRow. Tap the overlay to reset.
- **Not done here:** LibraryScreen itself still re-renders on a keystroke (it filters the list with
  the query); FileRow is memo'd, so rows whose data didn't change don't. Verification 6 will show
  "Library" moving with "SearchBar". Splitting the screen is G6's list work if the counts say so.
- Tests: `store/__tests__/{appReducer,libraryUiSlice}.test.ts`, `selectorStore.test.tsx` (a UI
  action doesn't reach a `library` reader; a no-op tells nobody), `useLibraryPersistence.test.tsx`
  (no `syncLibrary` for UI-only actions), `utils/__tests__/{useDayClock,renderCounts}.test.ts(x)`.

Goal: a keystroke, a selection tap or a progress tick re-renders only the components that show it.

Files: `bootstrap/AppNavigator.tsx`, new `bootstrap/BootEffects.tsx`, `store/appReducer.ts`,
`store/slices/librarySlice.ts` (+ a new `store/slices/libraryUiSlice.ts`), the hooks that read whole slices
(`useLibraryPersistence`, `useStorageIntegrity`, `useImportedPdfIndexing`, `useDeadlines`),
`screens/HomeScreen.tsx`, `src/dev` (a render counter).

Changes:
- `ScreenFrame` (or G2's `ScreenLayer`) is `memo`'d, and its props are stable.
- `<BootEffects/>` is a sibling of the layers that renders `null` and hosts the persistence, integrity,
  indexing, deadline and backup hooks. Their slice subscriptions then re-render only that empty
  component.
- AppNavigator reads single fields with `useAppSelector` (load status, `processingStatus`,
  `errorMessage`, `settings.loaded`, theme), not whole slices.
- **Move UI-only fields** out of `library` into a new `libraryUi` slice: `search`, `searchOpen`,
  `selection`, `selMode`, `tab`, indexing progress. Persistence ignores that slice, so `useLibraryPersistence`
  no longer re-runs its diff for a keystroke. Update the action types and selectors, and grep each moved
  field.
- `appReducer`: return `state` when every slice reducer returned its own state. The `next === state`
  check then short-circuits.
- Selection as a `Set` (or a `Record<id, true>`) in the slice, so rows check membership in O(1).
- `HomeScreen.tsx:61,70`: memo on `today` (a date string), not `Date.now()`; refresh at midnight with a
  timer.
- Dev only: a `useRenderCount(name)` hook plus an overlay in `src/dev` that shows render counts per screen,
  used in G9.

Tests: `appReducer` identity (a no-op action returns the same object); the `libraryUi` slice;
`useLibraryPersistence` doesn't sync on UI-only actions (spy on the repo); `hardcodedStrings` and
`a11yLabels` stay green.

Device check: Verification 6.

## G6 · Lists and images *(M; needs a new dev build for `expo-image`)*
Status: done in code (2026-10-10). **Needs a new dev build** (`expo-image` is native; FlashList v2 is JS
only). Nothing here has run on a phone. Open: Verification 7.

As built:
- **Packages:** `@shopify/flash-list` 2.0.2 and `expo-image` ~57.0.5 (`npx expo install`). The `expo-image`
  config plugin isn't added: it only sets an iOS pod property (`disableLibdav1d`), and `app.config.js` is
  untouched.
- **FlashList** for the Library and Course document lists and for `shared/PageGrid` (Review's "All pages",
  the Reader's "Edit pages"). Its content style takes padding only, so the rows' gap is `FileRowGap`
  (`ItemSeparatorComponent`, exported by `FileRow.tsx`) and the grid's gap is a margin on the tile.
  `renderItem` is a `useCallback` and the rows get primitives: FlashList re-renders a row when
  `renderItem` changes, and `memo(FileRow)` / `memo(PageTile)` then skip the ones that are the same.
  `PageGrid`'s handlers are stable (`useStableCallback`) and its selection is a Set.
  `docListTuning.ts` is deleted.
- **Not done: the thumbnail strip.** `review/ThumbnailStrip` is still a ScrollView. Its thumbnails are
  dragged across their neighbours to reorder; in FlashList each one sits in its own cell, so the
  dragged one would pass *under* the cells after it on Android (z-order is per parent), and a recycled
  cell could take a drag's shared values with it. That needs a `CellRendererComponent` that lifts the
  cell, checked on a phone. It only got `AppImage`. `PageScrubberSheet` keeps its FlatList
  (`getItemLayout`, `scrollToIndex`); `HomeScreen` has no document list or page image, so nothing
  changed there.
- **`components/shared/AppImage.tsx`:** the `expo-image` wrapper (`cachePolicy="memory-disk"`,
  `contentFit="cover"`, no transition, the theme's `surface2` behind it; `bare` for none). In a recycled
  row pass `recyclingKey`.
- **`services/library/thumbnails.ts`:** `thumbFor(page)` is the thumbnail or undefined, never the master.
  `requestThumb(documentId, pageId)` queues a build: one at a time, the newest request first, a page at
  most once, a failed page not again until the next launch. A scan's is resized from its master
  (`expo-image-manipulator`, `THUMB_MAX_DIM` / `THUMB_JPEG_Q`, the page's stored size, so no extra
  decode); an imported PDF's is `pdfNative.renderPage` at 400 px. It is saved as
  `thumb_<pageId>.jpg` in the document's folder. `components/shared/PageThumb.tsx` (`PageThumb`,
  `useThumb`) is what a component uses: it asks in an effect, never during render.
- **Differences from the plan:**
  - Saved with a new action, **`library/SET_PAGE_THUMB`** (by page id, only for a page still without one),
    not `library/UPDATE_FILE` with a page list: the document can change while a thumbnail is built, and a
    whole-`pages` patch would undo that change.
  - The queue reads and writes the library through a host that `store/useThumbnailBuilder.ts` sets
    (mounted in `BootEffects`, after boot and a good load). A document deleted during a build gets nothing
    written, and its folder isn't made again.
  - An imported PDF's page is built only once the indexer has finished with the document (`indexState`
    `done` or `partial`: the pages past `INDEX_MAX_PAGES`, a page that failed once), not while the Reader
    holds the pdfium thread (`readerHold`), and not for a page turned since indexing (its PDF already
    carries the turn; the row's `rotation` would apply it twice). Those show the placeholder.
  - A session page (Capture's tray, the Review strip, Review's grid) keeps `thumbUri ?? uri`: it has no
    library row to save a thumbnail on, its thumbnail exists from ingest, and `expo-image` decodes at the
    size shown.
- **Every fallback site** now uses `PageThumb` / `useThumb`: `FileRow`, `PageResults`, `EditPagesModal`,
  `PagePickerModal`, `BookmarkList`, `SortUnsortedSheet`, `ExamPackScreen`, and `PageScrubberSheet` (not on
  the plan's list, same fallback; it takes a `documentId` now). Guard test
  `src/__tests__/noMasterThumbs.test.ts` fails on `thumbUri ?? …fileUri` in a component.
- **Snippets:** `getMatchSnippet` remembers its last answer per document object and query (a WeakMap, like
  the haystack; a changed document is a new object, which is what "updatedAt" was for). It is still called
  from the row renderer, for the rows on screen only: computing it for all 500 documents up front on each
  keystroke would cost more than it saves.
- **Intl:** `i18n/index.ts` `numberFormat(locale, options)` / `dateFormat(locale, options)` keep one
  formatter per locale + options; `formatNumber` and `formatDate` use them. `utils/format.ts` already goes
  through those two. Nothing in the app uses `Intl.RelativeTimeFormat`.
- **Left for G7:** `PagePeekCarousel`'s neighbouring masters and `previewImageCache` (the Review preview).
  Other RN `Image`s that aren't thumbnails (signatures, the crop overlay, the profile logo, the cover
  preview's logo, the page surface) are unchanged.
- **Tests:** `services/library/__tests__/thumbnails.test.ts`, the Intl cache in `i18n.test.ts`, the snippet
  memo in `searchService.test.ts`, `noMasterThumbs`. Jest stand-ins: `src/test/mocks/expoImage.ts` (a View)
  and `src/test/mocks/flashList.ts` (a FlatList: the real list measures over several frames and never
  settles under Node), mapped in `jest.config.js`.
- **`npm run typecheck` fails on HEAD, before this step:** `tsconfig.json` got `"jsx": "react"` in commit
  cec8ca3, which overrides Expo's `react-jsx` and gives 2,272 "React refers to a UMD global" errors.
  Not changed here. `npx tsc --noEmit --jsx react-jsx` is clean.

Goal: long lists scroll at 60 fps on a mid-range phone, and no row ever decodes a 2400 px image.

Files: `package.json` (`npx expo install @shopify/flash-list expo-image`; read the SDK 57 docs first),
`screens/{LibraryScreen,CourseScreen,HomeScreen}.tsx` (§17 U6/U7 restyle these; G6 changes only the
list and image plumbing), `components/library/{FileRow,docListTuning,PageResults}.tsx`,
`components/shared/PageGrid.tsx`, `components/review/ThumbnailStrip.tsx`, the thumbnail fallbacks listed in
"What the code looks like today" §5, new `services/library/thumbnails.ts`, `i18n/index.ts`,
`utils/format.ts`, `services/search/searchService.ts`.

Changes:
- **FlashList v2** (JS only on the New Architecture) for the document lists, the page grids and the
  thumbnail strip. `renderItem` is memoized (`useCallback`), and each row gets primitive props
  (`selected: boolean`, `snippet?: string`, `courseColor?: string`), so `memo(FileRow)` works. Remove
  `DOC_LIST_TUNING` where FlashList replaces it.
- **`expo-image`** for every thumbnail and page preview: `cachePolicy="memory-disk"`, a `recyclingKey`
  in recycled rows, `contentFit`, and a placeholder colour from the theme. A small `AppImage` wrapper in
  `components/shared/` keeps the props in one place.
- **No master fallback:** `thumbnails.thumbFor(page)` returns `thumbUri`. If it's missing, it queues a
  one-at-a-time thumbnail build (`expo-image-manipulator`, the 400 px spec in `capture/imageSpec.ts`),
  saves it with `library/UPDATE_FILE`, and returns a placeholder meanwhile. Imported PDFs use
  `pdfNative.renderPage` at 400 px. Every fallback site uses it.
- **Snippets:** `getMatchSnippet` runs once per query per document (memoised by query + doc id + updatedAt),
  outside `renderItem`.
- **Intl:** cache the `Intl.DateTimeFormat`, `NumberFormat` and `RelativeTimeFormat` instances per
  locale + options in `i18n/index.ts` and `utils/format.ts`.

Tests: `thumbnails.test.ts` (no master uri is ever returned; one build at a time; dedupe); the Intl
cache returns the same instance; snippet memoisation; `a11yLabels` (FlashList rows keep their labels).

Device check: Verification 7.

## G7 · Heavy work off the hot path *(M)*
Status: planned. JS only.

Goal: sliders, scanning, saving and indexing never freeze the screen.

Files: `components/review/{AdjustSlider,FilteredPreview}.tsx`, `screens/ReviewScreen.tsx`,
`services/capture/{ingestBatch,ingest}.ts`, `screens/DeliverScreen.tsx` (or §17 U9's
`services/deliver/saveScan.ts` if that lands first), `services/documents/importedPdfIndex.ts`,
`store/useImportedPdfIndexing.ts`, `services/persistence/libraryRepo.ts`,
`services/export/deviceExportService.ts`.

Changes:
- **Review sliders:** `AdjustSlider` writes a `SharedValue<Adjust>`. The preview (its own `memo`'d
  component) reads it through `useDerivedValue` into the Skia picture's uniforms or paint, with no
  `runOnJS` per frame. The final value is committed with one dispatch on gesture end, as today.
  `ReviewScreen` no longer re-renders while dragging. Check that `useFilteredPicture` can take the
  adjust values as shared values; if it can't, record the picture once and apply the adjust as a
  colour-matrix `Paint` driven by the shared value.
- **Scanning:** `ingestBatch` dispatches `capture/ADD_PAGE` as each page finishes (master + thumbnail).
  OCR and filter stats run afterwards, one page at a time, through `capture/UPDATE_PAGE`. Review shows
  pages as they arrive; a page waiting for OCR shows a small "Reading text…" chip. Book split and ID card
  composition still run after the batch (they need all pages). Throttle progress dispatches to one per
  page.
- **Deliver:** reuse `page.ocr` when the page's geometry (crop, rotation, split) hasn't changed since
  ingest; only the filter changed. Keep a `geometryKey` on the page to compare. Render each page once when
  the export preset equals the master spec (already the rule; check it). Release each page's bytes after
  it's added to the PDF.
- **Indexing:** commit pages in batches through a new `libraryRepo.upsertPages(docId, pages)` that writes
  only the given rows (FTS triggers fire per row). Dispatch progress at most every 500 ms.
  `useLibraryPersistence`'s diff skips documents whose only change is pages already written (a
  `pagesWrittenAt` marker, or have the indexer write through the repo and dispatch a non-persisting
  `library/PAGES_SYNCED`).
- **Device export:** `exportCopyToDeviceFolder` uses the streaming `saveFileToFolder`
  (`deviceExportService.ts:86-115`) and never reads base64.

Tests: `ingestBatch` (pages appear in order before OCR; cancel mid-OCR keeps the saved pages);
`geometryKey`; `upsertPages` (only the given rows are written); `deviceExportService` doesn't call
`readAsStringAsync` with base64.

Device check: Verification 8.

## G8 · Release build *(S–M; needs a new dev build)*
Status: planned.

Goal: a smaller, faster release APK/AAB, with nothing broken by shrinking.

Files: `app.json` (`expo-build-properties` plugin), `package.json`, maybe `proguard-rules` through the
plugin's `extraProguardRules`, `docs/qa/performance.md`.

Changes:
- `npx expo install expo-build-properties` (read the SDK 57 docs first):
  `android.enableProguardInReleaseBuilds: true`, `enableShrinkResourcesInReleaseBuilds: true`.
- Keep rules: start with none extra. Build a release, run the walkthrough, and add rules only for what
  breaks. Usual suspects are ML Kit document scanner and text recognition, Firebase, Google Mobile Ads,
  pdfiumandroid (JNI: `io.legere.pdfiumandroid.**`), `modules/pdf-native`, Sentry. Put a comment on each
  rule.
- **React Compiler:** read the SDK 57 docs (`experiments.reactCompiler`). Turn it on in a branch, run
  `npm test` and the walkthrough, and compare G9's render counts. Keep it only if both are clean; if not,
  record why in "As built".
- `npm uninstall expo-blur` (0 imports). `signatureService.ts` lazy-requires `react-native-view-shot`.
- Review every `app.json`/`package.json` diff for long lines and trailing whitespace (security rule).

Tests: `npm run typecheck`, `npm test`.

Device check: Verification 9.

## G9 · Measure and record *(S)*
Status: planned. Device work plus a little dev tooling.

Goal: the numbers in `docs/qa/performance.md` are measured on a real mid-range phone, before and after
§16–§18.

Files: `docs/qa/performance.md`, `src/dev/seedLibrary.ts`, new `src/dev/PerfOverlay.tsx`.

Changes:
- `seedLibrary.ts` seeds 500 documents **with** realistic word boxes (`blocks` with lines and words; today
  `blocks: []` at `:62`), so `loadAll` and search are measured honestly.
- `PerfOverlay` (dev only; toggled from Settings → Developer): JS FPS (a `requestAnimationFrame` counter),
  G5's render counts, and the time since the process started.
- Measure:
  - cold start to the first usable screen (`am start -W` + a screen recording);
  - Files scroll (Android GPU profiling bars / `dumpsys gfxinfo`);
  - Reader open (§18 sets its own budget);
  - a 20-page scan to Review;
  - Save of 20 pages;
  - memory (`dumpsys meminfo` PSS).
  Record before §16 (now) and after each wave.

Tests: none beyond `npm test`.

---

## Order
G1 first (it blocks the release on its own). Then G2 → G3 → G4 → G5, then §18's reader work, then
G6 → G7 → G8. G9's "before" numbers should be taken **before G2**, if a device is available. The full
order across §16–§18 is in `docs/plan/README.md`.

## Verification
Every step: `npm run typecheck` and `npm test` pass (plus `sentryInit`, `bootImports`, `navStack`,
`backHandling`, `hardcodedStrings`, `a11yLabels` and `screens/__tests__/safeArea.test.ts`).

On a mid-range Android phone (4 GB RAM, Android 13/14), both navigation modes, light and dark:
1. **G1:** a release-like build with crash reports **off** sends nothing to Sentry. Check the Sentry
   project for events, sessions and replays, and check with a proxy or logcat. With them **on**, a test
   error arrives with no screenshot, no replay and no IP.
2. **G2:** Library → search "math" → scroll → open a document → Back: the same scroll and filter. Capture →
   Settings → Back returns to Capture. The low-space guard → Storage → Back returns to where it was
   opened. Home ↔ Library 10 times: no new banner request each time (logcat), no flicker.
3. **G2:** Reader at page 50 → Back: the slide shows page 50, not a grey placeholder. Opening an XLSX
   and going Back causes no JS stall (the Library scrolls at once).
4. **G3/G4:** cold start to the first usable screen is at least 30% faster than G9's baseline. Record the
   numbers.
5. **G4:** a library of 500 seeded documents with word boxes: boot time doesn't grow with OCR size (compare
   with and without word boxes). Search still finds words, and the Reader's Select text still works
   (word boxes loaded on demand).
6. **G5:** typing in Library search: the render counts show only the search bar and the list rows
   changing.
7. **G6:** fling through 500 documents: no blank rows after the first frame, jank ≤ 5% (gfxinfo). A
   document without thumbnails shows placeholders, then thumbnails, never a slow full-size decode.
8. **G7:** drag the Brightness slider on a 2400 px page: the preview follows smoothly. A 20-page scan:
   the first page shows in Review within about 1 s. Indexing a 300-page imported PDF doesn't slow the
   Library down.
9. **G8:** release build: scan → OCR → save → share, ads, Remote Config, crash report (opted in), the
   Reader, convert to Word. Record APK/AAB size before and after.

## Out of scope
- Moving to React Navigation or expo-router (G2 keeps the custom router; its stack fixes the problems at
  a fraction of the risk).
- A worklet runtime for pdf-lib (§18 moves Mark mode's PDF writes out of the hot path instead).
- iOS-specific performance work (Android first).
