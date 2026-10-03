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

**What we do NOT try to be:** a full office suite, a cloud drive, or a full PDF editor. Light
conversions and edits for coursework are in (§12, decided 2026-10-03). Every feature must answer
"does this help a student scan, submit, or study?"

---

## 2. Product principles

1. **Scan quality first.** A blurry or grey scan loses the user, whatever the feature list.
2. **Three taps to submit.** Scan, check, send. Everything else is optional.
3. **Offline and private by default.** Documents, OCR text and names never leave the phone. The
   network is used only for actions the user starts (share, backup), plus the light ads and the
   Remote Config switches from §10, which never carry document data.
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
- [x] K6 Organising existing documents (move, set type, sort Unsorted, search filters)

**Done when:** a new user creates 4 courses during onboarding and every later scan lands in the
right one with zero or one tap.

### §4 Submit (the killer feature)
Goal: an assignment ready to upload, in one screen.

**Detailed steps:** [`docs/plan/04-submit.md`](plan/04-submit.md)

- [x] S1 Student profile (name, roll, section, institution; stored only on the phone)
- [x] S2 Naming template (`{roll}_{name}_{course}_{type}{n}`) and shared files named after the document (today they arrive as `document.pdf`)
- [x] S3 Exact size target (Under 1 / 2 / 5 / 10 MB / custom), OCR text kept
- [x] S4 Cover page templates (Simple, Assignment, Lab report) filled from profile and course
- [x] S5 Footer presets (page numbers, name + roll + pages) and A4 / Letter page size
- [x] S6 Submit button and per-course submission presets (3 taps after capture)
- [x] S7 Submission history per course, with "Share again"
- [x] S8 Deadline reminders (local notifications, optional)

**Done when:** from opening the app to having the share sheet open with a correctly named,
under-limit PDF takes 3 taps after capture.

### §5 Study
Goal: scans become study material, not dead files.

**Detailed steps:** [`docs/plan/05-study.md`](plan/05-study.md)

- [x] T1 Page mapping (library page ↔ PDF page) and word-level OCR boxes
- [x] T2 Search results by page, with jump and highlight
- [x] T3 Copy page text, extract to .txt, select text on a page
- [x] T4 Annotations (highlighter snapped to words, pen, notes) kept through every PDF rebuild
- [x] T5 Bookmarks
- [x] T6 Exam pack: one revision PDF from pages across documents
- [ ] T7 *(Later, P4)* Flashcards from highlights

**Done when:** a student can search a word and land on the exact highlighted page within 2 seconds
in a library of 500 pages.

### §6 Languages and scripts *(designed now, Bengali later)*
Goal: adding a new script or UI language is a configuration change, not a refactor.

**Detailed steps:** [`docs/plan/06-languages.md`](plan/06-languages.md)

- [x] L1 Script registry v2 (Bangla listed as "coming soon") and per-course recognition language
- [x] L2 `OcrEngine` interface; ML Kit becomes the first engine; fake-script test
- [x] L3 Visible PDF text (covers, footers) in any script via Skia shaping + searchable text layer
- [x] L4 UI translation layer (`t()`, typed English catalog, pseudo-locale), English only
- [ ] L5 *(Later, P4)* Tesseract engine for Bangla
- [ ] L6 *(Later, P4)* Downloadable language packs

**Done when:** a branch that adds a fake script touches only the registry plus one engine or model file.

### §7 Reader and PDF tools *(already strong: maintain, don't expand)*
Goal: fix the gaps and risks in the existing tools; no new tool families.

**Detailed steps:** [`docs/plan/07-reader-tools.md`](plan/07-reader-tools.md)

- [x] R1 Imported PDFs become first-class: thumbnails, text extraction or OCR, search (small native module)
- [x] R2 Page-level tools for imported PDFs (merge, split, sign, submit) without losing vector text
- [x] R3 Edit pages after saving (reorder, lossless rotate, delete, extract, add pages)
- [x] R4 Reader conveniences (resume at last page, page jump, thumbnail scrubber)
- [ ] R5 Office formats read-only, safe and honest (fixed SheetJS, DOCX preview, drop .doc) — in progress: all but the SheetJS 0.20.3 swap (editing and conversion moved to §12)
- [ ] R6 *(Later, with Pro)* Real PDF passwords

**Done when:** a teacher's PDF can be searched, merged with a scanned answer, signed and
submitted, and every format the app accepts opens.

### §8 Backup and portability
Goal: students never lose a semester of notes.

**Detailed steps:** [`docs/plan/08-backup.md`](plan/08-backup.md)

- [x] B1 Storage health: integrity check, cache clean-up, space per course, low-space guard, Android backup rules
- [x] B2 Backup format: dependency-free zip (store-only, Zip64) with readable PDFs and `library.json`
- [x] B3 Back up and export (whole library, one course, chosen documents; everything or PDFs only)
- [x] B4 Restore and import (Restore keeps ids; Add for a classmate's course; all-or-nothing)
- [x] B5 Backup reminders and automatic backups to a chosen folder (Android)
- [ ] B6 *(Later, Pro)* Google Drive backup (`drive.appdata`, incremental)

**Done when:** a full backup restores on a new phone with every course, document, annotation and
deadline, and the zip opens on a laptop with the PDFs under readable names.

### §9 Onboarding and UX polish
Goal: a good first five minutes, and an app that is fast and usable for everyone.

**Detailed steps:** [`docs/plan/09-onboarding.md`](plan/09-onboarding.md)

- [x] O1 Android back button, start screen without a flash, splash screen
- [x] O2 Onboarding: three skippable screens (what it does, profile, courses)
- [x] O3 Empty states that teach, and one-time hints
- [x] O4 Accessibility: labels and roles, large text, contrast, reduce motion, gesture alternatives
- [ ] O5 Performance budget: selector-based store, deferred boot work, measured budgets
- [ ] O6 Polish sweep and "first day" walkthrough before the beta

**Done when:** cold start under 2 s, library scroll at 60 fps with 500 documents, a new user
reaches their first scan in under 90 s, and a TalkBack user can scan and submit.

### §10 Monetization *(revised 2026-10-02: ads now, paid Pro later)*
Free forever: scan, all filters, OCR in every language, Submit, courses, search, study tools
(annotations, bookmarks, exam packs), backups to a file or folder. No watermark. **No ads while
you work:** a small banner on the Home and Library lists only, never in capture, review, saving,
submitting or reading. Full-screen ads appear only when a free student taps a Pro task (a
conversion or file editing, §12) and chooses "Watch ad"; never automatically, no interstitials.

Google Play can't pay out to developers in Bangladesh, and Play policy forbids sending users to
pay outside Play (so no "WhatsApp us to buy Pro"). **Pro for now = a rewarded "Pro day pass"**:
watch one ad, get every Pro feature for 24 hours (extra cover templates and accents, app lock,
no banners; later PDF passwords and Drive backup). Paid Pro waits until a merchant route
exists. Backend: Firebase (free plan), Remote Config and opt-in usage counts, no login yet.

**Detailed steps:** [`docs/plan/10-monetization.md`](plan/10-monetization.md)

- [x] M1 Policy and privacy groundwork (target audience 13+, Data safety, privacy policy, toggles)
- [x] M2 Firebase Remote Config, no login (ads switch, pass length, support contact)
- [x] M3 Pro feature registry and entitlements (pass / lifetime / yearly; a test guards the free list)
- [x] M4 Pro features worth a pass: cover templates, theme accents, app lock
- [x] M5 Banner ads, light and safe (Home and Library only; consent; cold-start budget kept)
- [x] M6 Rewarded "Pro day pass" and the new Pro screen
- [x] M7 Help & feedback contact (WhatsApp 01645724080, support only)
- [x] M8 Opt-in usage counts (Firebase Analytics, off by default, allow-listed events)
- [ ] M9–M11 *(Later)* Paid Pro, Firebase Auth, launch rules, when a merchant route exists

Rule: never take away a feature that was free.

### §11 Launch and growth
- [ ] Store listing aimed at student searches: "scan assignment to PDF", "notes scanner",
      "compress PDF for Google Classroom". (S)
- [ ] Screenshots that show the Submit flow and handwriting before and after. (S)
- [ ] Closed beta with 20 to 50 students from 2 or 3 universities; weekly feedback form. (M)
- [ ] Share message (not a watermark) with an optional, user-controlled "Made with PDF Scan" link
      when sharing. (S)
- [ ] Campus ambassador / referral programme once retention is proven. (L)

### §12 Convert and light edit *(planned 2026-10-03, revised the same day)*
Goal: one app for a student's files: a study-first reader, conversions (Word/Excel/CSV/TXT →
PDF, scans and PDFs → Word) and simple edits. Never changes the original; says what formatting
is lost. **Conversions and file editing are Pro**, unlocked per task by one full-screen rewarded
ad (or the day pass); marking, OCR and copy/extract text stay free.

**Detailed steps:** [`docs/plan/12-convert-edit.md`](plan/12-convert-edit.md)

- [x] D1 Pro task gate: a full-screen ad, then the task continues (no broken flow, app lock safe, fail-open offline) — done in code; device check open
- [x] D2 Reader layout for studying (tool bar: Mark, Select text, Notes, Pages, Convert/Edit; reading settings) — done in code (Notes waits for D4); device check open
- [ ] D3 Mark mode: highlight, underline, strikethrough, pen and notes while reading (free)
- [ ] D4 Notes panel and notes export (free)
- [ ] D5 Office → PDF (Pro)
- [ ] D6 PDF/scan → Word (Pro)
- [ ] D7 Edit TXT and CSV (Pro, 30-minute session per document)
- [ ] D8 Edit XLSX cells (Pro; after R5's SheetJS swap)
- [ ] D9 Edit Word text (Pro)
- [ ] D10 PDF forms and text boxes (Pro; saves a copy)
- [ ] D11 Reading updates for Word and Excel (free)

**Done when:** a teacher's DOCX or XLSX from WhatsApp becomes a submitted PDF, a scanned page
becomes an editable Word file, and a typo in a CSV, TXT, XLSX or Word file can be fixed, all
offline.

---

## 5. Phases

| Phase | Sections | Outcome |
|---|---|---|
| **P0: Foundation** | §0 | Trustworthy, tested, store-ready core |
| **P1: Student MVP** | §1 (modes + gallery batch), §2 (Ink + Board filters), §3, §4, §9 onboarding | Play Store closed beta (ads off through Remote Config) |
| **P2: Study** | §5, §6 groundwork, §8 zip export | Public Android launch |
| **P3: Grow** | §10 ads + Pro day pass, §8 Drive, §11, §12 convert + light edit, iOS parity | Revenue + growth (paid Pro when a merchant route exists) |
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
4. ~~Pro pricing model~~ Revised 2026-10-02: no Play payouts in Bangladesh, so revenue = light ads + a rewarded
   "Pro day pass"; paid Pro (lifetime + yearly) is parked until a merchant route exists. Study tools stay free.
5. ~~Crash reporting vendor~~ Decided: Sentry, opt-in.
6. ~~Backend~~ Decided 2026-10-02: Firebase free plan (Remote Config, opt-in Analytics), no login until paid Pro.

---

## 8. Next step

§0 is planned in `docs/plan/00-foundation.md`. §1 is planned in `docs/plan/01-capture.md`. §2 is planned in `docs/plan/02-review-enhance.md`. §3 is planned in `docs/plan/03-courses.md`. §4 is planned in `docs/plan/04-submit.md`. §5 is planned in `docs/plan/05-study.md`. §6 is planned in `docs/plan/06-languages.md`. §7 is planned in `docs/plan/07-reader-tools.md`. §8 is planned in `docs/plan/08-backup.md`. §9 is planned in `docs/plan/09-onboarding.md`. §10 is planned in `docs/plan/10-monetization.md`. Next to plan: §11 Launch and growth (`docs/plan/11-launch.md`).
