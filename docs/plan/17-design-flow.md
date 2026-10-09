# §17 Design system and app flow: step-by-step plan

## How to use this file
- Implement **one step per session** ("Implement U3 from docs/plan/17-design-flow.md").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are implementing.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §17.
- Step prefix **U** (UX). The other letters are taken.
- **§16–§18 ship before §11.** Inside §17 the order is U1 → U14, except that U12 (copy) can run any time
  after U2.
  - U1 builds on §15 V3 (the logo greens) and U4/U11 on §15 V4's `BrandMark`; both are done in code.
  - U5 needs §16 G2's router (a stack and kept tab roots).
  - §18 W23 (the Reader's More sheet) needs U3's `Menu`.
- **JS only.** No new dev build is planned for §17. Spot illustrations are plain SVG through `react-native-svg` (already installed).
- **Migration rule:** a screen moves to the new kit when its step redesigns it (U5–U11). Until then it
  keeps its own styles. U2's ratchet test makes sure the count of hand-rolled styles only goes down.

## Context
**Planned 2026-10-09.** The owner: "This app feels like a vibe-coded app… make it a commercial-level
app with a more human-friendly design; the app flow can be improved so users find the features at their
fingertips."

A read-only UX audit (2026-10-09) found:
- no shared Button, Card, ListItem, Sheet or Header components;
- inconsistent type, with Figtree barely applied;
- developer-flavoured icons and no press feedback;
- Android dropping `Alert` buttons;
- tools hidden behind long-press and a horizontal scroll;
- no document rename;
- Back targets that lose your place;
- a fake viewfinder on the Scan tab;
- a Deliver screen with no preview and an inert option;
- a 14-item flat More sheet in the Reader.

**Owner's decisions (2026-10-09):**
1. **Before launch:** §17 ships before §11.
2. **Visual direction: a bolder student brand.** More colour, illustrations and personality, still
   consistent.
3. **Navigation:** restructure is allowed: **Home · Files · [Scan] · Tools · Me**, with icons and labels.
   **Tapping the centre Scan button opens the scanner at once** with the last-used mode.

**Choices made in this plan** (the owner can overrule any of them; record a change here):
- **Typefaces:**
  - Caprasimo (the brand's display face) for screen titles, hero numbers and celebration moments.
  - **Figtree for all other text**, made the default through a `Text` component.
- **Colour:**
  - The logo's greens are the primary accent (§15 V3).
  - A warm marigold **"highlighter"** accent for highlights, celebrations and the Pro pass.
  - Course colours become vivid tinted cards.
- **Spelling:** **UK spelling, sentence case** everywhere (the launch market is Bangladesh; the code
  comments already use UK spelling).
- **Merge and Split keep the originals** by default; "Delete the originals" is an option in the confirm.
  Today both delete the originals with no confirm (`useDocumentListActions.tsx:220-232`).
- **Home is always the start screen,** also with no courses (today: Capture until a course exists,
  `bootstrap/startScreen.ts:8-10`).

## What the code looks like today (2026-10-09)

### 1. Screens
| Screen | Lines | Notes |
|---|---|---|
| `ReviewScreen.tsx` | 921 | Up to 12 stacked layers (`:567-723`); no on-screen Back (`:524-529`, deliberate); undo/redo 36 dp with 4 dp hitSlop (`:532-549, 897-902`); "OCR" as a button label (`components/review/ContextBar.tsx:27`). |
| `ReaderScreen.tsx` | 846 | §18 covers it. |
| `DeliverScreen.tsx` | 821 | No page preview; sections Name, Format, Quality, *More options*, Course, Type, *Submission* (`:528-698`); "Margin: Small" is a static row that looks like an option (`components/deliver/MoreOptionsPanel.tsx:42-45`); the Submission collapsible holds 7 controls (`:611-696`); heavy sticky footer (`components/deliver/StickyActions.tsx:23-49`); the whole save pipeline is inline (`:173-457`); after saving: just a "Saved · {course}" snack (`:397-402`). |
| `AcademicOptionsScreen.tsx` | 597 | |
| `CourseScreen.tsx` | 455 | The sort banner, Deadlines and Bookmarked sit outside the FlatList (`:195-258`); Submissions are buried in the list footer (`:285-297`); 3–4 unlabeled header icons, including `git-pull-request-outline` for Sort (`:160-191`); Exam pack only as an unlabeled "layers" icon (`:160-169`). |
| `HomeScreen.tsx` | 444 | The Scan pill, banner and tab bar stack at the bottom, about 170 dp (`:273-285`); "Due soon" always renders, with an empty state (`:169-194`); the header is a semester name + chevron in Caprasimo 26 (`:108-124`); only one Continue card (`:147-167`); no search, no import, no tools; the course menu is an `Alert` with up to 5 buttons (`:89-101`), and Android drops the extras. |
| `LibraryScreen.tsx` | 414 | Up to 6 bands above the first row (`:183-282`); 3 unlabeled header icons, a "document" icon meaning "Open a file" (`:186-201`); no sort, no grid; "Open a file" opens it as an outside file, not into the Library (`:155-174`), and it is also the empty state's second button (`:254`). |
| `SettingsScreen.tsx` | 416 | About 14 sections, 35+ controls; opens on 4 profile fields + a logo uploader, then a `{token}` naming template (`:97-99`, `components/settings/NameTemplateSection.tsx:65-71`); two language lists with one real language (`:118-145`); each `SettingRow` is its own card (`components/settings/SettingRow.tsx:50-58`); unused styles `proCard`, `proTitle`, `proSubtitle`, `replayButton` (`:379-410`). About shows §15 V4's `BrandMark`. |
| `StorageScreen.tsx` | 330 | Back always goes to Settings (`navigation/backHandling.ts:59-63`), even when opened by the space guard (`store/useSpaceGuard.ts:34,53`). |
| `OnboardingScreen.tsx` | 296 | Page 1 has §15 V4's `BrandMark` and three plain step icons, no illustration (`:101-122`); pages 2–3 are forms; page 3 mixes course setup with the crash opt-in (`:154-166`); the example file name is in monospace (`:269`). |
| `ExamPackScreen.tsx` | 281 | "Clear" empties the pack with no confirm (`:100-104`). |
| `CaptureScreen.tsx` | 270 | A fake viewfinder: a big icon + the mode name, no preview (`:140-144`); the tab bar background is hard-coded `rgba(0,0,0,.5)` (`:165`). |
| `ProScreen.tsx` | 227 | All text: a kicker, a title, a feature list, a "free" card (`:83-126`); a lone Back button, no title. |
| `BackupScreen.tsx` | 176 | "Restore from backup…" and "Import course or documents…" call the same function (`:94, 100`). |
| `ManageFoldersScreen.tsx` | 65 | Course list with tap-to-edit; the same list elsewhere opens the course (`components/courses/CourseList.tsx:124`). |

### 2. Navigation and where the features are
- **3 text-only tabs** (Home | Scan | Library), shown only on those 3 screens
  (`components/shared/TabBar.tsx:21-25`). The Home Scan pill opens the scanner (`HomeScreen.tsx:77-80`);
  the Scan tab opens Capture without the camera (`TabBar.tsx:38-40`).
- **Library selection bar** (`components/library/SelectionBar.tsx:13-28`), reached only by long-pressing a
  row (`FileRow.tsx:50-51`). Its 11 tools are 72 dp each in a horizontal scroll with the indicator hidden
  (`:63, 94-100`), so Merge, Split, Compress, Sign, Cover and Delete are off screen. A selected row
  shows only a border colour (`FileRow.tsx:52-55`). Merge, Split and Compress show no progress
  (`useDocumentListActions.tsx:212-238`). Sign is always page 1 (`:259-261, 290, 295`).
- **Long-press only:** document selection, the Home course menu (`HomeScreen.tsx:215`), the bookmark label
  (`components/reader/ReaderTopChrome.tsx:131`), page-grid selection (`components/shared/PageGrid.tsx:50`).
- **Courses in 3 places,** each behaving differently (Home cards; Library's Courses tab with ⋯; Settings →
  Manage courses).
- **Library tabs** "★ Starred | Recent | Courses" mix kinds of content; the default is the middle tab
  (`components/library/LibraryTabs.tsx:6`, `store/slices/librarySlice.ts:67`).
- **No rename** of a document anywhere (no UI sends a name to `library/UPDATE_FILE`).
- A multi-page JPG document shares and prints page 1 only (`services/sharing/shareService.ts:41-44, 56-57`).

**Tap counts today** (from Home, one course):

| Task | Taps |
|---|---|
| Scan to a saved PDF | 3 (Save is a text link; Submit is the big button) |
| Import a PDF/Word file into the Library | 4 (Library → file icon → picker → ⋮ → Add to Library) |
| Merge | 4 + a swipe |
| Sign | 4 |
| Convert to Word | 4 |
| Exam pack | 2 (an unlabeled icon) |
| Search everything | 2 (not possible from Home) |
| Rename | impossible |

### 3. Design system
- **Shared today:** `BottomBar`, `Pill`, `SegmentedControl`, `EmptyState`, `Hint`, `Snackbar`,
  `TextPromptModal`, `SettingRow`. **Missing:** Button, IconButton, ScreenHeader, Card, ListItem,
  BottomSheet, Chip, TextField. `NameField` acts as the text field but lives in `components/deliver/`.
- **Counts:**

  | What | Count |
  |---|---|
  | Files with their own `StyleSheet.create` | 115 |
  | Separate primary-button style blocks | 35 (heights 34–52 dp) |
  | `header:` blocks | 26 |
  | Icon-button blocks | 22 |
  | `Modal` files | 29 (15 fade, 14 slide; 5 with a drag handle; sheet radius 24 or 18) |
  | Distinct scrim alphas | 9 |
  | Separate chip components | at least 5 |
  | Inline `style={{…}}` | 74 |
- **Typography:**
  - `theme/typography.ts:31-38` has a 6-entry `typeScale`, used 18 times.
  - There are 337 hard-coded `fontSize` values (20 distinct sizes, including 11.5, 12.5, 13.5, 14.5 and
    15.5) and 208 `fontWeight` values against 38 `fontFamily`.
  - Figtree is applied in only 9 places, so most text is Roboto.
  - Screen titles come in 6 sizes (20–30).
  - Section labels come in 3 styles.
- **Radii:** 66 hard-coded radii (21 distinct values). Cards use 16 in 9 places but `radii.card` (12) in 54.
  Text fields are a pill (`NameField.tsx:52-58`), 12 (`TextPromptModal`) or 10 (the Reader's password field).
- **Colours that ignore the theme:** `Snackbar.tsx:66-74`, `bootstrap/ErrorBoundary.tsx:52-65` (always
  light), `TxtView.tsx:117,131`, `FileRow.tsx:151`.
- **Tokens** (`theme/tokens.ts`): `bg, surface, surface2, ink, muted, edge, accent, accentInk, onAccent,
  accentSoft, danger, courseColors`. No success, warning, info, elevation or highlight.
  `theme/spacing.ts`: spacing xs–xxl (used well: 476 token uses against 36 literals), radii
  `chip 8, card 12, thumb 6, full`, `MIN_TOUCH 48`.
- **Icons:**
  - Ionicons in 55 files (MaterialCommunityIcons only in `DocxEditor`).
  - Developer icons: `git-merge-outline` and `git-branch-outline` (Merge/Split), `git-pull-request-outline`
    (Sort), `contract-outline` (Compress), `reload-outline` (Rotate), a paint bucket for Mark
    (`ReaderToolBar.tsx:11`).
  - One icon, several meanings: `document-attach-outline` (Convert to PDF, Add cover, Change cover),
    `create-outline` (Sign, Edit course), `document-text-outline` (Convert to Word, Extract text).
  - Sizes 18–22 for the same role.

### 4. Copy (`src/i18n/en.ts`)
Line numbers in the catalog move often, so the strings are quoted; find them with `grep -nF`.
- **Jargon:** 'Deliver' (the screen title), 'OCR' (a button, and 'OCR finished · text is searchable'),
  'Naming template', the `{course}_{type}{n}_{date}` footnote, 'Can use {name}, {roll}, … {X} and {Y}',
  '1 MB here is 1,000,000 bytes, the way upload forms count', 'Will be ≤ {size}', 'Geometric border',
  'Stamping page…', 'Flatten', "This file isn't in UTF-8…", 'Extract text (.txt)', 'Convert/Edit',
  'Not actually encrypted'.
- **Awkward:** 'Eco-Save (2 Pages per Sheet - Side-by-Side)…', 'Standard (1 Page per Sheet).',
  'Compressed · done'.
- **Inconsistent case:** 'Start Capture', 'All Pages', 'Page Layout' (next to 'Page size'), 'Save & Share',
  'Sort Unsorted'. Symbols inside strings: '+ Add deadline', 'Set up →'.
- **Mixed spelling:** 'Accent colour' and 'Keep pen colour' next to the 'Color' filter; 'organize'.
- 126 hint, footnote, subtitle and body strings.
- Literals the guard test misses: `submitLabel = 'Save'` (`TextPromptModal.tsx:25`), `'  · Archived'`
  (`CourseList.tsx:133`).

### 5. Feedback and motion
- 273 `Pressable`s with zero pressed styles and zero `android_ripple`; the only exception is the
  shutter's scale animation (`components/capture/CaptureControls.tsx:42-44`).
- Every navigation, tab switches included, is the same 240 ms slide (`navigation/transitions.ts:4`).
- About half the sheets fade instead of sliding.
- The snackbar appears and disappears instantly, one at a time (`Snackbar.tsx:29`).
- Collapsibles jump with no animation (`DeliverScreen.tsx:611`, `MoreOptionsPanel.tsx:40`); there's no
  `LayoutAnimation` anywhere.
- Skeleton only in the Library (`LibraryScreen.tsx:225`). No busy state for Merge, Split, Compress, Share
  or Print.
- Confirmations: 26 native `Alert.alert` plus custom modals. Delete confirms; Merge, Split and Exam-pack
  Clear don't.
- Haptics: 6 sensible call sites (`services/feedback/haptics.ts`). 4 one-time hints
  (`services/hints/hints.ts`).

---

## The target

### Information architecture
```
┌──────────────────────────────────────┐
│ Home   Files   ( Scan )   Tools   Me │   persistent tab bar, icons + labels
└──────────────────────────────────────┘
```
| Tab | Holds |
|---|---|
| **Home** | Greeting + semester switcher, a search bar (searches everything), "Scan as" mode chips + Import photos / Import file, Continue (3), course cards, Due soon (only when due), Recent files, a compact Pro pass card. |
| **Files** | Courses as folders on top, then documents. Search, Filter (one sheet), Sort, list/grid, row ⋯ menus, Select. |
| **Scan** (centre, raised) | Tap: the scanner opens at once with the last mode. Long-press: the mode sheet (Notes, Document, Board, Book, ID card, plus Import photos / Import file). |
| **Tools** | Every tool, grouped, each one flow: pick → options → progress → result. |
| **Me** | Profile card, Pro pass, then grouped settings. |

Pushed on top of a tab: Course, Reader, Review → Save → Done, Academic options, Exam pack, Pro, Backup,
Storage, Manage courses, Onboarding. Back pops (§16 G2).

**Tap-count targets** (checked in U14):

| Task | Taps |
|---|---|
| Scan → saved | ≤ 3 |
| Import a file into Files | 2 |
| Rename | 2 |
| Merge | ≤ 4 |
| Sign | 3 |
| Convert | 3 |
| Exam pack | 2 |
| Search everything | 1 |

### Brand system ("bold student")
- **Colour:** the logo greens as the accent (§15 V3: light `#1e754a`, dark `#37ae79`). Marigold
  **highlight**. Course colours as vivid tints. Semantic success, warning, info and danger. Cream paper
  backgrounds stay (`#f5ead8` / `#14120f`, matching the splash).
- **Type:**
  - Caprasimo: `display` 32, `headline` 26, `title` 20.
  - Figtree for everything else: `subtitle` 17/600, `body` 16/400, `bodyStrong` 16/600, `label` 14/600,
    `caption` 13/400, `overline` 12/700 uppercase with tracking.
- **Shape:**
  - Buttons: 52 dp pill (primary), 44 dp (compact).
  - Cards: radius 20. Sheets: 28. Chips: full pill. Inputs: 14.
  - Soft shadows in light mode; tonal surfaces (no shadows) in dark.
- **Illustrations:** flat, in the brand palette (forest greens, marigold, cream), built on the logo's
  page-with-folded-corner motif. Used for empty states, success, Pro and onboarding.
- **Icons:** Ionicons only, through one semantic map (`theme/icons.ts`); 22 dp in bars, 20 in rows.
- **Motion:**
  - Push slides 240 ms; tabs cross-fade 150 ms; sheets spring up.
  - Presses scale to 0.97 with a ripple.
  - Celebration on "Saved".
  - Everything honours reduced motion (`theme/useReducedMotion.ts`).

---

## U1 · Tokens v2 *(M)*
Status: planned. JS only.

Goal: every colour, size, radius, shadow, duration and icon the redesign needs is a token, in both themes,
with contrast checked.

Files: `theme/tokens.ts`, `theme/typography.ts`, `theme/spacing.ts`, new `theme/{elevation,motion,icons}.ts`,
`theme/index.ts`, `theme/__tests__/contrast.test.ts`, new `theme/__tests__/tokens.test.ts`.

Changes:
- **`ThemeTokens` gains:**
  - `highlight` (a marigold fill), `highlightInk` (text and icons in marigold on paper), `onHighlight`
    (text on the fill), `highlightSoft` (a tinted background).
  - `success`, `warning`, `info`, each with `…Soft`.
  - `surface3` (raised sheets in dark), `scrim` (one value), `focus` (the focus ring).
  - Starting points to tune by eye:

    | Token | Light | Dark |
    |---|---|---|
    | `highlight` | `#f2b705` | `#f5c542` |
    | `highlightInk` | `#8a5a00` | `#ffd970` |
    | `onHighlight` | `#201e1d` | `#201e1d` |
    | `highlightSoft` | `#fbecc0` | `#3a3015` |
    | `success` | `#2e7d32` | `#81c995` |
    | `warning` | `#9a5b00` | `#f6b26b` |
    | `info` | `#1d5fbf` | `#8ab4f8` |

    All must pass the same rules as the accent in `contrast.test.ts`.
- **`courseTint(color, theme)`** (a pure function in `services/courses/palette.ts`): a soft card background
  for a course, its colour mixed into `surface` at about 14% light / 22% dark. The course's own colour
  stays the text/ink.
- **`typography.ts`:** typeScale v2 (see "The target"). Keep the old keys as aliases until U2's `Text`
  is everywhere (`display` stays, `title` stays).
- **`spacing.ts`:** radii v2 `{ xs: 6, chip: 999, input: 14, card: 20, sheet: 28, button: 999, thumb: 8 }`.
  Keep `radii.card` and `radii.chip` as keys (54 call sites), with the new values. Check the screens that
  use `radii.card * 2` / `* 1.5` for sheets; U3 replaces them with `radii.sheet`.
- **`elevation.ts`:** `elevation(level: 0|1|2|3, theme)`, returning `shadowColor/Offset/Opacity/Radius`
  + `elevation` in light, and a tonal `backgroundColor` step in dark (no shadows on dark).
- **`motion.ts`:**
  - durations `{ fast: 120, base: 200, slide: 240, slow: 320 }`;
  - springs `{ sheet, press, pop }` (Reanimated configs);
  - `useMotion()`, which returns zero-length durations under reduced motion.
- **`icons.ts`:** `ICONS: Record<ActionId, IoniconName>`, one entry per action, for example merge `albums-outline`,
  split `cut-outline`, compress `resize-outline`, rotate `refresh-outline`, sort `swap-vertical-outline`,
  mark `brush-outline`, sign `pencil-outline` (pick by eye; no two actions share an icon). Typed so a missing action fails the typecheck. Sizes `{ bar: 22, row: 20,
  inline: 16 }`.

Tests: `contrast.test.ts` covers every new token pair in both themes (and every accent);
`tokens.test.ts`: `courseTint` keeps each course's ink ≥ 4.5:1 on its tint; `ICONS` has no duplicate
values; `useMotion` under reduced motion.

Device check: Verification 1.

## U2 · The UI kit *(L)*
Status: planned. JS only. Split point: (a) Text, Button, IconButton, Touchable, Card, ListItem, Chip and
the ratchet test; (b) ScreenHeader, TextField, Badge, ProgressBar, Skeleton and the gallery.

Goal: one set of components that every screen is built from, so the app looks designed by one hand.

Files: new `src/components/ui/{Text,Button,IconButton,Touchable,ScreenHeader,Card,ListItem,Chip,TextField,Badge,ProgressBar,Skeleton,Divider,index}.tsx`,
new `src/dev/UiGalleryScreen.tsx` (+ a Settings → Developer row), new
`src/__tests__/designSystem.test.ts` + `src/__tests__/designSystem.baseline.json`,
`components/deliver/NameField.tsx` (becomes a thin wrapper of `TextField`, or is replaced).

Changes:
- **`Text`:** `variant` (the typeScale v2 keys), `color` (token name or value), `numberOfLines`,
  `maxFontSizeMultiplier` (defaults from the variant; `CHROME_MAX_FONT_SCALE` for chrome). It applies the
  Figtree family that matches the weight, so `fontWeight` is never set without a family.
- **`Touchable`:** the base of every pressable.
  - `android_ripple` in a token colour, and a Reanimated scale to 0.97 on press (none under reduced motion).
  - An optional `haptic` (`services/feedback/haptics.ts`).
  - `accessibilityRole` is required (keeps `a11yLabels.test.ts` happy), and `touchSlop` up to `MIN_TOUCH`.
- **`Button`:** `variant: 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'highlight'`,
  `size: 'lg' | 'md' | 'sm'` (52/44/36 dp), `icon`, `loading` (a spinner, label kept for width,
  `accessibilityState.busy`), `disabled`, `fullWidth`.
- **`IconButton`:** 44 dp visual, 48 dp touch; `variant: 'plain' | 'tonal' | 'filled'`; `badge`; required
  `accessibilityLabel`.
- **`ScreenHeader`:**
  - `title`, `subtitle`, a `back` handler (draws the back button), `actions` (an IconButton row, max 3,
    the rest in a ⋯ `Menu` from U3).
  - `large` mode: a Caprasimo headline that shrinks into the bar as the content scrolls, driven by a
    Reanimated scroll handler passed in through `useScreenHeader()`.
  - Handles the top safe-area inset (today each screen does).
- **`Card`:** `tone: 'surface' | 'tinted' | 'accent' | 'highlight'`, `tint` (a course colour), `elevation`,
  `onPress` (then it renders through `Touchable`).
- **`ListItem`:** leading (icon / thumbnail / avatar), title, subtitle, meta, trailing (chevron / switch /
  ⋯ / checkbox), `selected` with a **visible checkbox**, `onPress`/`onLongPress`.
- **`Chip` / `FilterChip`:** selected state with a check icon, a count, a close "×". Replaces the 5 chip
  components as their screens are redone.
- **`TextField`:** label, helper, error, a clear button, a leading icon, `multiline`, keyboard insets
  (§14 Q4). Radius `radii.input`.
- **Also:** `Badge` (Pro, counts, "New"); `ProgressBar` (determinate/indeterminate); `Skeleton` (a
  shimmer, a static block under reduced motion); `Divider`.
- **UI gallery** (dev only): every component in every variant, in light and dark, at font scale 1 and
  1.3. A screenshot of it goes in the step's "As built" notes.
- **Ratchet test** `designSystem.test.ts`: a source scan over `src/**/*.tsx` outside `components/ui/`,
  `src/dev/` and `theme/`. Per file, it counts:
  - `fontSize:` literals;
  - hex colour literals;
  - `borderRadius:` number literals;
  - `fontWeight:`;
  - `Alert.alert(`;
  - `<Pressable` (should become `Touchable`);
  - `<Modal` (should become U3's `Sheet`/`Dialog`).

  It compares the counts with `designSystem.baseline.json`. A file whose count goes **up** fails; a
  count that goes down must be lowered in the baseline in the same change (the test prints the new
  numbers). Generate the baseline in this step.

Tests: render tests for `Button` (loading and disabled states, the a11y role and state), `Text` (variant
→ family), `ListItem` (checkbox state read by TalkBack: `accessibilityState.checked`); the ratchet;
`hardcodedStrings` and `a11yLabels` stay green.

Device check: Verification 2.

## U3 · Sheets, dialogs and menus *(L)*
Status: planned. JS only. Split point: (a) `Sheet`, `Dialog`/`useConfirm`, `Menu` + all 26 `Alert.alert`
replaced; (b) the 29 Modals moved onto `Sheet`.

Goal: every sheet, dialog and menu looks and behaves the same, and no Android button is ever dropped.

Files: new `src/components/ui/{Sheet,Dialog,Menu}.tsx`, new `src/components/ui/useConfirm.tsx` (a host
mounted once in `App.tsx` next to `Snackbar`), every `Alert.alert` call site (26) and `Modal` file (29),
`shared/TextPromptModal.tsx` (becomes `Dialog` with a `TextField`).

Changes:
- **`Sheet`:**
  - Its own overlay: a Reanimated slide-up with `motion.springs.sheet`, one `tokens.scrim`, a drag
    handle, drag down to dismiss (velocity aware), tap the scrim to close.
  - Android Back closes it (`useBackHandler`).
  - `snapPoints` (`'content' | 'half' | 'full'`), keyboard-aware (§14 Q4's rule), bottom inset
    (`bottomBarHeight`), radius `radii.sheet`, `title`, `footer` (sticky actions).
  - It renders in a portal host at the root, so it covers the tab bar.
- **`Dialog`:** title, body, up to 3 buttons laid out vertically when they don't fit, a `destructive` style.
  **`useConfirm()`** returns
  `confirm({ title, body, confirmLabel, destructive, options?: [{ id, label, defaultChecked }] })`, a
  `Promise` that resolves to `{ confirmed, options }`. The options are checkboxes, used by U7's "Delete
  the originals".
- **`Menu`:** an action sheet with grouped `sections: { title?, items: { id, label, icon, destructive?,
  disabled?, badge? }[] }[]`, opened from a ⋯ IconButton or a long-press. It replaces every `Alert` menu
  (Home course menu `HomeScreen.tsx:89-101`, `CourseList.tsx:48-78`, …) and §18 W23's Reader More sheet.
- **Migrate:** each `Alert.alert` → `useConfirm` or `Menu`; each `Modal` sheet → `Sheet`; dialogs →
  `Dialog`. Full-screen modals (Mark mode, editors) stay full-screen, but use `ScreenHeader`. Remove the
  per-file scrim and backdrop styles.

Tests: `Menu` renders sections and calls `onSelect` with the id; `useConfirm` resolves with the options;
`Sheet` closes on Back (mock `BackHandler`); the ratchet's `Alert.alert` and `<Modal` counts drop to 0
outside `components/ui/` (lower the baseline).

Device check: Verification 3.

## U4 · Illustrations and brand moments *(M)*
Status: planned. JS only.

Goal: empty, success and error moments look made for students, not like placeholders.

Files: new `assets/illustrations/*.svg` (plain SVG), new `src/components/ui/Illustration.tsx`,
`components/shared/EmptyState.tsx` (v2), new `src/components/ui/SuccessBurst.tsx`,
`theme/__tests__/brandSync.test.ts` (extend its security scan to `assets/illustrations/`), `i18n/en.ts`.

Changes:
- **Illustrations** (about 240 × 180, flat, brand palette, the folded-corner page motif):
  - `empty-files`: a stack of pages with a plus;
  - `no-courses`: a backpack with folders;
  - `all-done`: a ticked page with marigold sparkles;
  - `no-results`: a page with a magnifier;
  - `offline-ad`: a cloud with a dotted line;
  - `saved`: a page flying into a folder;
  - `error`: a page with a gentle crease;
  - `pro`: a page with a marigold star.

  Each SVG is checked into `assets/illustrations/` and drawn through `react-native-svg`'s `SvgXml` or as a
  component made from it.
  - **Colours:** the SVG uses named placeholder colours, and `Illustration` maps them to tokens at render
    time, so dark mode works (e.g. `#00FF01` → `tokens.accent`). The test checks that every fill is one of
    the placeholders.
  - Owner's option: commission or draw them in Figma; the component and test don't change.
- **EmptyState v2:** illustration, title (Caprasimo `title`), one short line, up to 2 Buttons. Every empty
  state uses it, with no instruction paragraphs ("Tap “+ Add deadline”…").
- **`SuccessBurst`:** a short (≤ 600 ms) burst of marigold and green paper dots around a check, with a
  haptic. Static under reduced motion. Used by U9's Done screen and U8's tool results.
- `BrandMark` (§15 V4, done) is already on Onboarding page 1 and Settings → About; U10/U11 keep it.

Tests: the security and colour scan; `Illustration` renders each id in both themes; EmptyState renders its
actions with roles; `hardcodedStrings` stays green.

Device check: Verification 4.

## U5 · The new shell: 4 tabs + the centre Scan button *(L)*
Status: planned. JS only. Needs §16 G2.

Goal: the five-slot tab bar (Home, Files, Scan, Tools, Me) is always there on the tab roots; one tap scans.

Files: `components/shared/TabBar.tsx` (rewritten), `navigation/navStack.ts` (tab ids), `types/navigation.ts`
(`'tools'` screen; `'files'` is the UI name of `'library'`, keep the id), new `screens/ToolsScreen.tsx` (a
stub until U8), `screens/SettingsScreen.tsx` (now the Me root), `screens/CaptureScreen.tsx` (removed),
`bootstrap/startScreen.ts`, `navigation/backHandling.ts`, `services/courses/startScan.ts`, new
`components/capture/ScanModeSheet.tsx`, `store/useGalleryImport.ts` (callable from anywhere),
`services/hints/hints.ts`, `i18n/en.ts`.

Changes:
- **TabBar:**
  - Five slots: Home (`home-outline` / `home` when active), Files (`folder-outline`), **Scan** (a raised
    64 dp accent circle with a `scan` icon, label under it), Tools (`grid-outline`), Me
    (`person-circle-outline`).
  - The active tab gets a filled icon and a soft pill behind it. Labels `label`; `CHROME_MAX_FONT_SCALE`.
  - It reports its height (insets as §14 Q3).
- **The Scan button:**
  - **Tap:** `startScan(state, dispatch, null, { launch: true, mode: settings.lastCaptureMode })`, so the
    ML Kit scanner opens at once. The pipeline goes to Review when pages land (unchanged).
  - **Long-press**, or the one-time hint's "Choose a mode": `ScanModeSheet`, which shows the five modes
    from `CAPTURE_MODES` as big tiles with their hint text, plus Import photos (`useGalleryImport`) and
    Import file (U7's import). Choosing a mode remembers it (`settings/SET_LAST_CAPTURE_MODE`) and scans.
  - When the scanner is unavailable (`settings.scannerUnavailable`), the existing camera fallback in
    `scannerPipeline` runs, as today.
- **Remove `CaptureScreen`** (and its fake viewfinder). Anything only it did moves:
  - the mode picker → `ScanModeSheet`;
  - gallery import → the sheet, Home and Tools;
  - the Settings icon → the Me tab;
  - the first-run state → `startScreen`.

  Review's Retake, Add more and Start capture call `startScan` with `launch: true` (they already do). Back
  from Review goes to the tab it was started from, with the discard confirm (`confirmDiscard`), not to
  Capture.
- **Start screen:** always Home (`startScreen.ts`, `rootScreen()` in `backHandling.ts`).
- **Me** is `SettingsScreen` as a tab root (no back button; U10 redesigns it). Remove the gear icons from
  Home and Library headers.
- **Tools** shows a placeholder list of the existing entry points until U8.
- **Strings:** `shared.tabs.{home,files,scan,tools,me}`, `capture.modeSheet.*`.

Tests: `navStack` and `backHandling` with the new tabs; `startScreen` always returns Home; `ScanModeSheet`
calls `startScan` with the chosen mode; `a11yLabels` (each tab has `accessibilityRole="tab"`, the Scan button
is a `button` with a label); `safeArea.test.ts`.

Device check: Verification 5.

## U6 · Home *(M)*
Status: planned. JS only.

Goal: Home answers "what do I do now?": scan, continue, find, what's due.

Files: `screens/HomeScreen.tsx` (rebuilt on the kit; logic split into `components/home/*`), new
`components/home/{HomeHeader,QuickActions,ContinueCarousel,CourseGrid,DueSoon,RecentFiles,ProPassCard}.tsx`,
`components/courses/SemesterSwitcher.tsx`, `components/ads/BannerSlot.tsx` (placement), `i18n/en.ts`.

Changes:
- **`HomeHeader`:** "Good morning, {firstName}" (from `settings.profile`, or "Hi there"), with the semester
  as a tappable `Chip` with a chevron ("Spring 2026 ▾") under it. It opens the switcher `Sheet`.
- **Search bar** (a `TextField` look-alike that opens Files with search focused): one tap to search
  everything.
- **`QuickActions`:** a horizontal row of mode chips, "Scan as: Notes · Document · Board · Book · ID card"
  (each starts that mode at once), then Import photos and Import file. The scan hint (`useHint('scan')`)
  points at the centre button instead.
- **`ContinueCarousel`:** the last 3 opened documents (`settings.lastOpened`, plus a short recent list kept
  in settings), each a `Card` with its thumbnail, title, course tint and "Page 12 of 40".
- **`CourseGrid`:** course cards on their tint (`courseTint`), with name, document count and next class
  time, plus a visible ⋯ (`Menu`: Edit, Move earlier, Move later, Archive), keeping long-press as a
  shortcut. "Add course" is the last card.
- **`DueSoon`:** shown **only** when something is due in 7 days, overdue first. Otherwise a small "Add a
  deadline" chip in the header row of the next section.
- **`RecentFiles`:** 5 recent documents as `ListItem`s, "See all" → Files.
- **`ProPassCard`:** compact: "Pro pass active · 42 min left" (highlight tone) or "Get 1 hour of Pro" (a
  ghost button). Hidden when Pro features are off in Remote Config.
- **Banner ad:** inside the scroll, between Courses and Recent files (an inline adaptive banner), so the
  bottom no longer stacks the Scan pill, the ad and the tab bar. Check `services/ads/adPolicy.ts`'s rules
  (banner placements) and update them with the owner's AdMob placement note in `docs/ads.md`.

Tests: the section rules (`dueSoon` empty → no section; the continue list keeps at most 3; the greeting
name fallback); `a11yLabels`; `hardcodedStrings`.

Device check: Verification 6.

## U7 · Files (the Library) *(L)*
Status: planned. JS only. Split point: (a) layout, filter sheet, sort, row menu, rename, import; (b)
selection mode, bar, merge/split with progress + undo.

Goal: every document action is visible from the file itself, and the list reads like Google Files.

Files: `screens/LibraryScreen.tsx` (rebuilt; UI name "Files"), `components/library/*`
(`FileRow` → `ListItem`, `SelectionBar` rewritten, new `FilterSheet`, `SortMenu`, `FileGridItem`,
`useDocumentActions.ts` shared with the Reader), `components/library/useDocumentListActions.tsx`, new
`services/library/{rename,documentFilters,documentSort}.ts`, `services/persistence/libraryOperations.ts`
(merge/split keep originals), `services/files/externalFileService.ts` (import into the library),
`store/slices/librarySlice.ts` (sort, view and filter state; persisted per device in settings),
`i18n/en.ts`.

Changes:
- **Layout:** a `ScreenHeader` (large title "Files") with Search and Select actions, then a horizontal row
  of **course folders** (a tinted card per course, "Unsorted" last; tap → Course). Then a sticky
  toolbar: Filter (with a count badge) · Sort · list/grid toggle. Then the documents. The old tabs go:
  Starred and Recent become filter and sort choices ("Starred" a quick chip next to Filter).
- **`FilterSheet`:** course (multi), type, submitted, bookmarked, show archived, starred. Active filters show
  as removable chips under the toolbar. One pure `documentFilters.apply()`, tested.
- **Sort:** date modified, date created, name, size, course; ascending/descending (`documentSort`).
- **Row ⋯ `Menu`** (and the same menu from a long-press), in sections:
  - Open, Share, **Rename**;
  - Move to course, Star, Type;
  - Merge with…, Split, Compress, Sign, Add cover;
  - Delete.

  Items that don't apply to a format are hidden (`documents/formatCapabilities.ts`). Shared with the Reader
  through `useDocumentActions` (§18 W23 reuses it).
- **Rename** (new): a `Dialog` with a `TextField`, prefilled and selected. It sanitizes with
  `sanitizeFileName` and dispatches `library/UPDATE_FILE { name, searchHaystack }` (rebuild the haystack
  only if G4 kept it). The file on disk keeps its name (paths are by doc id); exports use the new name
  through `shareService.shareAs`.
- **Select mode:** the "Select" header action (or a long-press) shows checkboxes on every row, and a header
  with "{n} selected", Select all (§14 Q5's `SelectAllButton`) and Close.
  - The **selection bar** has 4 main actions (Share, Move, Merge when 2 or more, Delete) and More (a
    `Menu` with the rest: Submit, Type, Archive, Export zip, Split, Compress, Sign, Cover).
  - Nothing scrolls sideways. Disabled actions explain why in a small toast.
- **Merge and Split:**
  - A `useConfirm` with the checkbox "Delete the originals" (off by default).
  - Progress through U13's `useTask` (or a Sheet with a `ProgressBar` until U13 lands).
  - The result is selected and scrolled to, with a snack "Merged into {name} · Open".
  - `libraryOperations.mergeDocuments`/`splitDocument` already return new documents; the list action
    stops deleting the originals unless asked.
  - An **undo** snack for the deletion case: delete the files only after the snack expires
    (`persistence/libraryFiles.deleteDocumentFiles` called on expiry; dispatch the removal at once).
- **Import file:** the picker → `promoteExternalToLibrary` (with the current course filter as the course,
  else Unsorted) → a snack "Added {name} · Open". This fixes "Open a file" opening outside the library.
  The Reader's "Add to Library" stays for "Open with" files.
- **Grid view:** 2 columns of `FileGridItem` (thumbnail card, title, course dot). FlashList (G6) for both
  views.
- **Empty states** (U4): no documents ("Scan your first page" + Import), no results ("Nothing matches
  ‘{q}’" + Clear filters).
- The list keeps its scroll and filters across navigation (G2's kept tab roots).

Tests: `documentFilters` and `documentSort` (every filter, combined, archived rules); `rename` (sanitize,
empty name refused, same name a no-op); the merge/split action with "keep originals" (no
`deleteDocumentFiles` call) and with deletion (called once, after the undo window: fake timers); import
adds a document; `a11yLabels` (checkbox state).

Device check: Verification 7.

## U8 · The Tools hub *(L)*
Status: planned. JS only. Split point: (a) the hub + the pick → run → result flow for Organise and
Share; (b) Convert, Sign & fill, Study + recent tools.

Goal: every tool the app has is two taps away, each with the same simple flow.

Files: `screens/ToolsScreen.tsx`, new `services/tools/toolRegistry.ts` (pure), new
`components/tools/{ToolTile,ToolFlow,ToolResultSheet}.tsx`, `components/reader/DocumentPickerModal.tsx`
(reused; multi-select and filters by format), `components/pro/useProTask.tsx` (Pro tools), existing services
(`persistence/libraryOperations.ts`, `convert/*`, `edit/*`, `study/buildExamPack.ts`, `backup/*`,
`sharing/shareService.ts`), `i18n/en.ts`.

Changes:
- **`toolRegistry`:** one entry per tool:
  `{ id, section, labelKey, descKey, icon (theme/icons), accepts: DocFormat[], min, max, pro: boolean, run }`.
  The sections and their tools:

  | Section | Tools |
  |---|---|
  | **Scan & import** | Scan, Import photos, Import file |
  | **Organise** | Merge, Split, Compress, Edit pages, Add cover |
  | **Convert** | Word, Excel or Text → PDF (Pro); PDF or scan → Word (Pro) |
  | **Sign & fill** | Sign, Fill a form (Pro) |
  | **Study** | Exam pack, Extract text, Search everything |
  | **Share & back up** | Submit, Export as zip, Print, Back up |

  A tool's availability comes from `formatCapabilities` and Remote Config (Pro off → Pro tools hidden
  or shown "free today", as `useProFeature` says).
- **`ToolsScreen`:** a large-title header "Tools", a "Recently used" row (the last 4, kept in settings),
  then each section as a 3-column grid of `ToolTile`s (an icon on a tinted circle, a label, a Pro `Badge`).
- **`ToolFlow`** (a full-height `Sheet`), for every tool:
  1. **Pick:** `DocumentPickerModal` filtered to `accepts`, with `min`/`max` (Merge needs 2 or more), and
     "Import a file" at the top, so outside files work too.
  2. **Options:** only where the tool has them (Compress: the size ladder; Split: every page or ranges;
     Convert: format).
  3. **Run:** through `useProTask` for Pro tools (the ad gate, §14 Q1), else directly, with a `ProgressBar`
     and Cancel where the service supports it.
  4. **Result:** `ToolResultSheet` with `SuccessBurst`, the new file's card, and Open · Share · Done.

  Tools that already have their own screen (Edit pages, Add cover → Academic options, Exam pack, Sign) hand
  off to it after Pick.
- Entry points elsewhere stay (row menus, the Reader); the hub is the one place that lists them all.

Tests: `toolRegistry` (every tool has a label, icon and section; ids unique; `accepts` respects
`formatCapabilities`; min/max); `ToolFlow`'s step machine (pick → options → run → result, cancel, a Pro task
goes through `useProTask`); `hardcodedStrings`, `a11yLabels`.

Device check: Verification 8.

## U9 · Scan → Save → Done *(L)*
Status: planned. JS only. Split point: (a) Review; (b) Save, the Submit sheet, Done and the pipeline move.

Goal: from scanner to saved file is clear and short, and the student always knows what happened.

Files: `screens/ReviewScreen.tsx` (+ `components/review/*`), `screens/DeliverScreen.tsx` (becomes the
"Save" screen; keep the id `deliver`), new `services/deliver/saveScan.ts` (the pipeline from
`DeliverScreen.tsx:173-457`), new `components/deliver/{PagePreviewStrip,SubmitSheet}.tsx`, new
`screens/DoneScreen.tsx` (or a full-height `Sheet`), `components/deliver/{MoreOptionsPanel,StickyActions}.tsx`,
`services/capture/ingestBatch.ts` (re-applying mode post-processing), `i18n/en.ts`.

Changes:
- **Review:**
  - `ScreenHeader` with a close (×) that asks to discard, the page count, and Undo/Redo as 48 dp
    IconButtons.
  - One bottom toolbar: Crop · Rotate · Filter · Adjust · **Mode** · More (Retake, Delete page, Reorder →
    `GridPagesModal`, Apply to all).
  - The stacked banners (crop check, ID card, split, low contrast) become **one suggestion chip** above the
    toolbar, showing the most important one ("Looks like a book. Split pages?" [Split] [×]).
  - "OCR" becomes "Make text searchable", inside More, since text is recognised automatically.
  - **Mode after scanning:** a Mode sheet (the five modes). Switching re-applies that mode's
    post-processing to the session (Book split, ID card compose), default filter (unless a page has a
    manual filter) and document type. The work runs through `ingestBatch`'s post-process functions on the
    masters (never mutating a source: new files; AGENTS.md rule), with undo through `pageHistory`.
- **Save (Deliver):**
  - A `PagePreviewStrip` (thumbnails, tap to go back to that page in Review).
  - Name (`TextField`, from the naming rules).
  - Course and Type as chips (open `Menu`/`Sheet`).
  - Format (PDF / JPG `SegmentedControl`); Quality as "Size: Small · Medium · Original" with the estimated
    size.
  - The primary **Save** (52 dp), and **Submit…** (tonal) opening the `SubmitSheet`.
  - "Margin: Small" goes (it never did anything). Remove the "More options" collapsible: its real options
    (the export copy) move into the Submit sheet or Me → Scanning defaults.
- **`SubmitSheet`:** cover, size target, file name (preset choices, U10), page layout, page size, include
  marks, and "Remember for {course}" (the existing course preset, `submit/preset.ts`). The primary is
  **Submit**, which saves, then shares through `shareAs`.
- **Done** (after Save or Submit): `SuccessBurst`, "Saved to {course}" with the file's card, and the
  actions **Open** · **Share** · **Submit** (if not just submitted) · **Scan more**. Back or Done returns to
  the tab the scan started from.
- **`saveScan.ts`:** the pipeline as a pure-ish service, `saveScan(session, options, deps, onProgress)`,
  where `deps` injects the render, OCR, PDF, file and dispatch functions so Jest can test it. The screen
  only collects options and shows progress.

Tests: `saveScan` with mocked deps (page order, one page at a time, OCR reused per G7's `geometryKey`, the
academic copies, the export copy, errors leave no half-saved document); the mode re-apply (Book split on 2
spreads → 4 pages; undo restores 2); the suggestion priority; `hardcodedStrings`, `a11yLabels`,
`safeArea.test.ts`.

Device check: Verification 9.

## U10 · Me (Settings) *(M)*
Status: planned. JS only.

Goal: Settings is short, grouped and friendly; the student's own card comes first.

Files: `screens/SettingsScreen.tsx` (rebuilt), `components/settings/*` (`SettingRow` → `ListItem` in grouped
cards), new `components/settings/{ProfileCard,ProfileSheet,FileNamesScreen or Sheet}.tsx`,
`components/settings/NameTemplateSection.tsx`, `services/submit/naming.ts` (presets), `i18n/en.ts`.

Changes:
- **Top:** a `ProfileCard` (initials avatar on the accent, name, roll, institution; "Add your details" when
  empty). Tap → `ProfileSheet` with the 4 fields + logo. Then the Pro pass card (as on Home).
- **Groups** (each one `Card` holding `ListItem`s with dividers):
  - **Scanning:** default mode, filters per mode, text recognition script.
  - **Reading:** §18's reading settings defaults.
  - **Files & backup:** Backup, Storage, File names.
  - **Privacy & security:** App lock, Crash reports, Usage stats, Personalised ads.
  - **Appearance:** theme, accent.
  - **Help:** WhatsApp and email support, Show the introduction.
  - **About:** `BrandMark` + version.
  - Developer only under `__DEV__`.
- **Language rows** are hidden while only one UI language and one document language exist
  (`i18n/index.ts`). They come back by themselves when a second language is added.
- **File names:** preset choices with live examples. "Course + type + date" (`{course}_{type}{n}_{date}`),
  "Course + date", "Type + date", "Your roll + course + date", plus **Custom…** (today's token editor,
  with chips that insert tokens and a live example). `submit/naming.ts` exports the presets.
- Remove the unused styles (`:374-402`).

Tests: presets produce the expected names (`naming.test.ts`); the language rows' visibility rule;
`a11yLabels`, `hardcodedStrings`.

Device check: Verification 10.

## U11 · Course, Exam pack, Pro and Onboarding *(M)*
Status: planned. JS only. Needs U4.

Goal: the remaining screens match the kit, and nothing important is pinned outside the scroll or
hidden behind an unlabeled icon.

Files: `screens/{CourseScreen,ExamPackScreen,ProScreen,OnboardingScreen}.tsx`, `components/courses/*`,
`components/onboarding/StudentCard.tsx`, `components/pro/FeatureList.tsx`, `i18n/en.ts`.

Changes:
- **Course:**
  - A large title on the course tint, with labelled action chips: Scan (primary), Exam pack, Sort
    unsorted (when there are any), Edit.
  - One `SectionList`: Documents (with the Files toolbar's sort), Deadlines, Bookmarks and Submissions.
    The last three are collapsed headers with counts that expand in place. Nothing sits outside the scroll.
  - The floating Scan button stays (it scans into this course).
- **Exam pack:** `useConfirm` before Clear (destructive); `ScreenHeader`; the pack's page list as
  `ListItem`s.
- **Pro:**
  - A hero with the `pro` illustration and "1 hour of every Pro tool".
  - Benefit tiles (icon + one line) from `PRO_FEATURES`.
  - The primary "Watch an ad to start" (highlight `Button`); the pass status with time left; the daily
    cap ("2 of 3 left today").
  - The "free forever" list as a quiet card.
  - Never text that points to paying outside Google Play (AGENTS.md).
- **Onboarding:**
  - Page 1: keep the `BrandMark` with the wordmark and "Scan, file, submit"; the 3 step icons become small illustrations.
  - Page 2: name and roll (both optional, with "Skip").
  - Page 3: add courses (the existing `CourseSetupForm`), with the crash-report opt-in moved to its own
    small card under it, off by default (unchanged rule).
  - The example file name in Figtree, not monospace.

Tests: Course sections (collapsed counts, expand); Exam pack's confirm; Pro screen texts from the catalog;
the onboarding steps (`services/onboarding`); `a11yLabels`.

Device check: Verification 11.

## U12 · Copy pass *(M)*
Status: planned. JS only. Can run any time after U2.

Goal: every string sounds like a friendly person, not a developer.

Files: `src/i18n/en.ts`, new `docs/copy-style.md`, new `src/i18n/__tests__/copyStyle.test.ts`,
`components/shared/TextPromptModal.tsx:25`, `components/courses/CourseList.tsx:133`.

Changes:
- **`docs/copy-style.md`** (one page):
  - UK spelling; sentence case for buttons, titles and labels.
  - Plain verbs; no file-format jargon unless the student chose a format.
  - No symbols inside strings (icons carry `+` and `→`).
  - Numbers with units ("2 MB"); errors say what happened and what to do next.
  - At most one helper line per control.
- **Rewrite `en.ts`** with the style. Examples:

  | Today | New |
  |---|---|
  | Deliver | Save |
  | OCR | Make text searchable |
  | OCR finished · text is searchable | Text found. You can search this now. |
  | Naming template | File names |
  | Flatten | Lock answers |
  | Extract text (.txt) | Save text as a file |
  | Convert/Edit | Convert or edit |
  | Eco-Save (2 Pages per Sheet - Side-by-Side) | 2 pages per sheet |
  | Standard (1 Page per Sheet) | 1 page per sheet |
  | Will be ≤ {size} | Under {size} |
  | Not actually encrypted | This PDF isn't locked |
  | This file isn't in UTF-8 | Some characters may look wrong |
  | 1 MB here is 1,000,000 bytes, the way upload forms count | (removed) |
  | Compressed · done | Compressed |
  | Color (filter) | Colour |

  Cut permanent footnotes that repeat what the control shows (aim for 126 helper strings → about 60).
  Keep the keys where possible (fewer code changes); rename only where the meaning changed.
- **Move the 2 missed literals** into the catalog.
- **`copyStyle.test.ts`** over `en.ts` values:
  - no US spellings from a list (`color`, `organize`, `favorite`, `center`, `gray`, `license` as a noun…);
  - no Title Case in values under keys ending in `label`, `title`, `button` or `action` (a word list allows
    proper nouns: PDF, Word, Excel, Pro, Google Play, WhatsApp, TalkBack…);
  - no leading `+ ` and no `→`;
  - no `OCR` in UI strings (the services' internal messages are exempt by key prefix).

Tests: `copyStyle.test.ts`; `hardcodedStrings` (the two literals); every screen test that matches text.

Device check: Verification 12.

## U13 · Motion and feedback *(M)*
Status: planned. JS only.

Goal: the app feels alive and responsive: every touch answers, and nothing jumps.

Files: `navigation/transitions.ts`, `bootstrap/AppNavigator.tsx` (transition kinds), `components/shared/Snackbar.tsx`,
new `src/components/ui/useTask.tsx` (+ host), `components/ui/Skeleton.tsx` (placements),
`services/feedback/haptics.ts`, screens with collapsibles.

Changes:
- **Transitions by kind:**
  - push/pop: the existing slide (240 ms, `motion.ts`);
  - tab switch: a cross-fade with a 4 dp rise (150 ms);
  - full-screen modals (Reader tools, editors): slide up;
  - all cross-fade under reduced motion.
- **Collapsibles and list changes:** Reanimated layout animations (`entering`/`exiting`/`layout`:
  `FadeIn`, `LinearTransition`) on expanding sections (Course sections, the Submit sheet's details),
  removed rows (delete, archive) and added rows (merge result). Off under reduced motion.
- **Snackbar:** slides up above the tab bar or bottom bar (`bottomBarHeight`), queues messages (the queue
  exists from §9 O6; animate it), swipe to dismiss, theme tokens instead of hex (`:66-74`).
- **`useTask()`:** `run(labelKey, job, { cancellable })` shows a small progress toast ("Merging… 3 of 5",
  Cancel) for long jobs: merge, split, compress, share/print preparation, export zip, convert. It turns
  into the result snack. It replaces ad-hoc spinners and the jobs that show nothing today.
- **Skeletons:** Home (cards), Course (rows), Reader (page placeholder while the first render loads; §18
  provides the paper colour).
- **Haptics map** (`haptics.ts`): selection tick (chips, toggles), light (sheet snap), success (saved, tool
  done), warning (destructive confirm). Centralised; no direct `expo-haptics` calls outside it.
- `ErrorBoundary` uses theme tokens (it is always light today: `bootstrap/ErrorBoundary.tsx:52-65`), with the
  `error` illustration.

Tests: `transitions` picks the kind (push/tab/modal) and the reduced-motion variant; the `useTask` state
machine (progress, cancel, error → snack); the snack queue order; the ratchet stays down.

Device check: Verification 13.

## U14 · Usability check with students *(S)*
Status: planned. Device work.

Goal: real students do the main tasks without help, within the tap-count targets.

Files: `docs/qa/walkthrough.md` (a new "§17 usability" section).

Changes:
- **A 10-task script** (no hints given), timed:
  1. scan 3 pages and save to a course;
  2. find a word in an old scan;
  3. rename a file;
  4. merge two files;
  5. sign page 2 of a PDF;
  6. convert a Word file to PDF;
  7. make an exam pack for a course;
  8. submit with a cover;
  9. back up;
  10. change the theme.
- **Record:** taps against the targets, hesitations, wrong turns, a 1–5 ease score, and quotes.
- 3–5 students, on their own phones if possible (mid-range Android).
- Turn the findings into "Changes made after a step was marked done" notes or new steps.

---

## Verification
Every step: `npm run typecheck` and `npm test` pass (`designSystem` ratchet, `contrast`, `copyStyle`,
`hardcodedStrings`, `a11yLabels`, `safeArea`, `navStack`, `backHandling`).

On a mid-range Android phone (360 dp wide), light and dark, font scale 1.0 and 1.3, 3-button and
gesture navigation, TalkBack for the marked items:
1. **U1:** the UI gallery and Home in both themes; the marigold and semantic colours read well on cream
   and on dark.
2. **U2:** the UI gallery: every button shows a ripple and press scale; TalkBack reads buttons with
   state; a checkbox row reads "checked".
3. **U3:** every former `Alert` menu shows all its options (Home course menu: Archive is there); sheets
   drag to dismiss, close with Back, and sit above the keyboard and the nav bar.
4. **U4:** every empty state in both themes; the Done celebration, and with "Remove animations" on.
5. **U5:** tap Scan on Home, Files, Tools and Me → the scanner opens at once in the last mode; long-press
   → the mode sheet; Back from Review → the tab you started on (with the discard confirm). A fresh
   install starts on Home.
6. **U6:** Home with no courses, with 6 courses, with deadlines due and none; the search bar opens Files
   search; a "Scan as: Book" chip scans in Book mode.
7. **U7:** rename; filter by 2 courses + type; sort by name; grid view; select 3 → Merge (originals
   kept) → the result is selected; Merge with "Delete the originals" → Undo restores them; Import a PDF
   → it's in Files.
8. **U8:** each tool from the hub: Merge (2 files), Compress, Convert Word → PDF (the ad gate), Sign, Exam
   pack; each ends on the result sheet with Open/Share.
9. **U9:** scan a book spread in Document mode → Mode → Book → it splits; Save → Done → Open; Submit with
   a cover → shared; the preview strip is right.
10. **U10:** Me fits the essentials on the first screen; File names presets show live examples; no
    language rows.
11. **U11:** Course sections expand; Exam pack Clear asks first; Pro screen; Onboarding at 360 dp and
    1.3 font scale.
12. **U12:** read every screen; no jargon, no Title Case buttons, UK spelling.
13. **U13:** transitions by kind; the snack slides and queues; merging 5 files shows progress; reduced
    motion turns movement off everywhere.
14. **U14:** the student walkthrough, recorded in `docs/qa/walkthrough.md`.

## Out of scope
- New features (beyond rename and keeping originals on merge/split, which are fixes).
- A second UI language (§6; the layout must stay ready for Bangla, so no fixed-width labels).
- Tablet-specific layouts beyond §9 O6's max width.
- Custom fonts beyond Caprasimo and Figtree.
- iOS-specific design (Android first; the kit stays cross-platform).
