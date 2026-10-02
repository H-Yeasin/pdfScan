# §9 Onboarding and UX polish: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement O1 from docs/plan/09-onboarding.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §3 (courses, `QuickSetupSheet`), §4 S1 (profile), §6 L4 (all UI text in
  `src/i18n/en.ts`; new text goes there too). §8 B1 is useful for O5's seeding but not needed.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
§9 makes the first five minutes good and the app pleasant and usable for everyone: a short
onboarding, empty screens that tell you what to do, accessibility, and the performance budget
from `docs/PLAN.md` (**cold start under 2 s, library scroll at 60 fps with 500 documents**).
This is the last section before the Play Store closed beta (phase P1 in `docs/PLAN.md`).

### What the code looks like today (checked while planning, 2026-10-02)
- **First launch:** the router starts on `'capture'` (`navigation/router.tsx`), and
  `AppNavigator` replaces it with `'home'` once the library loads and a course exists, so a
  returning user can see Capture flash before Home. There is no splash-screen control
  (`expo-splash-screen` is not used). `settings.firstRun` only gates the scanner's first
  launch. There is no onboarding; `HomeScreen` opens `QuickSetupSheet` from its empty state.
- **Android back button:** no `BackHandler` anywhere. With the custom router, the hardware or
  gesture back on any screen leaves the app instead of going back.
  (`predictiveBackGestureEnabled: false` in `app.json`.)
- **State updates re-render everything.** `store/AppStateContext` puts the whole app state in
  one context value, recreated on every dispatch, so every `useAppState()` consumer re-renders
  on every action: snackbars, scan progress ticks, selection changes, and so on.
- **Lists:** 10 `FlatList`s and 31 `ScrollView`s; `FileRow` renders thumbnails with the RN
  `Image`. `expo-image` and `@shopify/flash-list` are not installed.
- **Accessibility:** 229 `Pressable`s but only 67 `accessibilityLabel`s and 98 roles, so many
  icon-only buttons are unnamed for TalkBack/VoiceOver. 257 hard-coded `fontSize` values; RN
  scales them with the system font size, but layouts haven't been checked at large sizes. No
  reduce-motion handling and almost no screen-reader announcements (2 uses). Course colours
  already have a contrast test (`palette.test.ts`); the base theme tokens don't.
- **Empty states:** `components/library/EmptyState` is used by Library and Course; other empty
  places (search results, bookmarks, submissions, deadlines, Review with no pages) vary.
- i18n is in place (`useT()`, `hardcodedStrings.test.ts`), so all new text goes into `en.ts`.

### Key design decisions
- **Onboarding is three short screens, all skippable, shown only to new users.** Anyone who
  already has documents or courses never sees it. Camera permission is asked at the first scan,
  not in onboarding.
- **Fix re-rendering with selectors, not a new state library.** Keep the reducer and
  `dispatch`; put the state in a small external store and add `useAppSelector(selector)` based
  on `useSyncExternalStore`, so a screen re-renders only when the slice it reads changes.
  `useAppState()` keeps working for the code that hasn't moved yet.
- **Measure before changing libraries.** A seeded 500-document library and written-down
  numbers come first; `expo-image` and FlashList are added only if the measurements say so.
- **Guard rails as tests**, like the hard-coded string test: unnamed buttons and low-contrast
  token pairs fail CI.

---

## Steps

### O1 · Navigation basics: Android back, start screen, splash *(S)*
Status: done (commit 1e998dc). Device checks open; needs a new dev build (`expo-splash-screen`,
predictive back).

As built:
- `navigation/backHandling.resolveBack(ctx)` is the pure order: selection (only on screens with
  a document list), then Library search, then the screen's own Back target (plus its clean-up:
  Review clears the retake target, Course the highlighted deadline), then exit from the root
  tab (`rootScreen`: Home with a course, else Capture). Non-root tabs go back to the root tab.
  AppNavigator registers one `BackHandler` listener at boot; `exit` returns `false` (Android's
  default, the app goes to the background).
- "Discard N pages?" is asked when back would **exit** with an unsaved scan, not on Review:
  Review's Back goes to Capture and keeps the pages, so nothing is lost there.
- Sheets: almost all are RN `Modal`s, which already close on back via `onRequestClose`; the four
  without it (`SignatureModal`, `SignatureCaptureModal`, `SignaturePlacementOverlay`,
  `CropOverlay`) now cancel. `navigation/useBackHandler(onBack, enabled)` is for inline overlays:
  Reader's find bar and Review's Adjust panel use it.
- Splash: `bootstrap/splash.ts` (`holdSplash` at module scope in `App.tsx`, `releaseSplash` one
  frame after the start screen renders, 3 s safety timeout that also covers a crash during boot).
  AppNavigator has its own 3 s boot timeout; if loading finishes later and the user hasn't
  navigated, the start screen is still corrected. `bootstrap/startScreen.chooseStartScreen` is
  where O2 adds Onboarding. Splash colours match `tokens.bg` (light/dark), image
  `assets/splash-icon.png`.
- Tests: `navigation/__tests__/backHandling.test.ts`, `bootstrap/__tests__/{startScreen,splash}.test.ts`.

- **Android back** (`BackHandler` in `AppNavigator`): close the top sheet or modal first (sheets
  register a handler while open, via a small `useBackHandler(onBack)` hook), then leave
  selection or Find mode, then `router.back()` to the screen's `hub`/`tabHub` (the router
  already knows where Back returns), and only exit the app from Home (or from Capture when
  there are no courses). Review with unsaved pages asks "Discard 8 pages?" first.
- **Start screen without a flash:** keep the native splash visible
  (`expo-splash-screen`, check the SDK 57 package source for `preventAutoHideAsync` /
  `hideAsync` and the config plugin) until settings and the library index have loaded, then
  choose the first screen (Onboarding, Home or Capture) **before** the first render, and hide
  the splash after the first frame. Add a 3-second safety timeout so a slow or failed load
  still shows the app (with F3's load-error state).
- Turn on Android's predictive back gesture (`predictiveBackGestureEnabled: true`) once the
  handler is in place, and check that the slide transitions still look right.
- Tests: the back-handling order (sheet, selection, screen, exit) as a pure function of the
  navigation state; the start-screen choice for new user / no courses / courses; the splash
  timeout.

**Done when:** pressing back never leaves the app unexpectedly, and a cold start shows the
splash and then the right screen with no flash of another screen.

### O2 · Onboarding: three skippable screens *(M)*
Status: done (commit 84b2252). Device check open: the 90-second first scan.

As built:
- **Screen:** `screens/OnboardingScreen.tsx` is a horizontal paging `ScrollView` (one vertical
  `ScrollView` per page, for the keyboard) with dots, Next/Start, and Skip on every page.
  Page 1 has three icon tiles (scan → file → submit) on theme colours and the privacy line.
- **What's kept:** the profile fields dispatch `SET_PROFILE` as they're typed, so leaving at any
  point keeps them. Start and Skip both save the course rows that are valid on their own
  (`courseSetup.savableQuickSetup`), so a half-typed row doesn't lose the good ones. A blank
  semester takes the term's default.
- **Shared course form:** `components/courses/CourseSetupForm.tsx`, made of
  `useCourseSetupForm()` (state, validation, `save()` all-or-nothing for the sheet,
  `saveValid()` for onboarding) and `CourseSetupFields`. `QuickSetupSheet` is now a thin
  wrapper; its flow is still covered by `CourseList.test.tsx`.
- **Who sees it:** `services/onboarding/onboarding.ts` has `onboardingDecision`, which returns
  `show` (new user), `markDone` (has documents or courses: an update) or `none` (already done,
  **or the library failed to load**, so a read error is never taken for a new user).
  `chooseStartScreen({ showOnboarding })` picks `'onboarding'`. `AppNavigator` makes the
  decision once, behind the splash.
- **Back:** it steps back a page (`useBackHandler`). On the first page it exits on first run,
  but when shown again from Settings → About → "Show the introduction again" it goes back to
  Settings (`backHandling`, keyed on `previousScreen`).
- **Start** goes to Home with courses, otherwise Capture. The one-time hint at the Scan button
  is O3's.

- `OnboardingScreen` (`ScreenName` `'onboarding'`), a horizontal pager with dots and "Skip" on
  every page:
  1. **What it does:** "Scan your notes and assignments, file them by course, submit them as
     clean PDFs." Three small illustrations (scan → course → submit) drawn with icons and
     theme colours, no image assets needed. The privacy promise in one line: "Everything stays
     on your phone. No account."
  2. **About you** (optional): name and roll number (the S1 profile fields), with a preview of
     a file name built from them ("2021331045_Rahim_CSE101_HW1.pdf") so the reason is obvious.
  3. **Your courses** (optional): the content of `QuickSetupSheet` embedded as a page (extract
     its form into a `CourseSetupForm` component used by both). The crash-report toggle (F8,
     off by default) sits at the bottom of this page with its one-line explanation.
  - "Start" goes to Home (with courses) or Capture (without), where a one-time hint points at
    the Scan button (see O3).
- Settings: `onboardingDone: boolean` (persisted). New users only: if the library already has
  documents or courses (an existing user after an update), set it to true without showing
  anything.
- Settings → About: "Show the introduction again".
- Tests: who sees onboarding; Skip at each page saves what was entered so far; the course form
  shared with `QuickSetupSheet`.

**Done when:** a new user goes from install to their first scan in under 90 seconds with 4
courses and a profile set up, or in two taps by skipping.

### O3 · Empty states that teach, and one-time hints *(S)*
Status: done (commit c4dd4f7). Device checks open (each hint's placement, on a small phone too).

As built:
- `components/shared/EmptyState` (moved from `components/library`): `title`, `body`, `action`,
  `secondaryAction`, `variant: 'screen' | 'inline'`. Inventory of empty places:

  | Place | Says | Action |
  |---|---|---|
  | Home, no courses | "Add your courses to file scans automatically." | Add courses |
  | Home, nothing due | "Nothing due in the next 7 days." + how to add one | (the "+ Add deadline" link above) |
  | Course, no documents | "Scan your first assignment for {code}." | Scan into this course |
  | Unsorted, empty | what lands there | none |
  | Course, no deadlines | how to add one | (the "+ Add deadline" link above) |
  | Library, empty | "Scan or import your first document. A backup (.zip) opens here too." | Scan now / Open a file |
  | Library, no match with a course filter | "…Check the spelling or search all courses." | Search all courses |
  | Library, no match | what search covers | none (the query is the action) |
  | Library, Starred tab empty | how to star | none |
  | Library, load failed (F3) | documents are safe | Try again |
  | Bookmarks sheet (Reader, T5) | how to bookmark | none (the button is in the top bar) |
  | Exam pack, empty | where pages come from | Add pages |
  | Review, no pages | "Scan pages, or pick photos from your gallery." | Start Capture / Import from gallery |

  No submissions: there's no empty submissions list (the course's "Submitted" section and the
  Reader's sheet only appear when there is one), so nothing to add. Where a header link already
  adds the thing (deadlines), the empty state explains instead of repeating the button.
- Hints: `services/hints/hints.ts` (`createHintScheduler`, pure: unseen, not busy, not blocked,
  one per `navTick`), `components/shared/useHint(id, enabled)` (waits for settings; marks the hint
  seen as soon as it appears, so leaving without "Got it" counts) and `Hint` (callout with an
  arrow, laid out next to its anchor, not measured). `settings.hintsSeen` (merged on load).
  Hints: `scan` (Home's Scan button or Capture's shutter, whichever comes first), `reviewFilters`
  (above the filter strip), `submit` (inside the Reader's overflow sheet, under Submit: the
  sheet is the dialog, so it's never over one), `readerBookmark` (under the top bar's button).
- `store/useGalleryImport` (moved out of `CaptureScreen`) so Review's empty state can import.
- Tests: `services/hints/__tests__/hints.test.ts`,
  `components/shared/__tests__/emptyStatesAndHints.test.tsx`.

- An inventory in this step's "As built" notes of every empty place, each with **one
  sentence and one action**, all using `EmptyState` (move it to `components/shared/`):
  - Home with no courses: "Add your courses to file scans automatically" → Add courses;
  - a course with no documents: "Scan your first assignment for CSE 101" → Scan (`startScan`
    with the course);
  - Library empty: "Scan or import your first document" → Scan / Import;
  - search with no results: "No pages contain 'xyz'. Check the spelling or search all
    courses" → clear course filter;
  - no bookmarks / no submissions / no deadlines: what they are and where to add one;
  - Review with no pages: → Scan / Import from gallery.
- **One-time hints** (`components/shared/Hint.tsx`, a small callout with an arrow and "Got
  it"): Scan button after onboarding; the Review filter strip ("Swipe to try filters"); the
  Submit button the first time ("Set it up once; next time it's one tap"); the Reader's
  bookmark button. `settings.hintsSeen: string[]`. At most one hint per screen visit, never
  while something is processing, never over a dialog.
- Tests: hint scheduling (once only, one per visit, not while busy); each empty state renders
  its action.

**Done when:** every list or screen that can be empty says what to do next, and each hint shows
exactly once.

### O4 · Accessibility *(M, can be split a/b)*
Status: done in code (O4a 38b3fb4, O4b 854cb74). The by-hand checks (TalkBack flow, 200 % font,
reduce motion, VoiceOver) are in `docs/qa/walkthrough.md` §2–3 and still open.

As built:
- **O4a:** `src/__tests__/a11yLabels.test.ts` fails on any `Pressable`/`TouchableOpacity` without a
  name (`accessibilityLabel` or a `<Text>` inside) **or** without an `accessibilityRole`; elements
  that only swallow taps are `accessible={false}`. The allowlist is empty. Only 12 buttons were
  unnamed (the plan's count of 67 labels missed text children); 127 lacked a role and got
  `button`. Segmented controls and the filter strip are `radio` with `selected`, the star is a
  `switch`, filter toggles are `checkbox`. Labels live in `en.ts` under `a11y.*`.
- Review thumbnails are one element: "Page 3 of 10", `selected`, actions Move earlier / Move later
  / Remove page (drag and the × badge aren't reachable by TalkBack). Edit pages and the exam pack
  already had buttons for this. Course cards: "CSE 101, Programming, 12 documents, last scan …".
- Touch targets: `theme.touchSlop(size)` gives 36/44 dp icon buttons hitSlop up to 48 dp
  (`MIN_TOUCH`), so layouts didn't change.
- **O4b contrast:** `theme/contrast.ts` + `theme/__tests__/contrast.test.ts` (ink, muted,
  accentInk and danger on bg/surface/surface2 and accentSoft at 4.5:1; accent icons at 3:1;
  onAccent on accent; bg on ink for hints; white on danger at 3:1). Fixes: light `accent`
  `#16a085` → `#0f7f69`; new `onAccent` token (white in light, `#0b1f1a` in dark, where white on
  the bright teal was 2.4:1), used by every label and icon on an accent fill; dark `danger`
  `#e74c3c` → `#f16253`; text that used `accent` now uses `accentInk`.
- **Reduce motion:** `theme/useReducedMotion`; `navigation/transitions.transitionStyle` fades
  instead of sliding; Review's ribbon stops looping.
- **Announcements:** `services/a11y/announce` speaks on iOS only (Android reads the live regions:
  the snackbar and scan progress now have them), so nothing is read twice.
- **Gesture alternatives:** crop has **Auto crop** (runs `detectDocumentQuad`) and **Use whole
  photo**; signature placement has **Place in bottom right**.
- **Large text:** dense chrome (tab bar, Library tabs, filter chips, capture modes, filter strip,
  Reader bars) caps at `CHROME_MAX_FONT_SCALE` 1.4. Fixed heights that clip at 200 % need the
  device pass; hard-coded `fontSize` values weren't swapped for `typeScale` (none were touched).

- **O4a: names, roles, guard rail.**
  - Every icon-only `Pressable` gets `accessibilityLabel` (from `en.ts`, under `a11y.*`),
    `accessibilityRole` and state (`selected`, `disabled`, `checked`); thumbnails say "Page 3
    of 10"; course cards say "CSE 101, 12 documents, last scan 2 days ago".
  - `src/__tests__/a11yLabels.test.ts`: scans `.tsx` files for `<Pressable` /
    `<TouchableOpacity` without `accessibilityLabel` and without a direct `<Text>` child, with
    a short allowlist (like `hardcodedStrings.test.ts`).
  - Touch targets at least 48×48 dp (use `hitSlop` where the visible icon is smaller).
- **O4b: large text, contrast, motion, screen-reader flows.**
  - **Large text:** check every screen at Android font size 200 % and iOS AX5 with the
    pseudo-locale on; fix fixed heights and single-line labels that clip. Only dense chrome
    (tab bar, chips, the Reader's top and bottom bars) gets `maxFontSizeMultiplier` 1.4.
    Replace hard-coded `fontSize` values with `typeScale` entries where touched.
  - **Contrast:** `src/theme/__tests__/contrast.test.ts` checks text token pairs in both themes
    (ink, muted and accentInk on bg, surface and surface2; white on accent) at 4.5:1 for normal
    text and 3:1 for large text and icons. Fix the tokens that fail.
  - **Reduce motion:** `useReducedMotion()` (`AccessibilityInfo`); when on, screen slides become
    fades and the processing ribbon and other loops stop.
  - **Announcements:** scan and save progress ("Processing page 3 of 10", "Saved to CSE 101")
    through `accessibilityLiveRegion="polite"` on Android and `announceForAccessibility` on
    iOS; snackbars are announced.
  - **Gestures with alternatives:** page reorder (Review, Edit pages, exam pack) gets
    `accessibilityActions` "Move earlier" / "Move later"; the crop overlay gets "Auto crop" and
    "Use whole photo" buttons; signature placement gets "Place in bottom right"; zoomable
    images keep double-tap.
- Tests: the a11y label scan; the contrast test; reduce-motion switches the transition.

**Done when:** a TalkBack user can scan, review, save and submit a document without sighted
help (tested by hand), the app is usable at the largest font size, and the a11y and contrast
tests are in CI.

### O5 · Performance budget *(M)*
Status: in progress: done in code (commits ffc68d3, 35016b8); the device measurements and the
budgets in `docs/qa/performance.md` are open, and decide the FlashList/expo-image and pdf-lib
questions below.

As built:
- Store: `createStore` + `useAppSelector(selector, isEqual?)`, `useAppSlices(...keys)` (the usual
  way to read: re-renders only when one of the named slices changes), `useAppDispatch()`,
  `useAppStore()` (for handlers that need the whole state, e.g. `startScan`), `shallowEqual`,
  `createSelector`. **Every** `useAppState()` caller was moved to slices (not only the hot
  screens: AppNavigator renders the screens, so it had to move too); `useAppState()` is kept.
- `FileRow` and Review's `DraggableThumbnail` are `memo` with stable handlers
  (`utils/useStableCallback`); FileRow's handlers now take the document. Rows vary in height, so
  no `getItemLayout`; `components/library/docListTuning.ts` has the window settings.
- `bootstrap/useDeferredBoot.ts`: integrity check, imported-PDF indexing, stale reminder clean-up
  (`useDeadlineReminders`' new `cleanupReady`) and Sentry init start 1.5 s after the first screen.
  A timeout, because `InteractionManager` is deprecated in RN 0.86. There was no boot-time
  pruning to defer.
- Lazy on first use: `xlsx` (`sheetService`), `mammoth` (`docxService`). pdf-lib is not lazy yet
  (about ten services import it); Expo's Metro config has `inlineRequires: false`. The zip code is
  small and only reached from backup screens (B3), so it stays as is.
- Seed tool: `src/dev/seedLibrary.ts`, a button on the dev-only Filter Lab screen (no new UI
  strings), not a separate dev menu.
- Tests: `store/__tests__/selectorStore.test.tsx`, `bootstrap/__tests__/useDeferredBoot.test.tsx`.

- **Measure first** (`src/dev/` tools, `__DEV__` only, and `docs/qa/performance.md` for the
  numbers):
  - "Seed library": 500 documents across 8 courses with thumbnails, OCR text, bookmarks and
    submissions (reuse the test fixtures' shapes; one tap in the dev menu);
  - cold start: `adb shell am start -W` (TotalTime) on a **release** build of a mid-range phone,
    5 runs, median;
  - library, course and search scroll: the RN performance monitor and Android's GPU profiling
    bars; React DevTools Profiler for re-render counts during a scan and while typing a search.
- **Selector store** (`store/AppStateContext.tsx`): hold the reducer state in an external store
  (`createStore(reducer)` with `getState`, `dispatch`, `subscribe`), expose
  `useAppSelector(selector, isEqual?)` with `useSyncExternalStore`, and `useAppDispatch()`.
  Keep `useAppState()` for compatibility. Move the hot screens first: Library, Course, Home,
  Reader, Review, `FileRow`, `ThumbnailStrip`, `Snackbar`. Memoize list rows (`React.memo`
  with an id/updatedAt comparison) and derived lists (selectors with memoization).
- **Cold start:** defer boot work that isn't needed for the first screen until after the first
  frame (`InteractionManager.runAfterInteractions` or a short timeout): the integrity check (§8
  B1), imported-PDF indexing backfill (§7 R1), deadline re-scheduling, Sentry init (when
  enabled), pruning. Load heavy modules on demand (`require` inside the function) where they
  are only used in one flow: `pdf-lib` + fontkit (save and tools), `xlsx`, `mammoth`, the zip
  code (§8).
- **Lists:** `getItemLayout` for fixed-height rows, `windowSize` and `initialNumToRender` tuned,
  thumbnails decoded at their display size. If the library still drops frames with 500
  documents after the selector change, switch the library and course lists to
  `@shopify/flash-list`, and thumbnails to `expo-image` (memory and disk cache,
  downsampling); record the before/after numbers.
- **Budgets** (written in `docs/qa/performance.md`, checked before each release):
  - cold start under 2 s (median, release build, mid-range Android);
  - library and course scroll at 60 fps with 500 documents (no more than 5 % dropped frames);
  - typing in search: results update within 150 ms;
  - a scan's progress updates re-render only the progress UI (Profiler);
  - memory under 350 MB while processing a 20-page scan.
- Tests: `useAppSelector` only re-renders on its slice (React test renderer counting renders);
  memoized selectors; the deferred boot tasks still run.

**Done when:** every budget above is met and recorded in `docs/qa/performance.md`.

### O6 · Polish sweep before the beta *(S)*
Status: in progress: the code fixes are done (ac1c707); the "first day" walkthrough in both themes
(`docs/qa/walkthrough.md` §1) is open and decides what's left.

As built (fixes found without a device):
- **Status bar:** only Capture set one, so with the app's theme set opposite to the phone's the
  icons were unreadable. AppNavigator now sets it from the app theme; Capture still overrides.
- **Snackbar queue** (`ui.snackQueue`): a snack with an action (Undo, Done, Scan more) isn't
  overwritten; later ones wait (3 at most, repeats dropped). Plain messages still replace each
  other, so "Building…" doesn't hold up the result.
- **Tablets:** every screen but Capture, Review and the Reader is at most 720 dp wide, centred
  (`ScreenFrame` in AppNavigator).
- **Loading:** the Library showed "No documents yet" while loading; now `SkeletonRows`.
- **Haptics** (`services/feedback/haptics`): success on save and submit, warning when they fail,
  `hapticSelection` when selection starts; the capture loop already had its own.
- **Errors:** the messages that only said what failed now say what to do (scan, page, tools, open,
  submit, share, exam pack, backup, folder copy). There's no `errors.*` group; they live by area.
- **Keyboard:** the deadline sheet and text prompt use `KeyboardAvoidingView` on iOS (Android's
  modal windows resize); the prompt's Done key submits. CourseSheet already had it.
- Dark/light visuals, keyboard behaviour on real devices and the walkthrough itself: open.

A checklist session, fixing what it finds (each fix small; anything bigger becomes a new step):
- every screen in **dark mode** and **light mode**; status bar style per screen;
- **keyboard:** inputs scroll into view, "Done" closes the keyboard, no buttons hidden under it;
- **loading states:** skeleton rows for the library while it loads; no spinner-only screens
  longer than 1 s without text;
- **errors:** every error snack says what happened and what to do, in the same voice (check
  `errors.*` in `en.ts`);
- **haptics:** consistent (success on save and submit, light on selection, warning on errors);
- **tablets** (`supportsTablet` on iOS, and Android tablets): content max width about 720 dp,
  centred, so nothing stretches across a tablet;
- **snackbar queue:** two snacks in a row don't overwrite each other;
- a short scripted **"first day" walkthrough** (install → onboarding → 3 scans in 2 courses →
  submit → search → back up) on a mid-range Android phone; record issues in this step's notes.

**Done when:** the walkthrough runs with no issue left open, in both themes.

---

## Order and dependencies
O1 (small, fixes the back button), then O5's measurement and selector store (it affects every
later UI change), then O2, then O3, then O4a and O4b, then O6 last before the beta.

## Critical files
- `src/navigation/router.tsx`, `src/bootstrap/AppNavigator.tsx`, `app.json` (splash plugin,
  predictive back)
- `src/screens/OnboardingScreen.tsx` (new), `src/components/courses/{QuickSetupSheet,CourseSetupForm (new)}.tsx`
- `src/components/shared/{EmptyState (moved),Hint (new)}.tsx`, `src/store/slices/settingsSlice.ts`,
  `src/services/persistence/settingsStorage.ts`
- `src/store/AppStateContext.tsx` (selector store), hot screens and list rows
- `src/theme/tokens.ts`, `src/theme/typography.ts`, `src/i18n/en.ts`
- Tests: `src/__tests__/a11yLabels.test.ts`, `src/theme/__tests__/contrast.test.ts` (new)
- `docs/qa/performance.md` (new), `src/dev/` (seed tool)

## Verification (for the whole of §9)
1. `npm run typecheck && npm test` pass in CI, including the a11y-label and contrast tests.
2. On a mid-range Android phone (release build for timing):
   - fresh install: onboarding → first scan in under 90 s; Skip works from every page;
   - Android back from every screen goes where expected and closes sheets first;
   - cold start under 2 s; the 500-document library scrolls smoothly; budgets recorded;
   - TalkBack: scan, review, save and submit by ear; font size 200 %: nothing important clipped;
   - dark and light mode walkthrough (O6).
3. iOS: VoiceOver on the same flow; AX5 text size.
