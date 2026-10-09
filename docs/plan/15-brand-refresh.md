# §15 Brand refresh: step-by-step plan

## How to use this file
- Implement **one step per session** ("Implement V1 from docs/plan/15-brand-refresh.md").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are implementing.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §15.
- Step prefix **V** (visual identity). B is already used by §8 Backup.
- **§15 comes before §11** (launch): the store listing and screenshots need the new logo. Suggested
  order: V1 → V2 → V3 → V4 → V5. V2 and V3 don't depend on each other. V5 needs V2's splash images
  (and `SPLASH_TILE_DP`) and V4's component.
- **V2 needs a new dev build** (the launcher icon, splash and notification icon are native resources).
  V1, V3, V4 and V5 are JS only.

## Context
**Planned 2026-10-09.** The owner put a new logo in `logo/` and deleted the old `logo/*.svg` files
(the deletions aren't committed yet):

- `logo/pdfscanLOGO.svg`: **the mark**. A "P" built from a white page and green ribbons, with a
  folded corner and a drop shadow.
- `logo/logo_background.svg`: **the tile**. A rounded rectangle with a green-to-grey gradient.
- `logo/pdfscan_applogo.png`: **the full app logo** (the tile with the mark on it), the owner's
  reference render.

The app still shows the old outline "P" everywhere: launcher and store icons, splash, notification
icon and the teal accent colour. The splash is static.

The owner wants the new logo everywhere, an animated splash, and versions that work in light and
dark.

**Owner's decisions (2026-10-09):**
1. **Splash background:** the theme colour (cream `#f5ead8` in light, `#14120f` in dark) with the full
   logo tile in the centre. It matches the app background, so the move into the app is smooth.
2. **App colours:** retune the default ("teal") accent to the logo's greens in both themes. Course
   colours and the other Pro accents stay as they are.
3. **Animation:** "Scan & assemble", about 1.1 s, played while the app boots.

## What the code looks like today (2026-10-09)

### 1. The new logo files
Checked: plain paths, gradients and one filter. No `<script>`, `foreignObject`, external `href` or
long lines.

**`pdfscanLOGO.svg`** (the mark): viewBox `0 0 652 762`, one `<g filter>` around 8 paths. In paint
order:

| # | Name (for V1) | Fill | What it is |
|---|---|---|---|
| 1 | `stemTop` | white | the stem's upper part, with the slanted top-left corner |
| 2 | `ribbon` | gradient `#1F774D → #1F3C26` (stop 0.766), from (231.382, 381.12) to (75.8069, 631.525) | the ribbon that sweeps down-left across the stem |
| 3 | `bowlInner` | solid `#1E754A` | the green inside of the bowl, under the counter |
| 4 | `diagonal` | gradient `#0F5B3C → #259663`, from (505.206, 74.2002) to (367.839, 335.738) | the diagonal band from the top right into the bowl, with a notch for the fold |
| 5 | `fold` | gradient `#37AE79` (stop 0.404) `→ #11704A`, from (488.679, 89.1958) to (481.692, 184.29); **white stroke, 5** | the folded corner (a triangle, right angle at about (430.5, 186.9)) |
| 6 | `topBar` | white; **white stroke, width 1** (the SVG default) | the top of the P; the hairline stroke closes the seam with `stemTop` |
| 7 | `bowl` | white | the outer bowl, from the diagonal round to the stem |
| 8 | `stemBottom` | white | the stem's foot, under the ribbon |

- Content box (the paths' real extent, curves included): **x 62.7–562.7, y 61.2–671.2**, so 500 × 610,
  centre (312.7, 366.2). The bowl's control point reaches x 585, but the curve stops at 562.7.
- The empty counter of the P (about x 232–385, y 217–369) is a hole: the tile shows through it.
- Drop shadow filter: offset (13, 15), blur `stdDeviation` 37.85, black at 39%. The filter region is
  the whole viewBox.

**`logo_background.svg`** (the tile): 819 × 802, `rx` 288 (0.352 of the width), a linear gradient
from (807.322, 0) `#155437` (top right) to (74.2486, 855.61) `#7E8693` (bottom left).

**`pdfscan_applogo.png`** (reference): 819 × 802 RGBA. Measured:
- The mark is at **scale 1**, its content box centred in the tile: the white pixels span x 160–659,
  y 96–705, so the mark's viewBox sits at about translate(97.3, 34.8). The mark is 0.76 of the tile's
  height.
- **Everything is clipped to the tile**: the pixels outside the rounded rectangle are fully
  transparent, the mark's shadow included.

### 2. Icons and the script that makes them
- `assets/brand/` holds the old mark's 8 SVGs: `pdfscan-mark.svg`, `pdfscan-mark-1024.svg`,
  `pdfscan-construction.svg`, `pdfscan-lockup-{horizontal,reverse,stacked}.svg`, `pdfscan-mono.svg`,
  `pdfscan-app-icon.svg`. Nothing in `src/` uses them.
- `scripts/make-icons.mjs` draws the old 2-path mark from path strings inside the script (`P_PATH`,
  `BAR_PATH`), in hard-coded colours (`INK`, `TEAL #16a085`, `CREAM`, `MINT #4fd1b0`,
  `GREEN #12332c`). It writes `icon.png` (1024), `store/playstore-icon.png` (512), `favicon.png` (48),
  `android-icon-background.png` (512, solid), `android-icon-foreground.png` (512, mark at 0.4 of the
  height for the 66% safe zone), `android-icon-monochrome.png` (432), and `splash-icon{,-dark}.png`
  (1024, mark at 0.9). Its header gives the run steps: resvg installed in `/tmp/resvg`, then a `sips`
  loop that drops the alpha channel from the opaque icons (App Store Connect rejects a 1024 icon with
  one), then `npx expo prebuild --clean`.
- `app.json`: `icon` `./assets/icon.png`; `android.adaptiveIcon` `backgroundColor #12332c` plus the
  three layers; `expo-notifications` `icon` = the **monochrome layer**, `color #16a085`;
  `web.favicon`.
- `docs/policy/play-console.md` lines 42–43: upload `assets/store/playstore-icon.png`, "made by
  `scripts/make-icons.mjs` from `assets/brand/`".

### 3. The splash
- `app.json` → `expo-splash-screen`: `image ./assets/splash-icon.png`, `imageWidth 160`,
  `resizeMode contain`, `backgroundColor #f5ead8`, `dark: { image ./assets/splash-icon-dark.png,
  backgroundColor #14120f }`. These colours equal `tokens.light.bg` / `tokens.dark.bg`, but nothing
  tests that.
- **How the plugin builds it** (expo-splash-screen 57.0.9, `plugin/build/withAndroidSplashImages.js`
  and `withAndroidSplashStyles.js`): for each density it draws the image, `contain`, at `imageWidth`
  dp in the centre of a **transparent 288 dp canvas**. That becomes `splashscreen_logo.png`, set as
  `windowSplashScreenAnimatedIcon`; the background is `@color/splashscreen_background` (in
  `values-night` for dark), and `windowSplashScreenBehavior` is `icon_preferred`. Android 12+ shows an
  icon without an icon background at 288 dp and **masks it to a 192 dp circle** (Android's splash
  screen guide). So with `imageWidth 160` the PNG spans 160 dp, and anything more than 96 dp from
  the centre is cut off.
- **How it hides on Android** (`android/.../SplashScreenManager.kt`):
  - While the splash is held, an `OnPreDrawListener` on the content view returns `false`, so **the app
    draws nothing at all** until `hide()`. React still renders and lays out, but no frame reaches the
    screen.
  - On `hide()`, the exit listener fades the splash view's alpha 1 → 0 over `duration` (default
    **400 ms**, `AccelerateInterpolator`), on top of the app's first frame.
  - **`fade` is iOS-only**: Android reads only `duration` and always fades. `setOptions` runs later on
    the main queue (`appContext.mainQueue.launch`), so calling it right before `hide()` can lose the
    race.
- `src/bootstrap/splash.ts`: `holdSplash()` (module scope in `App.tsx`) calls
  `preventAutoHideAsync()` and starts the `SPLASH_TIMEOUT_MS` (3 s) safety timer. `releaseSplash()`
  hides once. Tests: `bootstrap/__tests__/splash.test.ts` (the mock has `preventAutoHideAsync` and
  `hide` only).
- `src/bootstrap/AppNavigator.tsx`: while `booting`, it returns a blank `tokens.bg` `View`; it has its
  own `SPLASH_TIMEOUT_MS` timer that ends `booting`. Once `booting` is false, an effect calls
  `requestAnimationFrame(releaseSplash)`.
- `src/bootstrap/AppProviders.tsx` renders a blank view until the fonts (Caprasimo, Figtree) load, so
  AppNavigator, and anything it renders, mounts with the fonts ready.
- The native splash follows the **system** colour scheme (`values-night`). `ThemeProvider` reads
  `Appearance.getColorScheme()` and never overrides it, so `useColorScheme()` is the system's scheme
  too.
- Inputs that arrive late: `useReducedMotion()` starts at `false` and resolves asynchronously.
  `Linking.getInitialURL()` is async, and `useExternalFileLinking` only treats `file://` and
  `content://` URIs as file handoffs (its private `isFileUri`; a dev build's launch URL is a
  dev-client link). Settings (the app lock among them, `settings.appLock.enabled`) load from
  AsyncStorage during boot.
- `components/security/AppLockGate.tsx`: once boot is done and the lock is on, `LockScreen` asks for
  biometrics as soon as it mounts.

### 4. The theme
- `src/theme/tokens.ts`, default accent: light `accent #0f7f69`, `accentInk #0e6655`, `onAccent
  #ffffff`, `accentSoft #dff0ea` (the comment on line 31 says it was deepened from `#16a085`); dark
  `accent #1abc9c`, `accentInk #7fe3cd`, `onAccent #0b1f1a`, `accentSoft #1d302c`.
  `ACCENTS.teal = pickAccent(light/dark)`, `DEFAULT_ACCENT = 'teal'`. The id `'teal'` is stored in
  users' settings.
- `theme/__tests__/contrast.test.ts` checks every accent in both themes: `accentInk` text on
  `bg`/`surface`/`surface2` ≥ 4.5; `ink` and `accentInk` on `accentSoft` ≥ 4.5; `onAccent` on `accent`
  ≥ 4.5; `accent` icons on `bg`/`surface`/`surface2` ≥ 3.
- `src/i18n/en.ts`: `settings.accent.names.teal: 'Teal'` (line 114) and `settings.accent.lapsed`
  "… Teal for now." (line 116). The course colour names (line 1300) include their own `teal`.
  `components/settings/AccentPicker.tsx`'s top comment says "Teal is free".
- The course colour `green` is `#166534` (light) / `#86efac` (dark).

### 5. In the app
- **No logo is shown anywhere in the app.** Onboarding page 1 (`screens/OnboardingScreen.tsx`) opens
  with the title `onboarding.what.title` ("Scan, file, submit") and three step icons. Settings → About
  (`screens/SettingsScreen.tsx` lines 320–322): the section label, `settings.about.text` with
  `APP_VERSION`, and "Show the introduction".
- `en.ts` has no key holding just "PDF Scan". The string is on `hardcodedStrings.test.ts`'s `ALLOWED`
  list, but UI text still comes from the catalog.
- Skia (`@shopify/react-native-skia` 2.6.2) is loaded at boot anyway: `AppNavigator` imports
  `ReviewScreen` statically, which imports `CropOverlay`, `PagePeekCarousel` and `useFilteredPicture`.
  Reanimated 4.5 and worklets 0.10 are installed.
- Jest maps Skia to `src/test/mocks/skia.ts`: `Skia` is a proxy that throws on any use, plus a few
  enums and types. It has **no component stubs**, and no test renders a Skia component today.
- `src/__tests__/a11yLabels.test.ts` fails on a `Pressable` without an `accessibilityRole` and a label
  (or `Text`) inside.

---

## V1 · Brand sources and shared geometry *(S)*
Status: planned.

Goal: the owner's files live in `assets/brand/` under clean names, and the code has one typed copy of
the logo's colours and shapes, kept in step with the SVGs by a test.

Files: `assets/brand/*`, `logo/` (removed), new `src/theme/brand.ts`, new
`src/components/brand/markGeometry.ts`, new `src/theme/__tests__/brandSync.test.ts`.

Changes:
- **Move the sources** (keep the bytes exactly as the owner made them; the sync test reads them):
  - `logo/pdfscanLOGO.svg` → `assets/brand/pdfscan-mark.svg`
  - `logo/logo_background.svg` → `assets/brand/pdfscan-tile.svg`
  - `logo/pdfscan_applogo.png` → `assets/brand/reference/pdfscan-applogo.png` (reference only; nothing
    `require`s it, so Metro doesn't bundle it)
  - Delete the 8 old SVGs in `assets/brand/` and the whole `logo/` folder (its `.DS_Store` too). Commit
    the owner's deletions of the old `logo/*.svg` with it.
  - The old `make-icons.mjs` still runs after this (its paths are inside the script). V2 rewrites it.
- **`src/theme/brand.ts`**: `BRAND`, the logo's colours. They are the **same in both themes**, because
  the logo is the logo. This keeps the "colours come from `src/theme`" rule.
  ```ts
  export const BRAND = {
    tile: { stops: ['#155437', '#7E8693'] },             // top right → bottom left
    paper: '#ffffff',                                     // the white pieces and the fold's outline
    ribbon: { stops: ['#1F774D', '#1F3C26'], offsets: [0, 0.766109] },
    green: '#1E754A',                                     // bowlInner
    diagonal: { stops: ['#0F5B3C', '#259663'] },
    fold: { stops: ['#37AE79', '#11704A'], offsets: [0.403846, 1] },
    shadow: { dx: 13, dy: 15, blur: 37.85, opacity: 0.39 }, // in mark units
  } as const;
  ```
  (Shape it as you like; keep the values exact.) V2 adds the splash constants here.
- **`src/components/brand/markGeometry.ts`**:
  - `MARK_VIEWBOX` (652 × 762), `TILE_SIZE` (819 × 802, `rx` 288) and the gradient endpoints (the
    tile's and the three in the mark, from "What the code looks like today" §1).
  - `MARK_PIECES`: the 8 paths in **paint order** (seams depend on it), each
    `{ name, d, fill, stroke? }`, where `fill` names a `BRAND` entry and `stroke` is
    `{ width: 5 }` for `fold` and `{ width: 1 }` for `topBar`. Export `WHITE_PIECES`
    (`stemTop`, `topBar`, `bowl`, `stemBottom`) and `GREEN_PIECES` (`ribbon`, `bowlInner`, `diagonal`,
    `fold`) for V4 and V5.
  - `MARK_CONTENT_BOX` `{ x: 62.7, y: 61.2, width: 500, height: 610 }` and `MARK_IN_TILE`
    (scale 1, content box centred in the tile, as the reference: about translate(97.3, 34.8)).
  - Keep the `d` strings exactly as in the SVG. V4 hands them to Skia's `<Path path={d}>` as strings.
- Don't add colours or shapes anywhere else. `make-icons.mjs` (V2) reads the SVG files directly.

Tests (`brandSync.test.ts`, a source scan like `hardcodedStrings.test.ts`):
- The `d` strings of `assets/brand/pdfscan-mark.svg`, in order, equal `MARK_PIECES`' `d`s. The fills,
  strokes, gradient stops, offsets and endpoints equal `BRAND` and `markGeometry.ts`. The tile's size,
  `rx` and gradient match. If the logo changes in one place and not the other, the test fails.
- Both SVGs contain no `<script`, `foreignObject`, `href=` or `xlink:href` (the AGENTS.md security
  rule: keep brand assets plain).

## V2 · Icon and splash images *(M; needs a new dev build)*
Status: planned. Device checks: Verification 1–4.

Goal: every icon and the native splash show the new logo, made from the SVGs by one script.

Files: `scripts/make-icons.mjs`, the PNGs in `assets/` and `assets/store/`, new
`assets/notification-icon.png`, `app.json`, `src/theme/brand.ts`, `brandSync.test.ts`,
`docs/policy/play-console.md`.

Changes:
- **Rewrite `scripts/make-icons.mjs`** so it composes everything from `assets/brand/pdfscan-mark.svg`
  and `pdfscan-tile.svg`. The easiest way: read each file, take the markup between its root
  `<svg>` tags, and nest it as an inner `<svg x y width height viewBox>` in a new canvas, so the
  owner's gradients and filter are used unchanged (the files' gradient ids don't clash). resvg renders
  `feGaussianBlur`/`feOffset`/`feComposite`/`feColorMatrix`/`feBlend`. Like the reference, **clip the
  mark (and its shadow) to the tile** wherever both appear. The run steps stay the same: resvg in
  `/tmp`, the alpha-strip loop for the opaque icons, then `npx expo prebuild --clean`. Update the
  header comment.
- **Outputs:**

  | File | Size | Content |
  |---|---|---|
  | `icon.png` | 1024 | Opaque. The tile gradient edge to edge on a **square** canvas (iOS and Play put their own corner masks on, and the 819 × 802 tile isn't square), the mark with its shadow centred, content height 0.62 of the canvas (the reference uses 0.76 inside its much rounder tile; compare by eye). |
  | `store/playstore-icon.png` | 512 | The same art. Opaque. |
  | `favicon.png` | 48 | Square gradient + mark, content height about 0.7. Opaque. |
  | `android-icon-background.png` | 512 | The gradient edge to edge. Opaque. |
  | `android-icon-foreground.png` | 512 | Transparent. The mark with its shadow, content height 0.4, centred, so it stays inside the 66% safe zone under any mask (same reasoning as the old script). |
  | `android-icon-monochrome.png` | 432 | Themed icon (Android 13+), alpha only: white pieces α 1.0, green pieces α about 0.45, the fold's outline α 1.0, no shadow. The counter is already a hole. The launcher's tint then keeps the white/green split as two tones. |
  | **`notification-icon.png`** (new) | 96 | A solid white silhouette (all 8 pieces α 1, no shadow), for the 24 dp status bar icon. If the fold blurs into the diagonal at 24 dp, leave the fold out. |
  | `splash-icon.png` | 1024 | Transparent canvas. The rounded tile with the mark (as the reference), at `SPLASH_TILE_FRACTION` of the canvas width, centred, with a soft shadow under the tile. |
  | `splash-icon-dark.png` | 1024 | The same tile **without** the tile's shadow (it turns muddy on `#14120f`), plus a faint light rim (an inside stroke, white at about 12%), so the tile's **dark-green top-right corner** (`#155437`, about 2.1:1 against `#14120f`) doesn't sink into the background. The mark's own shadow stays: it is part of the logo. |

- **Splash size limit.** The PNG is drawn at `imageWidth` 160 dp in a 288 dp canvas, and Android 12+
  cuts it to a 192 dp circle (96 dp radius; see "What the code looks like today" §3). For this tile
  (aspect 819:802, `rx` 0.352 of the width), the farthest point of the rounded corners is
  **0.554 × the tile's width** from the centre. With the light shadow (say 2 dp down, blur σ 4 dp,
  visible to about 12 dp): a **140 dp** tile reaches 77.6 + 14 ≈ 92 dp, which is inside. Keep
  `imageWidth` 160, so `SPLASH_TILE_FRACTION = 0.875` (140 / 160). The tile is then 140 × 137 dp,
  about the old mark's 144 dp.
  Add to `brand.ts`: `SPLASH_IMAGE_DP = 160`, `SPLASH_TILE_FRACTION = 0.875` and
  `SPLASH_TILE_DP = SPLASH_IMAGE_DP * SPLASH_TILE_FRACTION` (V5 draws the identical frame from them),
  with a comment that `make-icons.mjs` has the same fraction.
- **`app.json`** (review the diff for long lines and trailing whitespace: AGENTS.md security rule):
  - `android.adaptiveIcon.backgroundColor` → `#155437` (`BRAND.tile.stops[0]`).
  - `expo-notifications`: `icon` → `./assets/notification-icon.png`, `color` → `#1e754a` (the logo's
    solid green, which V3 makes the light accent).
  - The splash colours stay `#f5ead8` / `#14120f`; `imageWidth` stays 160.
- **Tests** (extend `brandSync.test.ts`):
  - `app.json`'s splash `backgroundColor` equals `tokens.light.bg`, its `dark.backgroundColor` equals
    `tokens.dark.bg`, and `imageWidth` equals `SPLASH_IMAGE_DP`.
  - `adaptiveIcon.backgroundColor` equals `BRAND.tile.stops[0]`.
  - `make-icons.mjs`'s `SPLASH_TILE_FRACTION` (read from its source) equals `brand.ts`'s.
  - Once V3 is in too (whichever of V2/V3 lands second), the notification colour equals
    `tokens.light.accent`.
- **Docs:** `docs/policy/play-console.md` (the 512 icon line: made from `assets/brand/pdfscan-mark.svg`
  and `pdfscan-tile.svg`).
- **Look at every PNG** after the run (open them; compare `icon.png` with the reference), then
  `npx expo prebuild --clean` and a new dev build.

## V3 · Retune the default accent to the logo green *(S)*
Status: planned. Device checks: Verification 5.

Goal: the app's own colour is the logo's green in both themes, with every contrast rule still met.

Files: `src/theme/tokens.ts`, `src/i18n/en.ts`, `src/components/settings/AccentPicker.tsx` (comment),
tests that pin the old values.

Changes:
- **`tokens.ts`**, starting values (I checked them against every pair in `contrast.test.ts`; all pass):

  | Token | Light | Dark |
  |---|---|---|
  | `accent` | `#1e754a` (on bg 4.77, white on it 5.68) | `#37ae79` (on bg 6.67) |
  | `accentInk` | `#155437` (on bg 7.49) | `#8fdcb4` (on bg 11.6) |
  | `onAccent` | `#ffffff` | `#0b1f14` (on accent 6.14) |
  | `accentSoft` | `#dfeee4` (`accentInk` on it 7.43) | `#17291f` (`accentInk` on it 9.51) |

  Adjust by eye if needed, and keep `contrast.test.ts` green. `ACCENTS.teal` picks them up through
  `pickAccent`. Replace the `#16a085` comment on line 31 with one saying these are the logo's greens
  (`BRAND`, §15 V3).
- **Keep the id `'teal'`** (it is stored in users' settings). Rename only the labels in `en.ts`:
  `settings.accent.names.teal` → "Forest", and `settings.accent.lapsed` → "… Forest for now." The
  course colour `teal` (line 1300) stays as it is. Update AccentPicker's "Teal is free" comment.
- **Known side effect:** the course colour `green` (`#166534`) is close to the new light accent (1.26:1
  between them). The owner chose to keep course colours as they are. Check by eye on Home and in the
  course colour picker; raise it with the owner if a green course reads as "selected".
- No test pins the old values (`0f7f69`, `1abc9c`, `'Teal'`; checked 2026-10-09). Grep again before
  finishing.

Tests: `contrast.test.ts` (unchanged, must pass), `theme/__tests__/accent.test.tsx`,
`hardcodedStrings` stays green.

## V4 · `BrandMark` component and in-app placements *(S)*
Status: planned. Device checks: Verification 6.

Goal: the logo, drawn from the shared geometry, appears in the app where a student meets the brand.

Files: new `src/components/brand/BrandMark.tsx`, `src/screens/OnboardingScreen.tsx`,
`src/screens/SettingsScreen.tsx`, `src/i18n/en.ts`, `src/test/mocks/skia.ts`, new
`src/components/brand/__tests__/BrandMark.test.tsx`.

Changes:
- **`BrandMark`** (`{ size: number; wordmark?: boolean }`, `size` = the tile's width; its height is
  `size × 802 / 819`):
  - A Skia `Canvas` (Skia is already loaded at boot, so it adds no cold-start cost). It draws the tile
    (`RoundedRect` + `LinearGradient`), then the 8 pieces from `markGeometry.ts` in paint order with
    their fills, the `fold` and `topBar` strokes, and the mark's own shadow (Skia `Shadow` on the mark
    group, scaled from mark units), all **clipped to the tile** (`Group clip`).
  - It always draws the **tile**: the bare mark's white pieces vanish on the cream background.
  - Theme rules (same as V2's splash images): in light, a soft shadow under the tile; in dark, no tile
    shadow and the faint light rim. The mark's own shadow is drawn in both.
  - Pass the `d` strings to `<Path path={d}>`. Don't call `Skia.Path.MakeFromSVGString` at module
    scope: the Jest mock throws on any `Skia` access, and importing the component would fail.
  - `wordmark`: "PDF Scan" as React Native `Text` under the tile (`typeScale.title`, Caprasimo,
    `tokens.ink`), from a new key `brand.name`.
- **Accessibility:** the wrapper `View` is `accessible` with `accessibilityRole="image"` and
  `accessibilityLabel={t('brand.logoLabel')}` ("PDF Scan logo"). The canvas and the wordmark are hidden
  from TalkBack (`importantForAccessibility="no-hide-descendants"`, `accessibilityElementsHidden`), so
  it is read once.
- **Placements:**
  - Onboarding page 1: `BrandMark size={72}` with the wordmark, above `onboarding.what.title`. Check it
    still fits at 360 dp and font scale 1.3 (§14 Q3's rule).
  - Settings → About: a small mark (`size={32}`, no wordmark) in a row with the version text.
- **Strings** (`en.ts`): `brand.name` "PDF Scan", `brand.logoLabel` "PDF Scan logo". V5 adds
  `brand.skipIntro`.
- **Skia mock:** add host-component stubs (`Canvas`, `Group`, `Path`, `RoundedRect`,
  `LinearGradient`, `Shadow`, rendering their children or nothing) and `vec` (returns `{ x, y }`).
  Keep `Skia` throwing.

Tests: `BrandMark.test.tsx` (renders in both themes, one label, the wordmark text from the catalog);
`hardcodedStrings` and `a11yLabels` stay green.

## V5 · Animated splash, "Scan & assemble" *(M)*
Status: planned. Device checks: Verification 7–10.

Goal: on a cold start, the native splash hands over without a visible change to a JS overlay that
plays a short logo animation while the app boots underneath, then fades into the start screen.

Files: new `src/bootstrap/splashIntro.ts` (constants and pure rules), new
`src/components/brand/SplashIntro.tsx`, `src/bootstrap/splash.ts`, `src/bootstrap/AppNavigator.tsx`,
`src/store/useExternalFileLinking.ts` (export the file-URI check), `src/i18n/en.ts`, tests,
`docs/qa/performance.md`.

### The handoff
The native splash stays static (this plugin has no animated splash on Android). It shows the
**complete** logo, so the Android 12 launch animation (launcher icon → splash) never shows the P
coming apart. On Android the app can't draw while the splash is held, and the splash always fades out
over the app's first frame (see "What the code looks like today" §3). So:
1. `holdSplash()` also calls `SplashScreen.setOptions({ duration: SPLASH_EXIT_MS, fade: true })`, at
   module scope, long before `hide()`, because Android applies it later on the main thread. `fade` is
   for iOS; Android only reads `duration`. `SPLASH_EXIT_MS` ≈ 150.
2. `SplashIntro` renders with AppNavigator's first render, **outside** the `booting` gate. Its still
   frame equals the native splash: `tokens[systemScheme].bg` (`useColorScheme()`, not `settings`,
   because the native splash follows the system), with the tile at `SPLASH_TILE_DP` centred in the
   edge-to-edge window (`StyleSheet.absoluteFill`), drawn with V4's `BrandMark` geometry and the same
   light/dark rules.
3. Once its canvas has laid out (`onLayout`, then one `requestAnimationFrame`), it calls
   `releaseSplash()`. The overlay is the app's first drawn frame, and the native splash fades over it
   for `SPLASH_EXIT_MS`. The accelerate curve keeps the splash at least 90% opaque for the first
   ~50 ms, which covers Skia's first frame. **The overlay holds still for the whole fade**, so the
   handoff can't be seen. A fade between two near-identical frames hides small antialiasing
   differences between the PNG and Skia; the colours must match exactly (V2's test).
4. Then the intro plays over the app, which keeps booting underneath.

AppNavigator's `requestAnimationFrame(releaseSplash)` effect goes. `holdSplash`'s 3 s timer and
AppNavigator's own boot timeout stay as the crash-proof fallback. Wrap `SplashIntro` in a small error
boundary whose fallback is `null` and which calls `releaseSplash()`, so a drawing error (an old dev
build without Skia, say) never takes the app down.

### Timeline
Constants live in `splashIntro.ts`, times from `releaseSplash()`. Reanimated shared values drive the
Skia props directly (`useDerivedValue`).
1. **0–150 ms, hold:** the native splash fades out over the identical still frame.
2. **150–450 ms, assemble:** the four white pieces part by about 4% of the mark's size, each along its
   own outward direction (from the content box's centre to the piece's centroid: `stemTop` left/up,
   `topBar` up, `bowl` right, `stemBottom` down/left), then spring back together. The page snaps
   together.
3. **400–800 ms, scan sweep:** a soft light band (a white-to-transparent `LinearGradient`) runs
   bottom-left → top-right through `ribbon` → `bowlInner` → `diagonal`, the direction the logo flows.
   It lights only the green pieces: draw them in their own layer `Group`, then the band with
   `blendMode="srcATop"`. The green brightens as the band passes.
4. **700–950 ms, fold:** `fold` lifts (scale 1 → 1.15 → 1, pinned at its right-angle corner, about
   (430.5, 186.9)) and settles.
5. **800–1100 ms, wordmark:** "PDF Scan" (`brand.name`) fades in and rises 8 dp under the tile, while
   the tile moves up by half the wordmark's height, so the pair stays centred.
6. **Exit**, once `shouldExit` says so: the overlay fades 1 → 0 over 220 ms while the tile scales
   1 → 1.06, starting one frame after `booting` turns false, so the start screen has drawn
   underneath. Then it unmounts (`pointerEvents="none"` during the fade).

### Rules
Pure functions in `splashIntro.ts`, unit-tested:
- `introPlan({ reducedMotion, externalLaunch, firstMountThisProcess })` → `'wait' | 'play' | 'still'`.
  Each input is `boolean | undefined` (not known yet).
  - Not the first mount in this JS process (a module-level flag) → `'still'`. A warm start never
    remounts AppNavigator, so it never sees the overlay.
  - Reduced motion on → `'still'`. Read `AccessibilityInfo.isReduceMotionEnabled()` once at mount,
    because `useReducedMotion()` starts at `false` and would let the first frames of motion through.
  - An "Open with" or share cold start (`Linking.getInitialURL()` is a `file://` or `content://`
    URI; export `isFileUri` from `useExternalFileLinking`) → `'still'`. The student wants the file.
  - Anything still unknown at the end of the hold → `'still'`. Otherwise `'wait'` until then.
  - `'still'`: the logo stays still until boot is done, then the overlay crossfades out in 150 ms with
    no scale.
- `shouldExit({ introDone, booting, appLocked, elapsedMs })`:
  - `true` when `!booting` and (`introDone`, or `appLocked`: with the app lock on, the biometric prompt
    opens as soon as boot is done, so the intro gives way to it).
  - `true` when `elapsedMs ≥ SPLASH_TIMEOUT_MS` (the existing 3 s cap), whatever else.
  - A slow boot holds on the final frame, with no loop.
- **Skip:** a tap on the overlay, or Android Back while it shows, jumps to the final frame; it then
  exits once boot is done. The `Pressable` has `accessibilityRole="button"` and
  `accessibilityLabel={t('brand.skipIntro')}` ("Skip intro"). Back is a `BackHandler` listener added
  by the overlay (newer than AppNavigator's, so it runs first) and removed when it unmounts.
- **Wiring:** AppNavigator renders `<SplashIntro booting={booting} appLocked={…} />` last inside its
  root `View` (above `AppLockGate` and the screens, still below the `Snackbar` from `App.tsx`), in
  both the booting and the booted branch.
- **Performance:** with the intro skipped, the time to the first usable screen must not get worse.
  With the intro, the extra wait is at most about 1.1 s minus the boot time. Record both in
  `docs/qa/performance.md` next to O5's numbers (same method: `am start -W` plus a screen recording).

Tests:
- `bootstrap/__tests__/splashIntro.test.ts`: the `introPlan` table (first mount, reduced motion,
  external launch, unknown inputs before and after the hold); `shouldExit` (intro done or not, booting
  or not, app lock, the 3 s cap); the timeline constants (each phase inside the total, the hold ≥
  `SPLASH_EXIT_MS`).
- `splash.test.ts`: the mock gains `setOptions`; `holdSplash` sets the duration before anything hides.
- `hardcodedStrings` and `a11yLabels` stay green. `SplashIntro` itself isn't rendered under Jest
  (Reanimated and Skia); keep its logic in `splashIntro.ts`.

---

## Verification
For every step: `npm run typecheck` and `npm test` pass (brandSync, contrast, accent, BrandMark,
splashIntro, splash, hardcodedStrings, a11yLabels). After V2: run `node scripts/make-icons.mjs` as its
header says, open every generated PNG, `npx expo prebuild --clean`, then a new dev build
(`npm run android`). On a device, an Android 12+ phone and one older phone:

**V2 Icons and splash**
1. Launcher icon under round, squircle and teardrop masks (launcher settings, or a launcher that offers
   them). Nothing important clipped; it reads as the reference.
2. Themed icon on Android 13+ with Material You on: the two tones are readable.
3. A deadline reminder (§4 S8): the status bar icon is a clean white "P", in the logo's green in the
   shade.
4. The splash in light and dark system mode: the full tile, no clipped corners or hard-edged shadow
   (Android 12+'s circle), the dark rim visible but quiet.

**V3 Accent**
5. Home, Library, Pro and Settings in both themes; the accent picker says "Forest"; a green course next
   to accent-coloured UI.

**V4 BrandMark**
6. Onboarding page 1 and Settings → About in both themes, at 360 dp and font scale 1.3. TalkBack reads
   "PDF Scan logo" once.

**V5 Animated splash** (record the screen and step through it frame by frame)
7. Cold start in light and dark system mode: no jump and no colour flash at the native → JS handoff;
   the animation plays once and fades into the start screen.
8. "Remove animations" on: no motion, the logo fades out once boot is done.
9. "Open with" a PDF from a file manager on a cold start: no intro, straight to the file. With the app
   lock on: the intro gives way to the lock prompt.
10. The app's theme forced against the system's (Settings → Appearance): a clean fade at the exit.
    A tap and Back during the intro skip it.

**Owner**
11. Play listing: upload the new 512 icon (`docs/policy/play-console.md`).

## Out of scope
- Lockup and wordmark SVGs, and the Play feature graphic (1024 × 500). Make them once the app name
  decision in `docs/PLAN.md` §7 #1 is settled.
- iOS splash fine-tuning (Android first).
- Animated launcher icons.
