# §3 Courses and organization: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement K1 from docs/plan/03-courses.md".
- Read `AGENTS.md` (auto-loaded) and only the step you are implementing; open only the files it
  names unless something unexpected comes up.
- **Prerequisites:** §0 F3 and F4, and §1 C1 must be done first (see below).
- When you finish a step, update its `Status:` line (`done (commit <sha>)`) and tick it in
  `docs/PLAN.md`. If the code no longer matches what a step describes, fix the step text too.

## Context
§3 files everything by course without the student having to think about it: semesters, a
Home screen with the courses, document types, and automatic course suggestions.

### What exists today and what F4 already covers
- **Today:** a `LibraryFolder` (id, name, createdAt) plus a free-text `courseFolder` string
  that also decides the file path. `LibraryScreen` has tabs Starred, Recent and Folders
  (`LibraryTabs`). `FolderList` provides create, rename and delete, plus a synthetic "Unfiled"
  bucket (`UNFILED_FOLDER_ID`). `ManageFoldersScreen` exists. `FolderPickerModal` is used in
  Deliver. `librarySlice` has the actions `CREATE_FOLDER`, `RENAME_FOLDER`, `DELETE_FOLDER`
  and `ASSIGN_FOLDER`. `TabBar` has only Capture and Library.
- **§0 F4 (prerequisite)** already delivers:
  - the `courses` table (id, name, code, color, semester, archived, created_at);
  - `documents.course_id`;
  - the migration from folders and `courseFolder`;
  - file paths that no longer depend on the course;
  - a single course picker in Deliver;
  - the label "Courses" in place of "Folders".
- **§3 therefore does not repeat the migration.** It builds the student-facing course
  experience on top of F4: semesters, a Home screen, automatic filing, document types and
  course setup.

### Key design decisions
- **Semester is its own small entity** (`semesters`: id, name, start, end, archived), not just
  a string, so a whole semester can be archived in one step and the current one can be found
  by date. F4's `courses.semester` text column is migrated into it.
- **Course suggestion is a ranked list, not a guess.** Order: the timetable slot right now,
  then the course used last in this capture mode, then the course used most in the last 7
  days. The top suggestion is preselected in Deliver, and one tap changes it.
- **Document type** (Assignment, Notes, Handout, Exam, Lab, Other) is stored on the document.
  It is used for filtering and as the `{type}` field in §4's naming template. Its default comes
  from the capture mode (C1 `docType`).
- **The Home tab** becomes the course hub that the IA in `docs/PLAN.md` §3 describes.

**Prerequisites:** F3 (SQLite repo and migrations), F4 (Course model), C1 (capture modes).

---

## Steps

### K1 · Course and semester data model *(M)*
Status: done (commit 9574adb). As built:
- Migration **v3**. Each old semester string (trimmed, case-insensitive) becomes one
  `semesters` row starting on its earliest course's day; then `courses.semester` is dropped.
  Every course gets `sort_order` (creation order) and a palette colour.
- `Course.color` is a **palette id** (`CourseColor`, e.g. `'blue'`), resolved by
  `tokens.courseColors` / `courseColorValue`. `Course` and `Semester` also keep `createdAt`.
  Semester dates are local days `'YYYY-MM-DD'` (`utils/localDate.ts`).
- Slice actions: `CREATE_COURSE` (with optional `fields`; assigns the colour and puts the
  course last), `UPDATE_COURSE` (replaces `RENAME_COURSE`), `REORDER_COURSES`,
  `CREATE/UPDATE/ARCHIVE/DELETE_SEMESTER`. No folder actions were left after F4.
  `ARCHIVE_SEMESTER` reaches disk in one `syncLibrary` transaction. Un-archiving goes through
  `UPDATE_*`, one course or semester at a time.
- Archived courses are still in `state.library.courses`; K2/K3 hide them in Home and the pickers.
- Done before K1 in the same session: §0/§1 (branch `ccr-ae22e8ac-tnkzk5`) merged into the §2
  branch (`505563c`), and the malicious `metro.config.js` payload removed (`a907d20`).

- Migration N+1 in `services/persistence/migrations.ts` (from F3):
  - a `semesters` table (id, name, starts_on, ends_on nullable, archived, created_at);
  - add to `courses`: `semester_id` (nullable FK), `emoji` (nullable), `teacher` (nullable),
    `sort_order`;
  - move the existing `courses.semester` text into `semesters` rows, matching by name.
- Add to `documents`: `doc_type` text (nullable, meaning "Other").
- Types in `src/types/models.ts`:
  - `Course { id, name, code?, color, emoji?, teacher?, semesterId?, archived, sortOrder }`;
  - `Semester { id, name, startsOn, endsOn?, archived }`;
  - `DocType = 'assignment' | 'notes' | 'handout' | 'exam' | 'lab' | 'other'`.
- `libraryRepo` (F3): CRUD for semesters, `archiveSemester(id)` (archives the semester and all
  its courses in one transaction), and `reorderCourses(ids)`.
- `librarySlice`: `courses`, `semesters` and the matching actions. Remove whatever is left of
  the folder actions.
- `src/services/courses/palette.ts`: 10 course colours taken from theme tokens, each readable in
  light and dark mode. A new course gets the next unused colour.
- Tests: the migration with and without old semester strings; archiving a semester archives
  its courses; colour assignment.

**Done when:** courses and semesters can be created, edited, reordered and archived from code,
survive a restart, and pre-F4 data still opens.

### K2 · Home tab: course hub *(M)*
Status: todo

- `TabBar` becomes **Home · Scan · Library** (the Settings icon stays at the top). Add the
  `ScreenName` value `'home'` and a `HomeScreen`. Home becomes the start screen once at least
  one course exists; before that the app opens on Capture, as it does today.
- `HomeScreen`:
  - a header with the current semester name and a switcher;
  - a "Continue" card for the last opened or saved document;
  - a **course grid**: coloured cards with emoji, code and name, document count and the date
    of the last scan; long-press offers edit, archive and reorder;
  - an "Unsorted (n)" card when it isn't empty;
  - a large Scan button.
- `CourseScreen` (a new screen, `'course'`): the course header, document type filter chips
  (K4), and the document list (reuse `FileRow` and `SelectionBar`). The scan button opens
  Capture with this course preselected for saving.
- Library's "Courses" tab (from F4) stays a plain list for power users and links to
  `CourseScreen`.
- Tests: Home's selectors (counts, last activity, current semester) as pure functions.

**Done when:** a user with 4 courses sees them on Home, opens one, and scans directly into it.

### K3 · Course setup and editing *(S)*
Status: todo

- `components/courses/CourseEditorSheet.tsx`: name (required), code, emoji picker (a short
  list of about 24 subject emojis, no extra package), colour swatches, teacher, semester.
- `components/courses/QuickSetupSheet.tsx`: "Add your courses". Rows of name and code fields,
  pre-filled with the next colours, plus a "Add another" button and a semester name (default
  "Fall 2026"/"Spring 2027" style, worked out from today's date).
  It is opened from Home's empty state now and will be reused by §9 onboarding.
- Archived courses: a "Show archived" switch on Home. Archived courses are hidden from pickers
  but their documents stay searchable.
- Tests: default semester naming from a date; validation (empty names, duplicate code in the
  same semester).

**Done when:** a new user can add 4 courses in under a minute from Home's empty state (the
§3 "done when").

### K4 · Document types *(S)*
Status: todo

- `src/services/courses/docTypes.ts`: a registry `{ id, label, icon }` for Assignment, Notes,
  Handout, Exam, Lab and Other.
- The default comes from the capture mode (C1 `docType`): Notes mode gives Notes, Document
  gives Handout, Board gives Notes, Book gives Handout, ID card gives Other.
- Deliver: a type chip next to the course picker, preselected from the default; one tap to
  change it.
- Library and CourseScreen: type filter chips with counts. The Reader overflow menu gets
  "Change type"; multi-select gets "Set type".
- Expose `docType` to §4's naming template (`{type}`, `{n}` = the next number for this course
  and type, for example HW3). `nextTypeNumber(courseId, type)` lives in `libraryRepo`.
- Tests: the defaults per mode; `nextTypeNumber` ignores deleted documents and counts per
  course.

**Done when:** every saved document has a type, and filtering a course by "Assignment" shows only
assignments.

### K5 · Automatic filing: suggestions and an optional timetable *(M)*
Status: todo

- `src/services/courses/suggestCourse.ts`:
  `suggestCourses({ now, mode, timetable, history }) → courseId[]`, a pure function.
  1. The timetable slot that contains `now` (with 15 minutes of slack either side).
  2. The last course used with this capture mode.
  3. The most-used course in the last 7 days.
  4. The other active courses alphabetically.
- History comes from `documents` (course_id, created_at, mode); no separate log table.
- **Timetable (optional):** a `timetable_slots` table (id, course_id, weekday 0–6, start_min,
  end_min). A simple weekly grid editor is reachable from the course editor ("Class times")
  and from Settings.
- Deliver preselects the first suggestion and shows the top 3 as chips plus "More…". If the
  user opened Scan from a `CourseScreen`, that course always wins.
- Capture screen shows a small "Saving to: CSE 101" chip, so the student knows before
  scanning; tapping it changes the course.
- Tests: suggestion order for each rule; slack at slot edges; archived courses never suggested;
  an empty history.

**Done when:** in a manual run with a timetable of 4 courses, a scan during class time saves to
the right course with no taps, and without a timetable the suggestion matches the last course
used for that mode.

### K6 · Organising existing documents *(S)*
Status: todo

- Multi-select in Library and CourseScreen: "Move to course" (reuse the course picker; this
  changes no files thanks to F4), "Set type" (K4), and "Archive".
- An "Unsorted" view with a one-time banner: "n documents have no course. Sort them now?" that
  steps through them one by one with the course chips from K5.
- Course deletion: confirm, then the course's documents move to Unsorted (F4 behaviour); offer
  "Archive instead".
- Search (F3 FTS): add course and type filters to the results, and show the course colour dot on
  each `FileRow`.
- Tests: moving many documents is one transaction; deleting a course with archived documents.

**Done when:** 20 unsorted documents from before the update can be filed in under 2 minutes.

---

## Order and dependencies
K1, then K3 (needs the model), then K2 (needs the editor for its empty state), then K4, then
K5, then K6.

## Critical files
- `src/services/persistence/{migrations,libraryRepo}.ts` (from F3), `src/types/models.ts`
- `src/services/courses/{palette,docTypes,suggestCourse}.ts` (new)
- `src/screens/{HomeScreen,CourseScreen}.tsx` (new), `src/screens/{LibraryScreen,DeliverScreen,CaptureScreen,ReaderScreen}.tsx`
- `src/components/courses/{CourseEditorSheet,QuickSetupSheet,TimetableEditor,CourseChips}.tsx` (new)
- `src/components/shared/TabBar.tsx`, `src/types/navigation.ts`, `src/bootstrap/AppNavigator.tsx`
- `src/store/slices/{librarySlice,deliverSlice}.ts`

Existing code to reuse: `FolderList`'s create, rename and delete flow (it becomes
`CourseList`), `FolderPickerModal` (it becomes the course picker in F4), `FileRow`,
`SelectionBar`, `TextPromptModal`, `EmptyState`, `SegmentedControl`, the `Pill` chip,
`createId`, theme tokens.

## Verification (for the whole of §3)
1. `npm run typecheck && npm test` pass in CI.
2. On an Android device (dev build):
   - fresh install: add 4 courses from Home in under a minute;
   - set a timetable; a scan during a class slot is filed with no taps;
   - scan from a course's page: the document lands in that course with the right type;
   - archive the semester: its courses disappear from Home and pickers, and their documents
     are still found by search;
   - upgrade from a build with folders and course folders: everything is still there and
     opens.
