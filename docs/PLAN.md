# PDF Scan: Plan to become the #1 scanner for students

This is the master plan. Each section below gets its own detailed, step-by-step document later
(`docs/plan/<NN>-<section>.md`). This file sets the direction, the order of work, and what
"done" means for each section.

---

## 1. Positioning

**One line:** The free scanner that turns handwritten work and lecture material into
submission-ready PDFs. No watermark, no account, works offline.

**Who it's for:** high-school and university students, mainly on Android and mid-range phones,
who:
- submit handwritten assignments, lab reports and exam answer sheets as PDFs (Google Classroom,
  Moodle, Canvas, Teams, email, WhatsApp to the teacher);
- photograph whiteboards, slides, textbook pages and classmates' notes;
- need to find "that page about X" again before an exam.

**Why they switch from CamScanner and similar apps:**
| Pain with incumbents | Our answer |
|---|---|
| Watermark, paywall on basic export | Core is free forever, no watermark |
| Account/cloud required, privacy worries | Fully on-device, no login |
| File too big for the LMS upload limit | Submit flow that hits an exact size ("under 2 MB") |
| Handwriting on lined paper looks grey and muddy | Filter tuned for pen/pencil on notebook paper |
| Messy file names, everything in one pile | Course-based organization and auto naming |
| Generic tool, not built for school | Cover pages, page numbers, 2-up, roll number on every page |

**What we do NOT try to be:** a general office suite, a cloud drive, or a full PDF editor. Every
feature must answer "does this help a student scan, submit, or study?"

---

## 2. Product principles

1. **Scan quality first.** A blurry or grey scan loses the user, whatever the feature list.
2. **Three taps to submit.** Scan, check, send. Everything else is optional.
3. **Offline and private by default.** Network only for actions the user starts (share, backup).
4. **Honest UI.** No fake features (for example, the current "Protect" button). Hide it until it is real.
5. **Fast on a $150 phone.** Bound memory, process pages one at a time, no jank on scroll.
6. **Built for more scripts and languages.** Script, font and UI language are lookups, never
   hard-coded, so Bengali (and others) can be added without refactoring (see §6).

---

## 3. Information architecture (target)

Bottom tabs:

| Tab | Purpose |
|---|---|
| **Home** | Courses grid, "Continue" (last document), recent submissions, the big Scan button |
| **Scan** | Camera / import, then Review, then Submit or Save |
| **Library** | All documents, search (full-text through OCR), filters by course, type and date |
| **Settings** | Student profile, defaults, OCR language, backup, about |

Main flows:
- **Submit flow:** Scan → Review → *Submit* (course, auto name, cover, size target) → Share sheet / save.
- **Study flow:** Home → Course → Document → Reader (search, highlight, copy text).
- **Quick save:** Scan → Review → Save to course (no export).

---

## 4. Sections

Each section lists the goal, the work, and the definition of done. Sizes: S = about a day,
M = a few days, L = a week or more.

### §0 Foundation and quality fixes *(must happen first)*
Goal: the existing app is trustworthy and store-ready before new features go in.

**Detailed steps:** [`docs/plan/00-foundation.md`](plan/00-foundation.md). Done in code; the device
checks in that plan's Verification section are still to do.

- [x] F1 Test harness and CI
- [x] F2 Store hygiene (app ID `com.yeasin.pdfscan`, no RECORD_AUDIO, remove spikes, hide Protect/Pro)
- [x] F3 Library storage moves to SQLite as the single source of truth (fixes the data-loss risk)
- [x] F4 Folders + course folders become one Course model
- [x] F5 Image pipeline: high-resolution master, edits that don't re-save, one encode per export
- [x] F6 OCR text layer for every script (glyphless font)
- [x] F7 Small correctness fixes (LIKE escaping, OCR-failed flag, error boundary)
- [x] F8 Opt-in crash reporting (Sentry)

**Done when:** tests pass in CI, a 10-page scan exports sharp enough to read 8 pt print, and OCR
text in every supported script is searchable in an external PDF viewer.

### §1 Capture
Goal: the best camera experience for school material.

**Detailed steps:** [`docs/plan/01-capture.md`](plan/01-capture.md)

- [x] C1 Capture modes (Notes, Document, Board, Book, ID card) and mode picker
- [x] C2 Scanner plugin options patch (page limit per mode, gallery import in Google's scanner)
- [x] C3 Book mode: split two-page spreads at the gutter
- [x] C4 ID card mode: front and back at true size on one A4 page
- [x] C5 Batch gallery import with automatic cropping (OpenCV spike first)
- [x] C6 Haptics, per-page progress, "Scan more" loop, cancel
- [x] C7 Fallback when Google's scanner is unavailable (custom live camera stays in P3)

**Done when:** a student can capture a 10-page handwritten assignment in under 60 seconds with no
manual cropping on most pages.

### §2 Review and enhance
Goal: handwriting and boards look like clean photocopies.

**Detailed steps:** [`docs/plan/02-review-enhance.md`](plan/02-review-enhance.md)

- [x] E1 Filter registry and shared filter engine (adds Original, Ink, Board)
- [x] E2 Live preview without temporary files, plus a dev Filter Lab
- [x] E3 Shadow and lighting correction for every filter
- [x] E4 Ink filter for handwritten notes (soft curve, fade ruled lines, keep pen colour)
- [x] E5 Board filter for whiteboards, blackboards and slides
- [x] E6 Review UX: thumbnail filter strip, undo/redo, apply-to-all with undo, crop loupe
- [ ] E7 Blind benchmark against CamScanner and parameter tuning

**Done when:** in side-by-side tests on 20 real student pages, our output is preferred over
CamScanner's free output on most of them.

### §3 Courses and organization
Goal: everything is filed by course without the student thinking about it.

**Detailed steps:** [`docs/plan/03-courses.md`](plan/03-courses.md) (builds on §0 F4's Course model)

- [x] K1 Course and semester data model (archive a whole semester at once)
- [x] K2 Home tab: course hub with Continue card, course grid and course page
- [x] K3 Course setup and editing (quick "Add your courses" sheet, reused by onboarding)
- [x] K4 Document types (Assignment, Notes, Handout, Exam, Lab, Other)
- [x] K5 Automatic filing: course suggestions and an optional timetable
- [ ] K6 Organising existing documents (move, set type, sort Unsorted, search filters)

**Done when:** a new user creates 4 courses during onboarding and every later scan lands in the
right one with zero or one tap.

### §4 Submit (the killer feature)
Goal: an assignment ready to upload, in one screen.

**Detailed steps:** [`docs/plan/04-submit.md`](plan/04-submit.md)

- [ ] S1 Student profile (name, roll, section, institution; stored only on the phone)
- [ ] S2 Naming template (`{roll}_{name}_{course}_{type}{n}`) and shared files named after the document (today they arrive as `document.pdf`)
- [ ] S3 Exact size target (Under 1 / 2 / 5 / 10 MB / custom), OCR text kept
- [ ] S4 Cover page templates (Simple, Assignment, Lab report) filled from profile and course
- [ ] S5 Footer presets (page numbers, name + roll + pages) and A4 / Letter page size
- [ ] S6 Submit button and per-course submission presets (3 taps after capture)
- [ ] S7 Submission history per course, with "Share again"
- [ ] S8 Deadline reminders (local notifications, optional)

**Done when:** from opening the app to having the share sheet open with a correctly named,
under-limit PDF takes 3 taps after capture.

### §5 Study
Goal: scans become study material, not dead files.

- [ ] Full-text search across all courses with page-level jump and highlight (OCR bounding boxes
      already stored). (M)
- [ ] Copy text / "Extract text" from a page or a selection. (S)
- [ ] Reader annotations: highlighter, pen, text note, saved into the PDF. (L)
- [ ] Bookmarks and "Exam pack": combine selected pages from several documents into one
      revision PDF. (M)
- [ ] *(Later)* Flashcards from highlighted text, all on-device. (L)

**Done when:** a student can search a word and land on the exact highlighted page within 2 seconds
in a library of 500 pages.

### §6 Languages and scripts *(designed now, Bengali later)*
Goal: adding a new script or UI language is a configuration change, not a refactor.

- [ ] `OcrEngine` interface (`recognize(uri, script) -> PageOcr`); ML Kit is the first
      implementation. Tesseract (needed for Bengali) can be added later as a second engine. (M)
- [ ] Script registry: `{ id, label, engine, pdfFont, sampleText }`, used by Settings, OCR and the
      PDF text layer. Bengali is listed as "coming soon" or omitted, never broken. (S)
- [ ] UI strings extracted to an i18n layer (`expo-localization` plus a translation catalog);
      English only for now. (M)
- [ ] Downloadable language packs (keeps the APK small when Tesseract models arrive). (L, later)

**Done when:** a branch that adds a fake script touches only the registry plus one font file.

### §7 Reader and PDF tools *(already strong: maintain, don't expand)*
- [ ] Keep merge, split, compress, sign and the universal reader.
- [ ] Real PDF password encryption via a native module, or keep it hidden. (L)
- [ ] Office formats stay read-only and are not promoted.

### §8 Backup and portability
Goal: students never lose a semester of notes.

- [ ] Export or import the whole library or one course as a `.zip` (PDFs plus metadata JSON). (M)
- [ ] Optional backup to the user's own Google Drive (Pro). (L)
- [ ] Warning when storage is low, and a report of "space used per course". (S)

### §9 Onboarding and UX polish
- [ ] 3-screen onboarding: what it does, set up the profile, add courses (skippable). (M)
- [ ] Empty states that teach (for example "Scan your first assignment"). (S)
- [ ] Accessibility: dynamic type, TalkBack/VoiceOver labels, contrast. (M)
- [ ] Performance budget: cold start under 2 s, library scroll at 60 fps with 500 documents. (M)

### §10 Monetization
Free forever: scan, all filters, OCR, Submit, courses, search, no watermark, no ads.

**Pro** (one-time purchase plus an optional cheap yearly plan, student pricing):
- Drive backup and sync between devices
- Unlimited "Exam packs" and annotations export
- App lock (biometric) and real PDF encryption
- Extra cover templates and themes
- *(Later)* Extra OCR language packs

Rule: never take away a feature that was free.

### §11 Launch and growth
- [ ] Store listing aimed at student searches: "scan assignment to PDF", "notes scanner",
      "compress PDF for Google Classroom". (S)
- [ ] Screenshots that show the Submit flow and handwriting before and after. (S)
- [ ] Closed beta with 20 to 50 students from 2 or 3 universities; weekly feedback form. (M)
- [ ] Share message (not a watermark) with an optional, user-controlled "Made with PDF Scan" link
      when sharing. (S)
- [ ] Campus ambassador / referral programme once retention is proven. (L)

---

## 5. Phases

| Phase | Sections | Outcome |
|---|---|---|
| **P0: Foundation** | §0 | Trustworthy, tested, store-ready core |
| **P1: Student MVP** | §1 (modes + gallery batch), §2 (Ink + Board filters), §3, §4, §9 onboarding | Play Store closed beta |
| **P2: Study** | §5, §6 groundwork, §8 zip export | Public Android launch |
| **P3: Grow** | §10 Pro, §8 Drive, §11, iOS parity | Revenue + growth |
| **P4: Expand** | Bengali via §6, flashcards, more templates | Regional #1 |

Rule: don't start a phase until the "done when" checks of the previous phase pass.

---

## 6. How we measure "#1"

- **North star:** documents submitted (shared or exported) per weekly active user.
- Week-4 retention ≥ 35 %.
- Play Store rating ≥ 4.6 with ≥ 1 000 reviews.
- Median time from capture to share under 45 s.
- Crash-free sessions ≥ 99.5 %.

---

## 7. Open decisions (need the owner's answer before the relevant phase)

1. App name and brand (app ID decided: `com.yeasin.pdfscan`): keep "PDF Scan" (generic, hard to rank) or pick a student-flavoured name?
2. Target region for launch and store listing languages.
3. iOS: launch with Android first, or both at once?
4. Pro pricing model: one-time, yearly, or both?
5. ~~Crash reporting vendor~~ Decided: Sentry, opt-in.

---

## 8. Next step

§0 is planned in `docs/plan/00-foundation.md`. §1 is planned in `docs/plan/01-capture.md`. §2 is planned in `docs/plan/02-review-enhance.md`. §3 is planned in `docs/plan/03-courses.md`. §4 is planned in `docs/plan/04-submit.md`. Next to plan: §5 Study (`docs/plan/05-study.md`).
