# §6 Languages and scripts: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement L1 from docs/plan/06-languages.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §0 F6 (glyphless text layer, script registry) and §4 S1–S5 (profile,
  covers, footers). For L2: if §5 T1 has landed, `runOcr` already keeps word boxes; move that
  code, don't drop it.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
The owner wants **Bangla (Bengali) later, not now, but with room left for it**. §6 makes adding
a script or a UI language a configuration change instead of a refactor. **L1–L4 are the
groundwork (phase P2); L5–L6 add the second OCR engine and downloadable packs when Bangla is
actually built (phase P4).**

**Done when** (from `docs/PLAN.md`): a branch that adds a fake script touches only the registry
plus at most one file for its engine or model. (The plan below needs no per-script font file at
all.)

### What the code looks like today (checked while planning, 2026-10-02)
- **Searchable text works for any script already.** `pdf/textLayer.ts` writes OCR text with
  the 1 KB glyphless font (`assets/fonts/glyphless.ttf`), so Bengali OCR text will be
  searchable with no change there.
- **Script registry** `services/scripts/registry.ts`: `{ id, label, ocrModel, status }` for the
  5 ML Kit scripts, with a commented-out Bengali entry. `OcrScript` is a hand-written union in
  `types/models.ts`. `app.json` lists the same 5 ML Kit models separately (`rn-mlkit-ocr`
  plugin, `ocrUseBundled: true`).
- **One OCR engine, hard-wired.** `ocr/ocrService.runOcr(uri, script)` calls `rn-mlkit-ocr`
  directly. About 14 files pass `settings.ocrScript` around (capture, review, deliver,
  settings); the script is one global setting.
- **Visible PDF text is Helvetica only.** Covers (`pdf/coverTemplates.ts`, which measures text
  with `StandardFontEmbedder`), headers and footers (`pdfService.stampAcademicPage`) go
  through `toWinAnsiSafe`, which turns anything outside WinAnsi into `?`. A student named
  "রহিম", "राहुल" or "王芳" gets `????` on the cover. `pdf/winAnsi.ts` drives S1's warning hint.
  The library display copies (`pdf/academicRasterService`) are drawn with Skia.
- **UI strings are hard-coded English** in about 70 `.tsx` files (roughly 250 strings in JSX
  text, `label`/`title`/`msg` props and snack messages). No i18n library and no
  `expo-localization`; `pdf/pageSize.ts` reads the region through `Intl`.
- UI fonts are Figtree and Caprasimo (Latin only). Android and iOS fall back to system fonts
  per character, so Bengali UI text would still show.

### Key design decisions
- **Visible text in other scripts is drawn by Skia, not pdf-lib.** pdf-lib can't shape complex
  scripts reliably (Bengali and Devanagari conjuncts), and bundling a font per script is large
  (CJK fonts are 10+ MB). Instead, a text run that Helvetica can't draw is laid out with
  **Skia's Paragraph API** (HarfBuzz shaping, the phone's own system fonts, which include
  Bengali, Devanagari and CJK on Android), drawn as a transparent PNG at 300 dpi, and placed
  in the PDF. The same text goes into the **glyphless text layer** on top, so it stays
  searchable and copyable. WinAnsi text keeps Helvetica vector text (smaller, sharper).
- **OCR engines behind one interface**, chosen by the registry. ML Kit is the only engine until
  Bangla; Tesseract (`ben`) is the planned second one.
- **The recognition script is per course**, with the app setting as the default, since a
  Bangla literature course and an English physics course need different models.
- **A small in-house i18n layer** (typed English catalog, `t()`, simple plurals) instead of a
  library: about 250 strings, and TypeScript enforces that every translation has every key.

---

## Steps

### L1 · Script registry v2 and per-course recognition language *(S)*
Status: done (commit 8dc13df); device check open

- `services/scripts/registry.ts`:
  - `ScriptEntry = { id, label, nativeName, engine: 'mlkit' | 'tesseract', model, status: 'ready' | 'planned', sampleText, direction: 'ltr' }`.
    `direction` is there so a future RTL script (Arabic, Urdu) is an explicit decision, not an
    accident; only `'ltr'` is supported now.
  - `OcrScript` becomes `typeof SCRIPTS[number]['id']` (derived), re-exported from
    `types/models.ts` so existing imports keep working.
  - The Bengali entry is uncommented with `status: 'planned'`, `engine: 'tesseract'`,
    `model: 'ben'`. Planned entries are never offered for OCR.
- Settings: the recognition language list shows `nativeName`, `label` and `sampleText` for
  `ready` scripts, and a "Coming soon: বাংলা (Bangla)" row for planned ones (not selectable).
- Per course: migration (next free version) `courses.ocr_script TEXT` (null = app default).
  Course editor gets a "Recognition language" row. `resolveOcrScript({ course, settings })`
  (pure) is the only place that decides; capture/ingest code calls it instead of reading
  `settings.ocrScript` directly.
- A test checks that `app.json`'s `rn-mlkit-ocr` `ocrModels` equals the `ready` ML Kit entries
  in the registry, so the two lists can't drift.
- Tests: `resolveOcrScript`; planned scripts excluded from `READY_SCRIPTS`; the app.json check.

**Done when:** a course set to Chinese OCRs its scans with the Chinese model while other courses
use the default, and Settings shows Bangla as "coming soon".

**As built:**
- The registry is `SCRIPTS = [...] as const satisfies readonly ScriptDefinition[]`; it doesn't
  import `types/models.ts` (which re-exports `OcrScript` from it). Also exports
  `PLANNED_SCRIPTS`, `DEFAULT_OCR_SCRIPT` ('latin'), `getScript`, `parseOcrScript` (DB values;
  keeps planned ids, drops unknown ones) and `isReadyScript`. `resolveOcrScript` lives there too.
- Callers: `CaptureScreen` and `DeliverScreen` resolve with the filing course they already have;
  `ReviewScreen` uses the new `store/useScanOcrScript()` (filing course + settings); the reader's
  `SelectTextSheet` re-OCR uses the document's own course.
- `runOcr` returns `undefined` for any script that isn't a ready ML Kit entry, until L2's
  engine dispatch replaces that guard.
- Settings: the section is "Recognition language"; rows show native name, then label and sample
  text; planned scripts are greyed, non-selectable rows marked "Coming soon". The course editor's
  chips are "App default (<native name>)" plus each ready script's native name.
- Tests: `scripts/__tests__/registry.test.ts`, `ocr/__tests__/ocrService.test.ts`, and two
  course-script cases in `libraryRepo.test.ts`.

### L2 · `OcrEngine` interface *(M)*
Status: done (commit 881af3e)

- `src/services/ocr/engines/types.ts`:
  ```ts
  type OcrEngine = {
    id: 'mlkit' | 'tesseract';
    isAvailable(script: ScriptEntry): Promise<boolean>; // model present on the phone?
    recognize(uri: string, script: ScriptEntry): Promise<PageOcr>; // throws on failure
  };
  ```
- `engines/mlkit.ts`: today's `runOcr` body (including word boxes if §5 T1 has landed).
  `engines/index.ts`: a map from `engine` id to implementation.
- `ocrService.runOcr(uri, script)` keeps its signature and best-effort behaviour (returns
  `undefined` on failure), but looks up the registry entry, checks `isAvailable`, and
  dispatches. A missing model gives `{ ocrFailed: true, reason: 'model-missing' }` so the UI can
  say "Download the Bangla pack" later (L6) instead of "OCR failed".
- `src/test/fakeScript.ts`: a test-only registry entry plus a fake engine, injected through a
  `registerEngine` / test registry hook. It is used by L2 and L3 tests to prove the §6
  "done when": OCR dispatch, Settings list, the PDF text layer and visible text all work for it
  with no other code change.
- Tests: dispatch per engine; unavailable model; failure stays best-effort; the fake script end
  to end through `runOcr` and `buildPdfFromPages` (text extracted with pdfjs).

**Done when:** no file outside `services/ocr/engines/` imports `rn-mlkit-ocr`, and the fake
script test passes.

**As built:**
- `runOcr(uri, script)` is unchanged for callers (`PageOcr | undefined`). The reason lives in the
  new `ocrService.recognizePage(uri, script) → { ocr } | { ocrFailed: true, reason }` with
  `reason: 'model-missing' | 'unsupported' | 'error'`; `runOcr` is a thin wrapper over it. No
  caller stores the reason yet: L6 switches Review/ingest to `recognizePage` when it adds the
  "Download Bangla" prompt. 'unsupported' = unknown or planned script, or no engine registered.
- `mlkit.isAvailable` is always true: the models are bundled (`ocrUseBundled`), and the L1
  app.json test keeps the bundled list equal to the registry.
- `engines/index.ts` has only ML Kit; there's no Tesseract stub (L5 adds it).
- Test hooks: `registry.registerScript(entry)` and `engines.registerEngine(engine)`, each
  returning an undo. `src/test/fakeScript.ts` (`installFakeScript()`) uses them with a
  Cherokee-text script, engine id `'fake'`.
- Tests: `ocr/__tests__/ocrService.test.ts` (ML Kit mapping, dispatch, model-missing, errors,
  planned/unknown scripts) and `ocr/__tests__/fakeScript.test.ts` (Settings list,
  `resolveOcrScript`, `runOcr` → `buildPdfFromPages` → pdfjs, and a source scan that only
  `engines/mlkit.ts` imports `rn-mlkit-ocr`). L3 should add visible text to the fake-script test.

### L3 · Visible PDF text in any script *(M — starts with a short spike)*
Status: done (commit 9f5689a), **built without the spike**: system fonts assumed, device check open

- **Spike (half a day, results written into this step):** draw "রহিম আহমেদ", "राहुल शर्मा",
  "王芳" and "Łukasz Żółć" with Skia's Paragraph API using system fonts
  (`Skia.TypefaceFontProvider` / `FontMgr.System()` with fallback) on a device; check the
  conjuncts are shaped correctly and measure the PNG size of a 9 pt footer line at 300 dpi.
  If system-font fallback isn't available in react-native-skia's Paragraph on a platform,
  bundle **one** Noto Sans font per script as the fallback, and record that decision here.
- `src/services/pdf/visibleText.ts`:
  - `needsShaping(text)`: true if any character is outside WinAnsi (reuse `pdf/winAnsi.ts`).
  - `measureText(text, style) → { width, height, lines }` and
    `drawText(pdfDoc, page, text, { x, y, size, bold, maxWidth, align })`:
    - WinAnsi text: Helvetica, as now (vector);
    - otherwise: Skia Paragraph → PNG at 300 dpi → `page.drawImage` at the measured box, **plus**
      the same text in the glyphless text layer (`textLayer.ts`) over that box, so it is
      searchable and copyable.
  - Mixed text (an English course name with a Bangla student name) is drawn as one Paragraph
    when any part needs shaping, so spacing stays consistent.
- Use it everywhere visible text is drawn: `coverTemplates.ts` (measuring and wrapping with
  `measureText` instead of `StandardFontEmbedder`), `stampAcademicPage` (header, footer), and
  the exam pack contents page if §5 T6 exists. `toWinAnsiSafe` is no longer used for drawing;
  keep it only if something still needs it, and remove S1's "?" warning hint.
- `academicRasterService` (library display copies) draws its text with the same Paragraph
  style, so preview and PDF match.
- Tests: `needsShaping`; layout of mixed text; a PDF with a Bangla cover name contains an image
  in the cover's name box and the Bangla text in the text layer (pdfjs extraction);
  WinAnsi-only text still produces vector text with no image.

**Done when:** a cover and footer with Bangla, Hindi and Chinese names print correctly shaped,
the names can be found by search in the PDF, and an English-only cover is unchanged.

**As built:**
- **Spike not run.** The owner chose to build on the assumption that react-native-skia's
  Paragraph falls back to system fonts. It should: `ParagraphBuilder.Make` without a typeface
  provider sets the system `FontMgr` as the font collection's default manager (checked in
  react-native-skia 2.6.2's `JsiSkParagraphBuilder.h`), and Android's system fonts include
  Bengali, Devanagari and CJK. **Still to check on a device:** the four names from the spike
  shape correctly (conjuncts), and the PNG size of a 9 pt footer at 300 dpi. If fallback fails
  on a platform, pass a `TypefaceFontProvider` with one Noto Sans per script in
  `skiaText.makeParagraph`; nothing else changes.
- `pdf/skiaText.ts` holds all Skia text code: `measureShaped`, `drawShaped` (canvas, baseline,
  left/centre) and `rasterizeShaped` (transparent PNG, box = width x (ascent + descent), baseline
  `ascent` from the top). One line per run; wrapping stays in `coverTemplates.wrapText`.
- `pdf/visibleText.ts`: `needsShaping`, `measureText(text, size, bold) → width` (the plan's
  `{ width, height, lines }` isn't needed, since layout already wraps), and
  `createTextDrawer(pdfDoc, glyphlessFont?)` instead of a free `drawText`. It embeds Helvetica
  lazily, caches each shaped run's image per PDF, and reuses the OCR layer's glyphless font. The
  shaper can be swapped with `setTextShaper` (tests use `src/test/fakeShaper.ts`). If shaping
  throws, the run is drawn as Helvetica with `?` and is **still** searchable.
- The searchable copy of a shaped run is a single glyphless line over the image box (baseline to
  ascent).
- `coverSafe` only collapses whitespace now; `layoutCover`, `layoutContents` and `itemsAsOcr`
  measure with `measureText`. `toWinAnsiSafe` stays exported (tested against `isWinAnsiSafe`),
  but nothing draws with it. `helveticaWidth`/`MeasureText` moved to `visibleText.ts`, and
  `coverTemplates` re-exports them.
- `academicRasterService` (cover and contents display copies, header/footer stamps, and
  Review's live stamp preview through `drawAcademicStamp`) draws with `drawShaped`. The exam
  pack's contents page is a raster from `renderLayoutImage`, so it is covered too.
- S1's "Cover pages show ?" hint is removed from `ProfileSection`.
- Tests: `pdf/__tests__/visibleText.test.ts`, the cover/footer case in
  `ocr/__tests__/fakeScript.test.ts`, and the updated `coverTemplates` script test.

### L4 · UI translation layer, English only *(M, split into 4 sessions)*
Status: L4a done (commit 8de31f8), L4b done (commit 519540d), L4c done (commit 10c1b6b); L4d todo

- **L4a: infrastructure plus Settings and Home.**
  - Add `expo-localization@~57` (check the version in the package source).
  - `src/i18n/`:
    - `en.ts`: the catalog, nested by area (`common`, `home`, `capture`, `review`, `deliver`,
      `submit`, `library`, `reader`, `courses`, `settings`, `errors`); values are strings or
      `{ one, other }` plurals with `{name}` parameters;
    - `types.ts`: `type Catalog = typeof en` and a `DeepKeys<Catalog>` key type, so a
      translation file missing a key fails `tsc`;
    - `index.ts`: `t(key, params?)`, plural choice by `count` with per-language rules in the
      catalog's metadata (English and Bangla both use one/other), and `formatDate` /
      `formatNumber` / `formatBytes` that take the active locale;
    - `useT()`: a hook that re-renders on language change.
  - Setting `uiLanguage: 'system' | 'en'` (more values as catalogs are added); `'system'`
    picks the first device locale that has a catalog, otherwise English.
  - A dev-only **pseudo-locale** (`'en-XA'`: accented and 40 % longer strings) in Settings when
    `__DEV__`, to find truncated or hard-coded text.
  - Convert Settings and Home.
- **L4b:** Capture, Review. **L4c:** Deliver, Submit, Academic options, deadlines. **L4d:**
  Library, Reader, Course screens, shared components, snack messages and alerts.
- A Jest test scans `src/**/*.tsx` for JSX text and `label=`/`title=`/`placeholder=` string
  literals that start with a letter, with a short allowlist (brand name, icons). It is added
  in L4a as a warning list and turned into a failing test in L4d.
- Text that goes **into documents** (cover labels like "Submitted by", footers, file name
  tokens) uses the same catalog under `document.*`, with a "Document language" setting
  (default: the UI language), so a Bangla UI can still produce English covers if the teacher
  wants that.
- Tests: `t()` parameters and plurals; missing-key fallback to English in production; the
  hard-coded string check; the pseudo-locale.

**Done when:** every screen reads its text from `en.ts`, the pseudo-locale shows no untranslated
strings, and adding `bn.ts` later only means adding that file (and its registry line).

**As built (L4a):**
- `src/i18n/`: `types.ts` (`Plural`, `CatalogMeta { locale, nativeName, plural(count) }`,
  `DeepKeys`), `en.ts` (`satisfies CatalogShape`; empty areas for L4b–d), `pseudo.ts`
  (accents, `{param}`s kept, `[… ·····]` padding of 40 % of the length), `index.ts` (`t`,
  `setUiLanguage`, `subscribeUiLanguage`, `systemCatalogId`, `formatDate` / `formatNumber` /
  `formatBytes`, `catalogNativeName`, test hook `registerCatalog`), and `useT.ts` (import it from
  `i18n/useT`, not `i18n`: `useSyncExternalStore` on the language). `t` is one function for every
  language, so a `useMemo` that uses it depends on `locale` from `useT()`, not on `t`.
- Adding a language: `xx.ts` typed `Catalog` and one line in `CATALOGS` (index.ts).
  `{count}` and other number parameters are formatted with `formatNumber`.
- `settings.uiLanguage: 'system' | 'en' | 'en-XA'`, stored in `app:settings`; a stored
  `'en-XA'` is ignored outside `__DEV__`. `useSettingsPersistence` applies it. Settings has an
  "App language" section (phone language, each catalog, and the pseudo-locale in dev).
- `expo-localization@~57.0.2` (no config plugin needed) gives `getLocales()`; Jest maps it to
  `src/test/mocks/expoLocalization.ts` (`mockLocales`). **It's a native module: needs a new dev
  build.**
- Converted: `SettingsScreen`, `HomeScreen`, `components/settings/*`, and
  `homeSelectors.relativeDay` (Home's "Today / 3 days ago"). Not yet: the script labels in the
  recognition list come from the registry in English (move them to the catalog with the other
  `courses`/`settings` strings in L4d), and the `TabBar` (shared, L4d).
- Hard-coded string check: `src/i18n/__tests__/hardcodedStrings.test.ts`. JSX text, shown props
  (`label`, `title`, `placeholder`, `subtitle`, `trailing`, `submitLabel`, a11y), `msg:` /
  `text:` literals and `Alert.alert('…')`. Files in `CONVERTED` must be clean; the rest are a
  report (`I18N_REPORT=1 npx jest hardcoded`: 292 strings in 53 files at L4a). Each later
  session adds its files to `CONVERTED`; L4d drops the list and fails on any file.
- `HomeScreen.test.tsx` renders Home in the pseudo-locale and fails on any English catalog
  phrase shown as is (tab bar excluded until L4d).
- Not done yet: `document.*` strings and the "Document language" setting. They belong with the
  cover/footer text in **L4c** (Deliver, Submit, Academic options).

**As built (L4b):**
- Converted: `CaptureScreen`, `ReviewScreen`, everything in `components/capture` and
  `components/review` (all now in the hard-coded check's `CONVERTED` list; 256 strings in 44
  files left).
- `CaptureModeSpec` has `labelKey`/`hintKey` and `FilterSpec` has `labelKey` (catalog keys) in
  place of English `label`/`hint`; UI calls `t(spec.labelKey)`. The Filter Lab (dev) translates
  them too; its tuning-parameter labels stay English (developer tool).
- Service messages shown during capture go through `t()` when shown: `ingestBatch` snacks and
  errors, the scanner tip, the camera fallback's "Take another?" alert, AppNavigator's "Scan
  failed". `SCANNER_UNAVAILABLE_MESSAGE` became `scannerUnavailableMessage()`, so it isn't fixed
  at import time. A native scanner error's own message is still shown as the OS gives it.
- Added missing accessibility labels (capture gallery/shutter/tray, Capture's settings button,
  Review's grid button, the action bar buttons).
- Shared pieces Review uses (`SignatureCaptureModal`, `SignaturePlacementOverlay`, `TabBar`)
  are L4d.
- Tests: `i18n/__tests__/serviceStrings.test.ts` (every mode/filter key resolves; service
  messages switch with the language).

**As built (L4c):**
- Converted: `DeliverScreen`, `AcademicOptionsScreen`, everything in `components/deliver`,
  `components/submit` and `components/deadlines` (181 strings in 32 files left).
- **Document text** is under `document.*` and read with `tDoc()` (index.ts) in the document
  language: cover labels and layout text (`coverTemplates`), the cover date (`{day} {month}
  {year}`, month from Intl in the document locale), the "Assignment 3" type label, footer
  presets (`footerPresetText(preset)` replaces `FOOTER_PRESET_TEXT`; `footerPresetOf` also
  recognises the English text), the `{type}` file name token (`naming.ts`, and the deadline
  title suggestion), the default `Scan_<date>` name, the exam pack's default title, footer and
  contents page.
- `settings.documentLanguage: 'ui' | CatalogId` (default `'ui'`: follows the UI language,
  pseudo-locale included), stored in `app:settings`, applied by `useSettingsPersistence`
  (`setDocumentLanguage`), with a "Document language" section in Settings.
- `formatNumber` / `formatDate` take an optional locale (documents pass `getDocumentLocale()`).
- Cover templates and fields carry catalog keys (`CoverTemplate.labelKey`,
  `COVER_FIELD_LABELS` → `TKey`). `DocTypeSpec.label/plural` are still English (UI uses are
  L4d); documents no longer read them.
- Services converted: `preset.summarizePreset`, `sizeTarget.formatLimit` / `tooLargeMessage`,
  `history.submittedSummary`, `deadlines.formatDue` and the reminder notification text and
  channel name, `submitDocument` progress. The exam pack's progress messages are L4d (with
  `ExamPackScreen`).
- Tests: `i18n/__tests__/documentLanguage.test.ts` (document text follows the UI by default and
  stays English when pinned, under the pseudo-locale UI).

### L5 · Tesseract engine (for Bangla) *(L — later, phase P4)*
Status: later (do it when Bangla is scheduled)

Outline, so L1–L4 leave the right gaps:
- A local Expo module `modules/tesseract-ocr` (`npx create-expo-module --local`):
  - Android: Tesseract4Android (Apache 2.0); iOS: a prebuilt `libtesseract` xcframework.
  - API: `recognize(uri, languages: string, dataDir) → TSV`, mapped to `PageOcr` blocks, lines
    and words (`engines/tesseract.ts`).
  - Pre-process with the master image at about 300 dpi equivalent; page segmentation mode 3;
    `ben+eng` for mixed Bangla/English pages (the registry entry can list several models).
- `engines/tesseract.isAvailable` checks that the model files exist (L6).
- Measure APK size per ABI and recognition time per page (budget: under 3 s on a mid-range
  phone) and accuracy on 20 real Bangla pages (handwritten and printed separately) before
  setting Bangla to `ready`.

### L6 · Downloadable language packs *(M — later, with L5)*
Status: later

- Packs are listed in the registry: `{ id, bytes, sha256, url }` for `tessdata_fast` models
  (`ben` is about 1–2 MB, `eng` similar), from a pinned release URL.
- Settings → "Bangla: Download (1.6 MB)": downloads only on the user's tap (this is allowed by
  the "network only for actions the user starts" principle), with progress, a SHA-256 check,
  and storage in `Paths.document/ocr-models/`. "Remove" deletes it.
- When a course uses a script whose pack is missing, scanning still works; pages get
  `reason: 'model-missing'` and Review shows "Download Bangla to make this searchable", which
  re-runs OCR afterwards.
- Tests: checksum failure deletes the file; resume after an interrupted download; re-OCR queue.

---

## Order and dependencies
L1, then L2, then L3 (spike first), then L4a–L4d. L5 and L6 come later, together, when Bangla is
scheduled (phase P4).

## Critical files
- `src/services/scripts/registry.ts`, `src/types/models.ts`, `app.json`
- `src/services/ocr/{ocrService.ts,engines/*}` (new folder), `src/test/fakeScript.ts` (new)
- `src/services/pdf/{visibleText (new),coverTemplates,pdfService,academicRasterService,winAnsi,textLayer}.ts`
- `src/services/persistence/migrations.ts`, `src/services/courses/*` (per-course script),
  `src/components/courses/CourseEditorSheet.tsx`, `src/screens/SettingsScreen.tsx`
- `src/i18n/*` (new), then every screen and component in L4a–L4d
- Later: `modules/tesseract-ocr/` (L5), `src/services/ocr/packs.ts` (L6)

## Verification (for the whole of §6 groundwork, L1–L4)
1. `npm run typecheck && npm test` pass in CI, including the fake-script test and the
   hard-coded string check.
2. On an Android device (dev build):
   - set a course to Chinese; scan a Chinese handout; search finds its text;
   - profile name in Bangla, course name in English: the cover and footer are shaped
     correctly, and searching the name in a PDF viewer finds it;
   - switch to the pseudo-locale: every screen shows pseudo text, nothing is cut off badly;
   - Settings shows "Coming soon: বাংলা".
3. The fake-script branch diff (from the L2 test) touches only the registry and the fake
   engine file.
