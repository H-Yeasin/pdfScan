# §4 Submit: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement S1 from docs/plan/04-submit.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §0, §1 C1 and §3 K1–K5 (all done). §3 K6 is not needed.
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
§4 is the feature that sets the app apart: an assignment that is ready to upload, from one
screen. **Goal:** from capture to an open share sheet with a correctly named PDF under the size
limit takes **3 taps** (Review "Next", "Submit", choosing the app in the share sheet).

### What the code looks like today (checked while planning, 2026-10-02)
- **Shared files are named `document.pdf`.** `sharing/shareService.shareDocument` shares
  `doc.pdfUri`, which is always `library/<docId>/document.pdf` (`pdfService.ts:413`). The
  document name is only the dialog title, so the teacher receives `document.pdf`.
  `deviceExportService` already uses `doc.name` (SAF `createFileAsync`).
- `DeliverScreen` is a long form: name (`NameField`, defaulting to the first OCR line or
  `Scan_<date>`), Format, Page layout (standard / 2-up), a Quality slider 1–5 with a rough
  "≈ size" hint (`imageSpec.estimateExportBytes`), `MoreOptionsPanel` ("A4 · fit to content"
  is fixed), Course (`CourseChips` with K5 suggestions), Type (`DocTypeSelector`), and an
  "Academic export" row that opens `AcademicOptionsScreen`. `StickyActions` offers Save and
  Save & share.
- Academic export (`pdfService`):
  - `AcademicConfig { enableBorder, headerText?, footerText? ('{X}'/'{Y}' = page numbers), coverPage? }`;
  - `CoverPageConfig { mode: 'template' | 'imported_image', title?, studentName?, courseCode?, importedUri? }`,
    with one hard-coded template drawn by `buildCoverPage`;
  - `stampAcademicPage` draws the border, header and footer with Helvetica (`toWinAnsiSafe`);
  - the library display copies come from `pdf/academicRasterService`.
- Pages are always A4 (`PageSizes.A4`); the 2-up layout is US Letter landscape.
- Image sizes: `capture/imageSpec.ts` (`EXPORT_PRESETS` 1–5, `fitWithin`).
  `buildPdfFromPages(..., encoding: 'as-is' | ExportPreset, ...)` accepts **any** preset, so
  sizes between or below the 5 levels need no change to the PDF builder.
- Already available: `docTypes.getDocType(id).short` (HW, Lab, Exam, …) "for §4's naming
  template"; `libraryRepo.nextTypeNumber(db, courseId, type)` and the in-memory
  `docTypes.nextTypeNumber`; `Course.code`, `Course.teacher`; `utils/sanitize`.
- Nothing yet for a student profile, submission history or deadlines.
  `expo-notifications@57.0.21` exists for SDK 57 but is not installed.

### Key design decisions
- **Submission file ≠ library file.** The library keeps `document.pdf` at the library quality.
  "Submit" builds a **separate file**, named and sized for the teacher:
  `library/<docId>/submissions/<file name>.pdf`. That file is what gets shared and recorded.
- **Remember the settings per course.** The first submit to a course sets up its preset (size
  limit, cover template, footer, page size, layout). Every later submit to that course reuses
  it, which is what makes "3 taps" possible.
- **Hitting the size target uses a fixed quality ladder, not guesswork.** Predict sizes from a
  few sample pages, build once, and step down at most twice. The invisible OCR text layer is
  independent of image quality, so it is always kept.
- **Text that the user types (name, institution) is still drawn with Helvetica** in §4, with
  `toWinAnsiSafe` replacing characters it can't show. Fonts for other scripts are §6. The plan
  says this in the profile screen so it isn't a surprise.

---

## Steps

### S1 · Student profile *(S)*
Status: done (commit c4f8f75)

As built:
- `StudentProfile` lives in `types/models.ts`; `submit/profile.ts` also has `EMPTY_PROFILE` and
  `normalizeProfile` (old settings without a profile, non-string fields → `''`).
- The Helvetica check is `pdf/winAnsi.isWinAnsiSafe(text)`, a synchronous copy of the WinAnsi
  set, because `toWinAnsiSafe` needs an embedded font. A test checks it against Helvetica's
  `getCharacterSet()` and against `toWinAnsiSafe`.
- `ProfileSection` reuses `NameField` itself for the 4 fields. There is no warning colour in the
  theme, so the hint uses `ink` with an info icon.
- Tests are in `submit/__tests__/profile.test.ts`, `pdf/__tests__/winAnsi.test.ts` and
  `store/__tests__/useSettingsPersistence.test.tsx` (patch + restart round trip).

- `settingsSlice` and `persistence/settingsStorage.ts`:
  `profile: { name: string; roll: string; section: string; institution: string }` (all
  default `''`), with the action `settings/SET_PROFILE` (a partial patch).
- `components/settings/ProfileSection.tsx` at the top of `SettingsScreen`: 4 text fields
  (reuse `NameField`'s style), with the note "Stored only on this phone. Used for file names,
  cover pages and footers."
- When a field contains characters Helvetica can't show, a small hint says "Cover pages
  show ? for some characters until full language support arrives" (check with
  `toWinAnsiSafe(text) !== text`).
- `src/services/submit/profile.ts`: `isProfileComplete(profile)` (name and roll), used by S6
  to ask for the profile once.
- Tests: the reducer patch; persistence round trip; `isProfileComplete`.

**Done when:** the profile survives a restart and is used by no other code yet.

### S2 · Naming template and correctly named shared files *(S)*
Status: done (commit 5f81a98)

As built:
- `naming.ts` also has `suggestName(template, ctx)`: it uses the fallback template only when
  the template is the default and the profile has no name or roll; a custom template is always
  used as typed. `NAME_TOKENS` lists the tokens for the chips.
- An empty token takes the separator **after** it if there is one, otherwise the one before.
  Leading and trailing `_`/`-` are trimmed. `{date}` is the local date, not UTC.
- File names are cleaned by a new `utils/sanitize.sanitizeFileName` (keeps the case, `/` and
  `\` become `-`, at most 80). `sanitizeFolderSegment` lowercases and caps at 60, so it didn't fit.
- `shareAs(uri, fileName, mimeType)` takes the file name **with** its extension;
  `shareFileName(name, ext, suffix)` builds it (`document` if nothing is left). It empties
  `cache/share/` before each share. `shareDocument` uses it for every format (DOCX etc. too),
  and so does the Reader's "Export PDF" for library documents. External files are shared as
  before, since they already have their own name.
- Deliver: `deliver/SET_AUTO_NAME` (ignored once `nameEdited`) next to `deliver/SET_NAME` (sets
  it). An empty result falls back to `Scan_<date>`.
- Settings: `NameTemplateSection` below the profile ("File names"). Chips insert at the cursor
  (`NameField` gained `onSelectionChange`); the example uses the first active course or a sample
  one, an Assignment numbered 3. A stored template that is blank loads as the default.

- `src/services/submit/naming.ts`:
  - `renderTemplate(template, ctx) → string`, a pure function. Tokens: `{name}` (full name with
    spaces removed), `{first}`, `{roll}`, `{section}`, `{course}` (`course.code` or the name,
    spaces removed), `{type}` (`getDocType(type).short`), `{n}` (next number), `{date}`
    (`YYYY-MM-DD`), `{title}` (the first OCR line, trimmed to 40 characters).
  - Unknown tokens stay as they are; empty tokens are removed together with one neighbouring
    `_` or `-`, so `{roll}_{name}` with no roll gives `Rahim`, not `_Rahim`.
  - The result is cleaned with `utils/sanitize` (no `/ \ : * ? " < > |`, at most 80 characters).
  - Default template: `{roll}_{name}_{course}_{type}{n}`, which gives
    `2021331045_Rahim_CSE101_HW3`. Without a profile it falls back to
    `{course}_{type}{n}_{date}`.
- Setting `settings.nameTemplate` with an editor row in Settings: a text field, token chips
  that insert a token, and a live example. A per-course override is added in S6.
- Deliver: the name field is filled from the template (using `nextTypeNumber` for the selected
  course and type) instead of the first OCR line, and it updates when the course or type
  changes **until the user edits the name** (a `deliver.nameEdited` flag).
- **Fix the shared file name:** new `shareService.shareAs(uri, fileName, mimeType)` copies the
  file to `Paths.cache/share/<fileName>.pdf` (replacing an old copy with the same name),
  shares that copy, and the next share cleans the folder. `shareDocument` uses
  `shareAs(doc.pdfUri, doc.name)`. Same for JPG pages (`<name>_<n>.jpg`).
- Tests: every token; empty tokens with separators; illegal characters; length limit; the
  fallback without a profile; `shareAs` writes the copy under the right name (file-system mock).

**Done when:** sharing any document gives the receiving app a file named after the document,
and a new Assignment in CSE 101 is named `2021331045_Rahim_CSE101_HW3` automatically.

### S3 · Exact size target *(M)*
Status: done in code (commit 6b6c94f). The "Done when" check (10 handwritten pages, Under 2 MB,
1.5–2.0 MB in at most 2 builds) needs a device.

As built:
- `SIZE_LADDER` (in `imageSpec.ts`) reuses the slider presets where they match (levels 0, 1, 2,
  4, 6), so level 0 is `MASTER_PRESET` and is embedded as is.
- Sampling uses a binary search (`findLevel`) instead of encoding the samples at all 9 levels:
  at most 4 levels are measured. `predictLevel` is the plain version over a full table; a test
  checks both agree. Samples are the first, middle and largest master, without repeats.
- `skiaEnhance.encodedBytes(uri, edits, target)` returns the byte count of the same render as
  `renderPage` without writing a file (shared `renderToBytes`).
- Overhead measured: about 4 KB per document (fonts, template cover, footer) plus 0.3–1.1 KB per
  page (0–60 OCR lines). Stored as 8 KB + 2 KB per page (`PDF_OVERHEAD_*`), well under the
  plan's 25 KB + 3 KB; a test builds real PDFs and checks they stay under it. An imported cover
  image adds its file size.
- `buildPdfUnderLimit(documentId, pages, limitBytes, academicConfig, layoutMode)` does the
  sampling and the builds, for reuse by S6. Deliver calls it with the masters; the page loop then
  skips the export render.
- Deliver: a "File size" row (`SizeTargetRow`) for PDF only. Custom asks for 0.1–100 MB
  (`TextPromptModal` gained `keyboardType`). State: `deliver.sizeLimitBytes`, reset with the rest
  of Deliver (S6 makes it per course). `formatLimit` rounds up, so 2,000,001 bytes reads
  "2.01 MB". If the lowest level was not reached after 3 builds, the message says "Couldn't get
  this scan under 1 MB (…)" rather than "even at the lowest quality".

- `src/services/submit/sizeTarget.ts`:
  - `SIZE_LADDER: ExportPreset[]`, about 9 levels from the master down:
    2400/0.92, 2200/0.85, 1800/0.75, 1600/0.70, 1400/0.65, 1200/0.60, 1000/0.55, 850/0.50,
    700/0.45. Keep it in `imageSpec.ts` next to `EXPORT_PRESETS`.
  - `predictLevel(samples, pageCount, overheadBytes, limitBytes) → index`, a pure function:
    the highest-quality level whose predicted total fits, with a 5 % safety margin.
    `samples` = encoded byte counts for 2 or 3 representative pages (first, middle, largest
    master) at each candidate level.
  - `buildUnderLimit(build, limitBytes)`: build at the predicted level; if the file is over the
    limit, step down one level and rebuild; give up after 3 builds and return the smallest file
    with `fits: false`.
- Sampling encodes a page with `renderPage` at the candidate preset **in memory** (byte count
  only, no file kept), one page at a time.
- Overhead: about 25 KB plus about 3 KB per page of OCR text, and the cover page if there is
  one. Measured once in a test and stored as constants.
- Deliver: a size target row with **Original · Under 1 MB · 2 MB · 5 MB · 10 MB · Custom**
  (MB = 1,000,000 bytes, the way upload forms usually count; say so in a hint). When a target is
  set, it replaces the quality slider; the size hint becomes "Will be ≤ 2 MB".
- If even the lowest level doesn't fit: "This scan is too large for 1 MB even at the lowest
  quality (1.3 MB). Remove pages or choose a bigger limit." Saving still works.
- Tests: `predictLevel` (exact fit, margin, nothing fits, one page); `buildUnderLimit` with a
  fake `build` that over-shoots once; the output keeps its OCR text layer (pdfjs extraction, as
  in F6's test).

**Done when:** for 10 handwritten pages, "Under 2 MB" gives a file between 1.5 and 2.0 MB in at
most 2 builds, and text in it is still searchable.

### S4 · Cover page templates *(M)*
Status: done in code (commit 2097822). "The library preview matches the PDF" needs a device look.

As built:
- `coverTemplates.ts` has the registry, `layoutCover(templateId, values, pageSize, measure?)`,
  `coverDefaults(ctx)`, `withCoverDefaults(cover, defaults)` and `normalizeCoverConfig(raw)` (old
  `{ title, studentName, courseCode }` → Simple). `CoverPageConfig` now lives there and is
  re-exported from `pdfService`.
- Line breaks use Helvetica's metrics (pdf-lib's `StandardFontEmbedder`, synchronous) for both
  outputs; each renderer centres text with its own font, so Skia's system font stays centred.
  Text is reduced to WinAnsi (`?`) in the layout, so the library copy shows what the PDF shows.
  The template cover now uses Helvetica / Helvetica-Bold (was Times bold for the title).
- `CoverItem` is `text | line | box`, top-left origin, text `y` = baseline.
- Field set: institution, title, docLabel ("Assignment 3"), course code and name, teacher, name,
  roll, section, date ("2 October 2026"), experiment no. and name. The title has no default; a
  lab's experiment no. defaults to its number. Simple uses the title, or the type and number when
  there is none, as its heading. A row with no value, and an empty "Submitted by/to" box, are
  left out.
- In `deliver.academicConfig` a template's `values` are only the edits; `useCoverDefaults()`
  (store) gives the defaults for the current course and type, and Deliver and Academic options
  fill them in with `withCoverDefaults` before drawing. A cleared field stays empty.
- Thumbnails (`components/deliver/CoverThumbnail`) draw the same items with plain Views, not
  Skia. Template edits survive switching the cover to Photo and back while the screen is open.

- `src/services/pdf/coverTemplates.ts`: a registry `{ id, label, fields, layout }` for
  **Simple**, **Assignment** and **Lab report**.
  - Fields come from the profile (name, roll, section, institution), the course (name, code,
    teacher), the document (title, type and number, e.g. "Assignment 3"), and the date
    (submission date by default, editable).
  - Lab report adds "Experiment no." and "Experiment name", typed in by the user.
- `layoutCover(template, values, pageSize) → CoverItem[]` is a **pure** function that returns
  positioned text lines, lines and boxes in points. Both outputs use it:
  - `pdfService.buildCoverPage` draws the items with pdf-lib (vector text);
  - `academicRasterService.renderCoverPageImage` draws the same items with Skia for the library
    display copy.
- `CoverPageConfig` becomes `{ mode: 'template', templateId, values } | { mode: 'imported_image', importedUri }`.
  Old saved configs without a `templateId` map to Simple.
- `AcademicOptionsScreen`: a template picker with thumbnails (from `layoutCover` drawn small),
  the fields pre-filled from the profile and course, and editable.
- Tests: `layoutCover` for each template (nothing overlaps; long names wrap to at most 2
  lines; empty fields are left out); text extraction from the generated PDF.

**Done when:** an Assignment cover shows the student's name, roll, course code, teacher and
"Assignment 3" without typing anything, and the library preview matches the PDF.

### S5 · Footer presets and page size *(S)*
Status: todo

- Header and footer text use the S2 token renderer, plus `{X}` and `{Y}` for page numbers.
  Presets in `AcademicOptionsScreen`:
  - **Page numbers:** `Page {X} of {Y}`;
  - **Name + pages:** `{name} · {roll} · {X}/{Y}`;
  - **Custom.**
- Page size **A4 · Letter** in Deliver (`deliver.pageSize`). Pass it through
  `buildPdfFromPages`; replace the fixed `PageSizes.A4`, `A4_WIDTH_PT`/`A4_HEIGHT_PT` and the
  Letter-landscape 2-up constants with values from the chosen size (2-up uses the same size in
  landscape). The cover layout (S4) and the ID-card full page (C4) take the page size too.
  Default: A4, or Letter when the phone's region is US/CA (`expo-localization` region).
  Update the "A4 · fit to content" text in `MoreOptionsPanel`.
- Tests: page dimensions for both sizes and both layouts; the footer renders tokens and page
  numbers; the ID-card page still prints at 100 % on Letter.

**Done when:** a Letter export has Letter-sized pages with correct margins, and the "Name +
pages" footer shows on every content page but not on the cover.

### S6 · The Submit flow and per-course presets *(M)*
Status: todo

- `SubmitPreset = { sizeLimitBytes: number | null; coverTemplateId: string | null; footerPreset: 'none' | 'pages' | 'namePages' | 'custom'; footerText?: string; border: boolean; pageSize: 'A4' | 'Letter'; layout: LayoutMode; nameTemplate?: string }`.
  Stored on the course: migration v5 adds `courses.submit_preset` (JSON text, nullable).
  Courses without one use the app default (no limit, no cover, page-number footer, A4, standard).
- `src/services/submit/submitDocument.ts`:
  `submitDocument(doc, preset, profile, course) → { uri, fileName, sizeBytes, fits }`.
  It builds the submission PDF from the library masters (`buildPdfFromPages` with the S3
  ladder, the S4 cover and the S5 footer), writes it to
  `library/<docId>/submissions/<fileName>.pdf`, and returns it. One page at a time, as usual.
- Deliver: a large **Submit** button in `StickyActions` (Save stays as the secondary action).
  Submit saves the document as now, then runs `submitDocument`, then `shareAs`, then records
  the submission (S7).
  - Progress text: "Building PDF… page 3 of 10", then "Fitting under 2 MB…".
  - The advanced options collapse into one summary line, for example "Under 2 MB · Assignment
    cover · Name + pages · A4", which opens the full options. Changing options there saves them
    to the course's preset ("Remember for CSE 101", on by default).
  - First submit without a profile: a short sheet asks for name and roll (S1 fields), with
    "Skip".
- Library and Reader: "Submit" in the overflow menu re-runs `submitDocument` with the course's
  preset, for documents saved earlier.
- Tests: `submitDocument` with fake builders (preset applied, name rendered, file in
  `submissions/`); preset JSON round trip and a missing preset; the Deliver reducer for the
  remembered preset.

**Done when:** after one set-up submit to a course, the next scan for that course goes Review
"Next", then "Submit", then the app in the share sheet: 3 taps, with the right name and size.

### S7 · Submission history *(M)*
Status: todo

- Migration v6: `submissions` (id, document_id, course_id, file_name, size_bytes,
  size_limit_bytes, page_count, created_at). Deleting a document deletes its rows (cascade)
  and its `submissions/` folder (it is inside the document folder already).
  Android's share sheet doesn't say which app was chosen, so the target is not stored.
- `libraryRepo`: `insertSubmission`, `listSubmissions({ courseId? , documentId? })`.
  Loaded with the library; a `submissions` slice in `librarySlice`.
- `CourseScreen`: a **Submitted** section (newest first): file name, date, size, with "Share
  again" (shares the stored file; if it was deleted, rebuild it with `submitDocument` and the
  stored settings) and "Open".
- Reader: a line under the title, "Submitted 2× · last on 3 Oct", that opens the list.
- Library search: the filter "Submitted" / "Not submitted".
- Tests: migration, insert and list, cascade on document delete, the reshare fallback when the
  file is missing.

**Done when:** after submitting HW3 twice, the course page shows both submissions with their
sizes, and "Share again" works even after the cache was cleared.

### S8 · Deadline reminders *(M)*
Status: todo

- Add `expo-notifications@~57.0.21`. Local notifications only: no push token, no network.
  Check the config plugin options in the package source (see AGENTS.md); Android 13+ needs
  `POST_NOTIFICATIONS`. Ask for permission **only when the first deadline is created**.
- Migration v7: `deadlines` (id, course_id, title, due_at, doc_type, reminder_ids JSON,
  done_submission_id nullable, created_at).
- `src/services/submit/deadlines.ts`:
  - `scheduleReminders(deadline)` schedules notifications 24 hours and 2 hours before
    `due_at` (skipping times already past), stores the notification ids, and cancels and
    reschedules them on edit; `cancelReminders` on delete or done.
  - `matchDeadline(submission, deadlines)`, a pure function: an open deadline of the same
    course (and the same type if set) that is due after the document was created.
- UI:
  - "Add deadline" on `CourseScreen` and on Home: title, date and time, type.
  - Home: a **Due soon** strip above the course grid (next 7 days, overdue in red).
  - Tapping a reminder opens the course page with that deadline highlighted and a "Scan now"
    button (`startScan` with the course).
  - After a submit that matches an open deadline: "Mark 'HW3' as done?" in the snack.
- Tests: reminder times (past times skipped, edit reschedules); `matchDeadline`; the migration.
  `expo-notifications` is mocked in `src/test/mocks`.

**Done when:** a deadline set for tomorrow 10:00 gives notifications at 10:00 today and
08:00 tomorrow, and submitting the assignment marks it done after one tap.

---

## Order and dependencies
S1, then S2 (fixes the shared file name, worth shipping on its own), then S3, then S4, then
S5, then S6 (needs S2–S5), then S7, then S8.

## Critical files
- `src/services/submit/{profile,naming,sizeTarget,submitDocument,deadlines}.ts` (new)
- `src/services/pdf/{pdfService,coverTemplates (new),academicRasterService}.ts`,
  `src/services/capture/imageSpec.ts`, `src/services/sharing/shareService.ts`
- `src/services/persistence/{migrations,libraryRepo}.ts`, `src/store/slices/{settingsSlice,deliverSlice,librarySlice}.ts`,
  `src/services/persistence/settingsStorage.ts`
- `src/screens/{DeliverScreen,AcademicOptionsScreen,SettingsScreen,CourseScreen,HomeScreen,ReaderScreen}.tsx`,
  `src/components/deliver/{StickyActions,MoreOptionsPanel}.tsx`, `src/components/settings/ProfileSection.tsx` (new)
- `app.json` and `package.json` (S8: `expo-notifications`)

Existing code to reuse: `buildPdfFromPages` with an `ExportPreset` encoding, `renderPage`,
`fitWithin`, `toWinAnsiSafe`, `stampAcademicPage`, `renderCoverPageImage`,
`docTypes.getDocType().short`, `nextTypeNumber`, `utils/sanitize`, `CourseChips`,
`DocTypeSelector`, `startScan`, `processSequentially`, the pdfjs text-extraction test helper from F6.

## Verification (for the whole of §4)
1. `npm run typecheck && npm test` pass in CI.
2. On an Android device (dev build):
   - fill in the profile; scan 10 handwritten pages for CSE 101 as an Assignment, with "Under
     2 MB", the Assignment cover and the "Name + pages" footer;
   - share to Gmail or Google Drive: the file is named `<roll>_<name>_CSE101_HW1.pdf`, is at
     most 2 MB, has the cover and footer, and its text is searchable;
   - the next scan for CSE 101: Review "Next", "Submit", then the app = 3 taps, named HW2;
   - the course page shows both submissions; "Share again" works;
   - a deadline reminder arrives and opens the course; submitting marks it done.
3. Print the PDF on A4 and on Letter: margins correct, nothing cut off.
