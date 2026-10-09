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
Status: done in code (2026-10-09). JS only; no device check.

As built:
- `assets/brand/` now holds only `pdfscan-mark.svg`, `pdfscan-tile.svg` and
  `reference/pdfscan-applogo.png`, byte for byte the owner's files (checked with `shasum`). The 8 old
  SVGs and `logo/` are gone. The owner's deletions of the old `logo/*.svg` were already committed in
  e89d70b, so this commit only moves the three new files.
- `src/theme/brand.ts`: `BRAND` gives **every** gradient `stops` and `offsets` (the tile and the
  diagonal too, at `[0, 1]`), so V4 can hand any of them to Skia's `colors`/`positions` the same way.
  Type `BrandGradient`. Exported from `src/theme/index.ts`.
- `src/components/brand/markGeometry.ts`: `MARK_VIEWBOX`, `TILE_SIZE`, `TILE_GRADIENT`,
  `MARK_GRADIENTS` (keyed `ribbon`/`diagonal`/`fold`, the same names as the `BRAND` entries),
  `MARK_PIECES` (`fill` is typed as a `BRAND` key, so renaming one breaks the typecheck),
  `WHITE_PIECES`/`GREEN_PIECES` (pieces, not names, filtered by `fill === 'paper'`, still in paint
  order), `MARK_CONTENT_BOX` and `MARK_IN_TILE`. `MARK_IN_TILE` is computed from the box, so it is
  **translate(96.8, 34.8)**; the 97.3 above was measured from the render's pixels.
- `src/theme/__tests__/brandSync.test.ts` (30 tests) checks, beyond the plan: the pieces' exact
  bounds equal `MARK_CONTENT_BOX` (a small M/L/H/V/C/Z parser; any other path command fails, so a
  new export gets a look), every gradient in the file is used once, the shadow's colour matrix is
  black at `BRAND.shadow.opacity`, and the reference PNG is 819 × 802. The security scan covers
  every `.svg` in `assets/brand/` and also rejects `on…=` event handlers, `javascript:` and
  `<!ENTITY`. Checked that it fails when a colour or an offset in `brand.ts` is changed.
- `scripts/make-icons.mjs`: only its header comment changed (it still draws the old mark until V2).

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
Status: done in code (2026-10-09). Open: `npx expo prebuild --clean` in the project, a new dev build,
and Verification 1–4 on a device; the owner uploads the new 512 icon (Verification 11).

As built:
- `scripts/make-icons.mjs` is rewritten as planned. The colour images nest each file's markup
  unchanged; `logoTile()` draws the reference (tile, mark at scale 1, both clipped to a `clipPath` of
  the tile's own rect). The square icons stretch the tile's markup (its `rx` removed) to the square
  with `preserveAspectRatio="none"`, 2% off, which can't be seen.
- **Rendered at 4x and averaged down** (`SUPERSAMPLE`). At 1x resvg left a one-pixel seam where two
  white pieces meet edge to edge (246 instead of 255 down the top of the stem: the shadow shows
  through the antialiased boundary). At 4x it's gone. A run takes about 25 s.
- **No sips loop any more:** the script writes its own PNGs (Paeth-filtered, `zlib.crc32`, so Node
  22.2+): RGB with no alpha channel for the four opaque icons, RGBA for the rest. The run steps in its
  header are now: resvg in `/tmp`, run it, look at the PNGs, prebuild.
- **Themed icon:** a luminance `<mask>`. The pieces are drawn opaque in paint order, white or grey 115
  (`MONO_GREEN_ALPHA` 0.45), so a later piece replaces what it covers, as in the colour logo, and the
  grey becomes the alpha. resvg takes mask luminance straight from the sRGB values (checked: grey 115
  gives alpha 115).
- **Notification icon:** the silhouette fills Material's 20 dp live area (content height 20/24).
  **The fold stays:** at 24 dp on hdpi and up (36–96 px) it reads as a page corner; only mdpi's 24 px
  softens it to a cut corner.
- **Tile shadow and rim** (not in the owner's files) are `TILE_SHADOW` `{ dy: 12, blur: 24, opacity:
  0.22 }` (black) and `TILE_RIM` `{ width: 6, opacity: 0.12 }` (white, inside), in **tile units**,
  so they scale with the tile: on the 140 dp splash tile, 2 dp down, a 4 dp σ and a 1 dp rim. They
  are in `brand.ts`, next to `SPLASH_IMAGE_DP`, `SPLASH_TILE_FRACTION` and `SPLASH_TILE_DP` (all
  exported from `src/theme`), for V4 and V5. The script has copies of them and of `MARK_CONTENT_BOX`.
- `app.json`: `adaptiveIcon.backgroundColor` `#155437`; `expo-notifications` `icon`
  `./assets/notification-icon.png`, `color` `#1e754a`. The diff has only those three values.
- `brandSync.test.ts` (34 tests now): the splash colours equal `tokens.light.bg`/`tokens.dark.bg`,
  `imageWidth` equals `SPLASH_IMAGE_DP`, the adaptive background equals `BRAND.tile.stops[0]`, the
  notification colour equals `BRAND.green` (**V3 adds the check against `tokens.light.accent`**), and
  the script's four copies equal the app's (checked that a changed copy fails).
- Checked by eye (a contact sheet): the adaptive icon under circle, squircle and teardrop masks;
  the themed icon tinted light and dark; the notification icon at 24–96 px; both splash images on
  their background inside Android 12's 192 dp circle. A prebuild of a scratch copy of the project
  made `notification_icon.png` at 5 densities, `splashscreen_logo.png` (light and night),
  `iconBackground` `#155437` and `notification_icon_color` `#1e754a`. The real `android/` wasn't
  touched.
- The splash PNGs are about 160 KB each (source files; the plugin resizes them per density).

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
Status: done in code (2026-10-09). Device checks open: Verification 5 (and the green course next to
the accent, below).

As built:
- `tokens.ts` has the starting values from the table, unchanged. Checked with `contrastRatio`: light
  accent on bg/surface/surface2 4.77/5.59/4.84, white on it 5.68, accentInk 7.49/8.77/7.60 and 7.43
  on accentSoft; dark accent 6.67/5.92/5.30, onAccent on it 6.14 (white would be 2.8), accentInk
  11.63/10.33/9.25 and 9.51 on accentSoft. The comments say which logo colour each one is (light
  accent = `BRAND.green`, light accentInk = the tile's `#155437`, dark accent = the fold's `#37AE79`).
- `en.ts`: `settings.accent.names.teal` "Forest", `settings.accent.lapsed` "… Forest for now."; the
  id `'teal'` and the course colour's "Teal" are unchanged. AccentPicker's comment and the comment
  on `ACCENTS` say so.
- **Also changed** (found by the grep): `components/shared/Snackbar.tsx` hard-coded `#7fe3cd`, the old
  dark accentInk, for its action label. The bar is dark in both themes, so it now uses
  `tokens.dark.accentInk` and follows the default accent. Other accents still don't change it (as
  before).
- `brandSync.test.ts`: the notification colour check is now against `tokens.light.accent` (V2's
  interim check was against `BRAND.green`, the same value).
- The course colour `green` against the light accent is 1.26:1 (2.00 in dark), as predicted. Not
  changed; look at it on the device.

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
Status: done in code (2026-10-09). Device checks open: Verification 6 (and that nothing clips the
light shadow, below).

As built:
- `components/brand/BrandMark.tsx` exports **`BrandTile`** (Skia elements only, `{ x, y, width,
  theme }`, to put inside a `<Canvas>`; V5 can draw its still frame with it) and **`BrandMark`**
  (`{ size, wordmark? }`). The mark's shadow is a `Group layer={<Paint><Shadow/></Paint>}` round
  all eight pieces, as the SVG's filter is on its `<g>` (one shadow, inside the counter too), and
  outside the mark's scale transform so its numbers are plain canvas units. The tile clip is a plain
  `{ rect, rx, ry }` object (native Skia takes it; no `Skia.*` call anywhere).
- **Seams:** like resvg at 1x (V2), Skia leaves a grey line where two pieces meet edge to edge. It
  gets worse as the logo gets smaller: 218 instead of 255 down the top of the stem at 72 dp, 208 at
  32 dp. Each piece's fill now also gets a **hairline** in its own paint (`strokeWidth` 0: one
  device pixel at any scale), which overlaps its neighbours by half a pixel: the seam is 254–255.
- **Checked against the splash PNGs** with Skia's headless renderer (CanvasKit). V5 can reuse the
  method for the handoff frame: a throwaway Jest test that `jest.mock`s `@shopify/react-native-skia`
  to `lib/commonjs/headless` and `…/sksg/Container` to `Container.js` (jest-expo would resolve
  `.native.js`), sets `globalThis.TextDecoder` to Node's (Expo's polyfill has no UTF-16), loads
  `canvaskit-wasm/bin/full`, then `drawOffscreen` → `encodeToBytes()`. `BrandTile` at the splash frame
  (896 px wide in 1024) against `splash-icon{,-dark}.png` on the theme's bg: **mean difference
  0.4/255**, only on edge pixels (the hairlines move edges by half a pixel; before them it was 0.2).
- **Layout:** the layout box is the tile (`size` × `size × 802/819`). The light shadow reaches
  `TILE_SHADOW.dy + 3 × blur` tile units outside it, so the `Canvas` is that much larger on every side
  and offset by it (`position: 'absolute'`, negative `left`/`top`). Check on the device that no
  parent clips it (Android draws children outside their parent unless `overflow: 'hidden'`).
- `BRAND.shadow` gained `color: '#000000'` (the SVG's colour matrix zeroes every channel;
  `brandSync.test.ts` checks it). The tile shadow uses it and the rim uses `BRAND.paper`, with
  `opacity` from `TILE_SHADOW`/`TILE_RIM`. Only the mark's shadow filter needs an `rgba()` string,
  made from those values by a local helper.
- Placements: Onboarding page 1, `BrandMark size={72} wordmark` centred above the title (the page
  scrolls, so a large font scale pushes content down instead of cutting it). Settings → About: a row
  of `BrandMark size={32}` and the version text (`aboutRow`, the text `flex: 1`).
- `en.ts`: `brand.name` "PDF Scan", `brand.logoLabel` "PDF Scan logo".
- Skia mock: `Canvas`, `Group`, `Path`, `RoundedRect`, `LinearGradient`, `Shadow`, `Blur`, `Paint` are
  host elements (plain strings), plus `vec`. `Skia` still throws.
- `BrandMark.test.tsx` (6 tests): the eight fills, their hairlines and the two outlines in paint
  order; the clip's size; one shadow layer around every path (the layer is a prop, so the test reads
  it there); the light shadow and no rim; the dark rim and no shadow; one `image` element labelled
  from the catalog with the drawing hidden; the wordmark only when asked.

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
Status: done in code (2026-10-09). Open: Verification 7–10 on a device (with V2's new dev build:
the overlay must match V2's splash images), and the numbers in `docs/qa/performance.md` → "§15 V5".

As built:
- Files: `bootstrap/splashIntro.ts` (constants, `introPlan`, `shouldExit`, `takeFirstMount`, and the
  frame maths as worklets: `introFrame(t)`, `pieceTransform`, `foldTransform`, `sweepLine`,
  `PAINT_RUNS`), `components/brand/IntroMark.tsx` (the drawing; **no Reanimated import**: each moving
  part is a plain value or a shared value, and `introMarkProps(t)` gives one still frame),
  `components/brand/SplashIntro.tsx` (the overlay, `SplashIntroBoundary`). `markGeometry.ts` gained
  `WHITE_PIECE_CENTRES` and `FOLD_PIVOT` (430.547, 186.889), checked against the paths in
  `brandSync.test.ts`. `rgba()` moved to `theme/brand.ts` (a worklet, so the overlay can use it too).
- **One clock:** a shared value counts ms from the release (`withTiming`, linear, to
  `INTRO_TOTAL_MS`). Every moving prop is `useDerivedValue` of `introFrame(clock)`. A skip cancels it
  and sets it to the end. The clock only runs for `'play'`, so `'still'` is the rest frame. A plan
  decided during the hold starts the clock where it would have been.
- **Timeline as planned**, with two choices: the assemble phase is ease-out apart (first 40%), then
  an ease-out-back return that overshoots about 5% past together (the snap); the **sweep moves at
  a steady speed** (an eased one rushed through the diagonal: at 700 ms it had already passed it).
  The band is `SWEEP_BAND` 220 mark units long, white at `SWEEP_PEAK` 0.45, on a clamped gradient
  that is transparent at both ends, so it lights nothing before 400 ms or after 800 ms.
- **The handoff:** `holdSplash` calls `setOptions({ duration: SPLASH_EXIT_MS (150), fade: true })` (in a
  try, like `hide`). The overlay renders on AppNavigator's first render; `onLayout`, then one
  `requestAnimationFrame`, then `releaseSplash()`. The exit waits for the hold (150 ms after the
  release, so the native fade is over), except at the 3 s cap.
- **Checked with headless Skia** (V4's method): the overlay's rest frame (`IntroMark` with
  `introMarkProps(0)` inside `BrandTile`) against plain `BrandTile`: max difference 2/255, so its
  first frame is V4's, which matches the splash PNGs to 0.4/255. A filmstrip of 12 frames at 3x
  (0–1100 ms) looked right: the page parts and snaps back, the band runs ribbon → bowl → diagonal,
  the fold lifts, the tile rises for the wordmark.
- **AppNavigator:** one root `View` now. The screens (StatusBar, AppLockGate, …) are its first child
  only once booted, and `<SplashIntroBoundary><SplashIntro booting appLocked /></SplashIntroBoundary>`
  is always the last child, so going from booting to booted doesn't remount the overlay (with two
  `return`s it would have). `appLocked` is `settings.appLock.enabled`. The
  `requestAnimationFrame(releaseSplash)` effect is gone; the 3 s timers stay.
- **Back:** the overlay's `BackHandler` listener is added once the splash is released, not at
  mount. Child effects run before their parent's, so a listener added at mount would be **older**
  than AppNavigator's and run after it. Back returns false once the intro is done (a slow boot
  holding the final frame), so it backgrounds the app as usual.
- `useExternalFileLinking.ts` exports `isFileUri`. `en.ts`: `brand.skipIntro` "Skip intro".
- **Not handled:** the status bar icons. While booting there's no `StatusBar` element, and after boot
  it follows the app's theme, so with the theme forced against the system's, the icons can be the
  wrong shade over the overlay for up to about 1 s.
- Tests: `bootstrap/__tests__/splashIntro.test.ts` (27: the `introPlan` table, `shouldExit`, the
  phases, the frames at rest / end / peaks, the sweep line, the piece directions, the paint runs,
  `takeFirstMount`), `splash.test.ts` (+2: `setOptions` before preventAutoHide and hide; holding
  still works when it throws). `brandSync.test.ts` (+5). `SplashIntro` itself isn't rendered under
  Jest (the Skia mock gained `Rect` anyway).

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
