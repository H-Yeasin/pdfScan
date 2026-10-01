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

Step-by-step plan: [docs/plan/00-foundation.md](plan/00-foundation.md). Code status below; the
device checks in that plan's "Verification" section are still to do.

- [x] Keep a high-resolution master per page (about 2400 px long side); previews use a small copy. (M) — F5
- [x] Make every export from the master. Stop re-encoding JPEGs one generation after another. (M) — F5
- [x] OCR text layer for every script (one glyphless font instead of a per-script font registry),
      fix the silently dropped lines. (M) — F6
- [x] Remove the `RECORD_AUDIO` permission, set the real bundle ID and package name, allow dark
      mode in `app.json`. (S) — F2. The slug stays until the EAS project is renamed on expo.dev.
- [x] Hide "Protect" and the dead "Unlock Pro" button until they work. (S) — F2
- [x] Escape FTS5 search input (and LIKE wildcards). (S) — F3/F7
- [x] Library storage moves to SQLite as the single source of truth, with a data-loss guard. (M) — F3
- [x] Unify the two folder systems (`folderId` and `courseFolder`) into one **Course** model (§3). (M) — F4
- [x] Test setup (Jest + React Native preset) with unit tests for `pdfService`,
      `libraryOperations`, DB migrations and search. (M) — F1 onwards
- [x] CI: typecheck and tests on every push (GitHub Actions). (S) — F1
- [x] Exclude `src/dev/*` spikes from release builds; remove stray sample files. (S) — F2
- [x] App-wide error boundary. (S) — F7
- [x] Opt-in crash reporting so that real-device crashes are visible without breaking the privacy promise. (S) — F8

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
- [ ] C7 Fallback when Google's scanner is unavailable (custom live camera stays in P3)

**Done when:** a student can capture a 10-page handwritten assignment in under 60 seconds with no
manual cropping on most pages.

### §2 Review and enhance
Goal: handwriting and boards look like clean photocopies.

- [ ] **Ink filter** for pen or pencil on lined or grid paper: adaptive threshold, boosted ink,
      faded ruling lines (Skia shader). (L)
- [ ] **Board filter**: glare and colour-cast removal, background flattened to white or black. (M)
- [ ] Shadow removal (illumination normalization) for every mode. (M)
- [ ] Apply-to-all-pages for filter and adjustments. (S)
- [ ] Keep the existing crop, rotate, reorder, retake and half-page split; polish the gestures. (S)
- [ ] Before/after toggle (press and hold). (S)

**Done when:** in side-by-side tests on 20 real student pages, our output is preferred over
CamScanner's free output on most of them.

### §3 Courses and organization
Goal: everything is filed by course without the student thinking about it.

- [ ] `Course` entity: name, code, colour or emoji, semester, teacher (optional), archived flag. (M)
- [ ] Semesters: group courses; archive a whole semester at once. (S)
- [ ] Remember the "last course used" and suggest a course from the time of day (optional
      timetable). (M)
- [ ] Document types inside a course: Assignment, Notes, Handout, Exam, Other (filters plus
      naming). (S)
- [ ] Migration from the existing folders and `courseFolder` data, with no data loss. (M)

**Done when:** a new user creates 4 courses during onboarding and every later scan lands in the
right one with zero or one tap.

### §4 Submit (the killer feature)
Goal: an assignment ready to upload, in one screen.

- [ ] **Student profile** (Settings): name, roll or ID number, section, institution. Stored locally. (S)
- [ ] **Auto naming template**, for example `{roll}_{name}_{course}_{type}{n}` gives
      `2021331045_Rahim_CSE101_HW3.pdf`. (S)
- [ ] **Exact size target:** "Under 1 / 2 / 5 / 10 MB / custom". Binary search over resolution
      and JPEG quality, keeping OCR intact. (M)
- [ ] **Cover page templates** (generic, lab report, assignment), filled from the profile and the
      course. (M)
- [ ] Header and footer: name, roll and page number "1 / 10" on every page (already partly built
      in Academic mode). (S)
- [ ] 2-up Eco layout (exists) and an A4/Letter page size choice. (S)
- [ ] Submit history per course: what was sent, when, and at what size. Can be re-shared. (M)
- [ ] Deadline reminders (local notifications, optional). (M)

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

§0 is planned in `docs/plan/00-foundation.md`. §1 is planned in `docs/plan/01-capture.md`. Next to plan: §2 Review and enhance (`docs/plan/02-review-enhance.md`).
