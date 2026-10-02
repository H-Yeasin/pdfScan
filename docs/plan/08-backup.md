# §8 Backup and portability: step-by-step plan

## How to use this file
- Implement **one step per session**: "Implement B1 from docs/plan/08-backup.md".
- Read `AGENTS.md` (auto-loaded), `docs/plan/README.md` (progress), and only the step you are
  implementing. Open only the files it names unless something unexpected comes up.
- **Prerequisites:** §0 F3 (SQLite library) and the tables added since (courses, semesters,
  timetable, submissions, deadlines, annotations, bookmarks). New migrations take **the next
  free version** in `persistence/migrations.ts` (v16 when this was planned).
- When you finish a step, update its `Status:` line (`done (commit <sha>)`), add short "As
  built" notes where the code differs, tick it in `docs/PLAN.md`, and update the tables in
  `docs/plan/README.md`.

## Context
Goal from `docs/PLAN.md`: **students never lose a semester of notes.** Everything is on the
phone only, so a lost, broken or replaced phone loses everything. This section adds safe local
backups, moving a library to a new phone or a laptop, sharing a course's notes, and keeping
storage under control. Cloud backup to the student's own Google Drive is a later Pro step.

### What the code looks like today (checked while planning, 2026-10-02)
- **Where data lives:**
  - SQLite `pdfscan.db` (expo-sqlite's default folder under `Paths.document`), schema v15:
    courses, semesters, documents, pages, timetable_slots, submissions, deadlines,
    annotations, bookmarks, and the `pages_fts` index;
  - files in `Paths.document/library/<docId>/`: `document.pdf`, `page_N.jpg` (masters),
    `display_N.jpg`, `thumb_N.jpg`, `submissions/*.pdf`, plus `source.*` for Office files;
  - `Paths.document/signature/` (saved signature), `Paths.document/external-open/` (recently
    opened outside files, pruned to 5);
  - AsyncStorage `app:settings` (profile, templates, preferences);
  - scheduled deadline notifications (`expo-notifications`) live in the OS, not in the app's
    files.
- **Paths are stored relative** to `Paths.document` (`libraryFiles.toStoredPath` /
  `fromStoredPath`), so a library can move between installs and phones.
- **No backup, export of the library, import of a backup, or storage report.**
  `export/deviceExportService` can write single documents to an Android SAF folder;
  `shareService.shareAs` shares single files.
- **No zip support** in the dependencies. `expo-document-picker`, `expo-sharing` and
  `expo-file-system` (new `File`/`Directory`/`Paths` API) are installed.
- **Android Auto Backup is not configured** in `app.json`, so Expo's template default applies:
  Android backs up app data to Google Drive only while it is under **25 MB**, and above that it
  silently backs up nothing. A restore from an old small backup, or a device-to-device
  transfer, could bring back the database without matching files, or the other way round.

### Key design decisions
- **One backup format for everything:** a standard `.zip` that a student can also open on a
  laptop.
  ```
  PDF Scan backup 2026-10-02.zip
    manifest.json        format version, app version, schema version, created, counts, kind
    library.json         every row the backup covers, as plain JSON (not the raw SQLite file)
    Courses/<Course>/<Document>.pdf    each document.pdf, under a readable name
    data/<docId>/page_N.jpg, thumb_N.jpg, display_N.jpg, source.*, submissions/*.pdf
    signature/…          (full backups only)
    settings.json        (full backups only; no Sentry or device-specific values)
  ```
  PDFs appear **once**, under readable course and document names; `manifest.json` maps each
  document id to its PDF path.
- **The zip is written without compression (STORE).** JPEGs and PDFs are already compressed, so
  deflating them saves almost nothing and costs a lot of time. That makes a small,
  dependency-free zip writer and reader in TypeScript practical: CRC-32, local headers, central
  directory, and **Zip64** for backups over 4 GB or 65,535 files. It streams through
  `expo-file-system` file handles one file at a time, so memory stays flat.
- **`library.json`, not the database file.** The importer maps a backup's rows into the
  *current* schema, so an old backup restores into a newer app, and the database's internal
  state (FTS index, `user_version`) is rebuilt instead of copied.
- **Two ways in:** *Restore* (a full backup onto this phone; the ids are kept, so restoring
  twice doesn't duplicate) and *Add* (a shared course or documents from someone else; the items
  get new ids and land in a new or chosen course).
- **No network unless the student starts it.** Backups go to the share sheet, an Android
  folder the student picks (which can be an SD card or a Google Drive folder through Android's
  file picker), or, later and in Pro, the student's own Google Drive.

---

## Steps

### B1 · Storage health: integrity, clean-up, report, low-space guard *(M)*
Status: done (commit 58ba0ee)

As built:
- Migration **v16**: `documents.missing_files` (also `LibraryDocument.missingFiles`, written by
  the normal sync) and `documents.disk_bytes`. `disk_bytes` is **not** in `LibraryDocument`: it
  is a database-only cache that `writeDocument` keeps only when the pages, PDF path and size are
  unchanged, so any save or edit clears it and `storageReport` measures that folder again (lazy,
  instead of measuring on every save). `libraryRepo.{loadDiskBytes,saveDiskBytes,documentIdsInDb}`.
- `findOrphans(documents, rowIds, now)` treats a folder as left over only when neither the
  in-memory library nor the database knows it, it isn't empty, and nothing in it changed for
  15 minutes (a save writes files before its row). It skips `.`-folders (`.trash`, B4's
  `.incoming`) and the legacy `Courses/`. "Missing" means the PDF, the Office original or a
  page master is gone (thumbnails and display copies aren't checked); flagged documents whose
  files came back are unflagged. Trash entries are named `<movedAt>_<docId>`, so no other record
  is needed for the 7-day clean-up. Hook: `store/useStorageIntegrity.ts`.
- `cleanCaches({ sessionActive })`: always empties `share`, `extract`, `pdf-ops`, `pdf-native`;
  without an open session also `ImageManipulator/` and loose `.jpg/.png/.pdf` files in
  `Paths.cache`; prunes `external-open` to 5.
- Space guard: `usage.{spaceLevel,checkSpaceFor}` plus `store/useSpaceGuard.ts`. Before a scan
  or gallery import: an alert ("Free up space" / "Continue") once per app run. Before a save
  (`BYTES_PER_SAVED_PAGE` = 3 MB per page): under 50 MB left it stops with a snack, under 300 MB
  it warns with a "Free up space" snack action and saves.
- Storage screen: `screens/StorageScreen.tsx` (screen `storage`). Compress reuses the selection
  bar's logic, now `compressDocuments` in `useDocumentListActions.tsx`. `formatBytes` gained GB.
- Reader: shows "Some files are missing" when the file it would open doesn't exist (checked
  directly, not only through the flag); library rows show the same note when flagged.
- Backup rules: `database` domain `.` covers AsyncStorage (`RKStorage`, where `app:settings`
  lives on Android); the database itself is `files/SQLite/` (expo-sqlite's default folder).
  `library/.trash/` and `library/.incoming/` are excluded. Needs `npx expo prebuild` / a new dev
  build. The Storage screen's Android note doesn't say "Use Back up…" yet: B3 should add that
  once Back up exists.

- `src/services/storage/integrity.ts`:
  - `findOrphans()`: folders in `library/` with no document row (left over from crashes) and
    document or page rows whose files are missing;
  - `repair()`: move orphan folders to `library/.trash/` (deleted after 7 days), and mark
    rows with missing files (`documents.missing_files INTEGER`, migration) so the library shows
    "Some files are missing" instead of crashing; never deletes rows by itself.
  - Runs once at start-up after the library loads, in the background, one folder at a time.
- `src/services/storage/usage.ts`:
  - `storageReport()` → total app size, size per course (summing each document folder; the
    per-document size is cached in `documents.disk_bytes`, updated on save and edit), caches,
    and free space (`Paths.availableDiskSpace`);
  - `cleanCaches()`: empties `Paths.cache` subfolders the app owns (`share`, `extract`,
    `pdf-ops`, `pdf-native`, and preview temp files) when no session is active, and prunes
    `external-open`.
- **Settings → Storage** screen: a bar of space used per course (course colours), caches with
  "Clear", "Space left on phone", and the biggest documents (top 10) with "Open" and "Compress".
- **Low-space guard** (`checkSpaceFor(bytesNeeded)`): before a scan starts and before a save,
  under 300 MB free shows a warning with a "Free up space" button; under 50 MB, saving stops with
  a clear message, and the session is kept so nothing is lost.
- **Android Auto Backup rules** through a small config plugin `plugins/withBackupRules.js`
  (review it like any config file, see AGENTS.md Security):
  - `data_extraction_rules.xml` (Android 12+) and `full_backup_content.xml` (older): include the
    database, `library/`, `signature/` and the shared preferences; exclude caches and
    `external-open/`.
  - This keeps device-to-device transfers complete. Cloud Auto Backup still stops at 25 MB, so
    Settings says: "Android's own backup only covers small libraries. Use Back up to keep
    everything."
  - After any restore (Auto Backup, device transfer or B4), the integrity check above runs.
- Tests: orphan detection both ways; repair moves, never deletes; usage sums; the space guard
  thresholds; the config plugin output (snapshot of the generated XML).

**Done when:** Settings shows space per course, clearing caches frees space, and a document
folder deleted by hand shows as "files missing" instead of crashing the Reader.

### B2 · Backup format: zip writer and reader, library export and import mapping *(M)*
Status: done (commit a762099)

As built:
- **Checked:** `expo-file-system@57`'s `File.open(mode)` returns a `FileHandle` with
  `readBytes`, `writeBytes`, and a settable `offset` and `size` (sync). `file://` handles are
  seekable; SAF `content://` ones are not (and can't be `ReadWrite`).
- **Patched local headers, not data descriptors.** Sizes are known before a file is copied, so
  the writer puts the real size in the local header, streams the data while computing the CRC,
  then seeks back to fill the CRC in. That's a plain zip any reader handles (Java's
  `ZipInputStream` rejects STORE entries with data descriptors). It needs a seekable
  destination, so B3 writes to `Paths.cache/backup/` and then copies to SAF, as planned.
- `zip/zipFormat.ts` (records, `ZipError` codes `NOT_A_ZIP` / `UNSUPPORTED_ZIP` /
  `CRC_MISMATCH`, `ReadableHandle`/`WritableHandle` = expo's `FileHandle` shape),
  `zip/utf8.ts` (own UTF-8, not `TextEncoder`/`TextDecoder`), `zip/index.ts`
  (`createZip`, `addFileFromDisk`, `openZip`, `extractToFile`, which deletes a partial file on
  failure). The writer and reader yield between 1 MB chunks and take an `AbortSignal`.
  Folder entries from other tools are skipped. The user-facing message for `UNSUPPORTED_ZIP` is
  B4's (i18n).
- Zip64 is tested by lowering the limits (`ZipLimits`) instead of a 4 GB fake (a CRC over 4 GB
  takes too long in a test); the 70,000-entry test is real. Other readers: Python's `zipfile`
  (Zip64, CRC check), `unzip -t` (each skipped when missing) and jszip (comes with mammoth),
  not yauzl.
- `manifest.readable` maps a document id to `{ path, original }` (the readable zip path and the
  file's name in its folder). Office documents get a readable copy too (`Courses/Math/Essay.docx`);
  `document.pdf` never appears under `data/`. Files that are missing are left out; the row keeps its
  `data/` path, and the integrity check flags it after restore. Folder names come from `tDoc`
  (`document.backupCourses` / `backupUnsorted`).
- `exportRows(db, scope, schemaVersion)` returns `{ libraryJson, readable, files, counts }`;
  `buildManifest(...)` wraps it. Every file in `library/<docId>/` is included (submissions
  too). It blanks `deadlines.reminder_ids` and `documents.disk_bytes`. A course scope brings its
  semester, timetable and deadlines; a documents scope brings their courses (and semesters)
  only.
- `importPlan` extras: a row whose id is taken by something else on this phone gets a new id
  (e.g. a page moved by a merge). Add mode drops submissions and timetable slots, and brings
  deadlines only for courses it creates. Courses match on trimmed, case-insensitive name and
  code. New courses go after the existing ones (`sort_order`), into a semester matched by name
  or a new one. Also for B4: `loadCurrentLibrary(db)`, `targetPathForEntry(plan, manifest,
  entry)` (refuses `..`), and `insertRows(db, tables)` (only the current schema's columns; run
  it inside B4's transaction).
- **For B4:** `updated_at` changes on *every* document write, including the Reader saving the
  last page (§7 R4). So a document that was only *read* after a backup counts as changed and
  gets "keep both" on a second restore. If that shows up in practice, compare content columns
  instead of `updated_at` in `importPlan`.
- Test mock: `File.open()` and `FileMode` in `src/test/mocks/expoFileSystem.ts`.

- **Check first:** the `expo-file-system@57` file handle API (`File.open()`, `readBytes`,
  `writeBytes`, offsets) in the package source; the zip code needs random-access writes for
  headers or a "data descriptor" layout that only appends.
- `src/services/backup/zip/`:
  - `crc32.ts` (table-based, works on chunks);
  - `zipWriter.ts`: `createZip(destFile)` → `addFile(path, sourceFile)` (streams in 1 MB chunks,
    computing CRC-32 as it goes, using data descriptors) → `addJson(path, value)` → `finish()`
    (central directory, Zip64 records when needed). UTF-8 file names (flag bit 11);
  - `zipReader.ts`: reads the central directory (including Zip64), lists entries, extracts one
    entry to a file in chunks, and checks its CRC. **STORE entries only**; anything else (a zip
    made by another program and re-compressed) fails with `UNSUPPORTED_ZIP` and a message
    ("This zip was changed outside PDF Scan").
- `src/services/backup/format.ts`:
  - `BACKUP_FORMAT_VERSION = 1`, `Manifest` and `LibraryJson` types;
  - `exportRows(db, scope)` → the rows of every table for the scope (whole library, one or more
    courses, or chosen documents), with file paths rewritten to backup paths (`data/<docId>/…`);
  - `importPlan(manifest, libraryJson, currentLibrary, mode)` (**pure**): decides, per
    document, insert, skip (same id and same `updated_at`) or keep both (same id, different
    content: the incoming one gets a new id and the name gets " (restored)"); in *Add* mode,
    everything gets new ids, and courses are matched by code and name or created;
  - `upgradeLibraryJson(json)`: maps older format versions forward (none yet, but the hook and
    a test exist).
- Readable names: `Courses/<course name>/<document name>.pdf`, cleaned with `utils/sanitize`;
  duplicates get " (2)"; documents without a course go in `Unsorted/`.
- Tests: zip round trip (small files, empty files, UTF-8 names, a file over 4 GB simulated with
  a fake file handle, more than 65,535 entries simulated); the written zip opens with Node's
  `unzip`/`yauzl` in the test (as a check that other tools can read it); CRC failure detected;
  `importPlan` for every case; `exportRows` scopes.

**Done when:** a test library exported to a zip and imported into an empty database gives the
same rows and files, and the zip opens on a computer with the PDFs under readable names.

### B3 · Back up and export *(M)*
Status: done (commit ac0eee5)

As built:
- **Space check:** `createBackup` checks space with the exact file sizes that `exportRows` lists, plus
  the JSON and zip overhead, instead of `documents.disk_bytes`. It throws `BackupSpaceError`
  only below B1's 50 MB floor. The snack offers "Free up space".
- **Full backups** (`scope: all`, Everything) also carry `settings.json` and `signature/…`,
  which B2's format had planned but not added. `settings.json` is an allow-list
  (`BACKED_UP_SETTINGS`): theme, OCR script, default filters, last mode, profile, name
  template, the two prompts and the languages. Left out: crash reporting, folder permissions,
  first run, scanner availability, last opened and backup history. B4 applies it.
- **Hand-over** (`components/backup/useBackupExport.tsx` + `BackupSheet.tsx`, one dialog for
  choose, progress with Cancel, then Share / Save to folder / Done):
  - **Share** hands the zip over as it is (it already has its readable name, so no copy). The
    cache copy is **not** deleted right after, because the receiving app (an email draft, say)
    may read it later. The next backup empties `cache/backup/`, and so does Storage → Clear
    (`backup` is now one of B1's owned cache folders).
  - **Save to folder** streams the zip (`deviceExportService.saveFileToFolder`). The SAF file
    is made by the legacy `createFileAsync`, then written through the new `File(contentUri)
    .open(FileMode.WriteOnly)` handle (checked in expo-file-system 57's Android source:
    `forContentURI`). It goes in 1 MB chunks, with no whole-file base64. The cache copy is
    deleted afterwards. A failed save clears the folder setting, so the next save asks again.
  - A full backup that was shared or saved sets `lastBackupAt` / `lastBackupBytes`. Course and
    document exports don't.
- **Backup folder:** `settings.backupFolderUri` / `backupFolderLabel` are kept separate from the
  §0 export folder, so B5's rotation only ever touches a folder chosen for backups.
- **Course page:** there is no overflow menu, so "Export course…" is a header icon. On Unsorted
  it exports that page's documents. **Selection bar:** an `export` tool for any format
  (Library and Course pages, through `useDocumentListActions`).
- **Settings → Backup** is `screens/BackupScreen.tsx` (screen `backup`; Android Back goes to
  Settings). The app version comes from `config/appInfo.ts` (app.json). B1's Storage note now
  ends "Use Back up to keep everything."
- **Not done:** the profiler run in "Done when" (needs a device).

- `src/services/backup/createBackup.ts`:
  `createBackup({ scope, kind: 'full' | 'course' | 'documents', include: 'everything' | 'pdfsOnly' }, onProgress)`:
  - writes the zip to `Paths.cache/backup/` with `processSequentially` (one document at a time),
    progress in bytes and documents, and cancel;
  - checks free space first (`checkSpaceFor` with the estimated size from B1's
    `documents.disk_bytes`);
  - `pdfsOnly` writes only the readable PDFs plus `manifest.json` and `library.json` (with
    `restorable: 'pdfs'`): much smaller, opens anywhere, and still imports later as imported
    PDFs (§7 R1 makes those searchable).
- Where it goes:
  - **Share** (`shareAs`) to any app, for example Drive, email or Nearby Share;
  - **Android: Save to folder** through SAF (reuse `deviceExportService`'s folder picking and
    writing, streaming the file);
  - the cache copy is deleted after it was handed over.
- UI:
  - **Settings → Backup**: "Back up everything", last backup date and size, the destination
    folder (Android);
  - **Course page** overflow: "Export course…" (Everything / PDFs only);
  - **Library multi-select**: "Export…" for chosen documents.
- Store `settings.lastBackupAt` and `lastBackupBytes`.
- Tests: scopes produce the right entries; `pdfsOnly` content; cancel removes the partial file;
  the space check blocks a backup that can't fit.

**Done when:** a 500-page library backs up to a single zip with progress, memory stays flat
(profiler), and the zip can be saved to a folder or shared.

### B4 · Restore and import *(M)*
Status: done (commit de148e2)

As built:
- `backup/restoreBackup.ts`: `readBackup(file)` (sync; `NOT_A_BACKUP`/`TOO_NEW`/zip errors),
  `previewRestore(backup, mode)` (`importPlan` + bytes needed + `checkSpaceFor`), and
  `applyRestore(backup, preview, { onProgress, signal, restoreSignature })`. A restore below
  B1's 50 MB floor is refused (`RestoreSpaceError`). A folder already sitting at a target id
  with no row (crash leftovers) goes to `library/.trash/` first. If anything fails after moves
  began, the moved folders are deleted along with the rollback.
- **Write lock:** `dbService.withWriteLock` puts the library sync (`useLibraryPersistence`) and
  the restore's transaction in a queue. Both use the one connection, and overlapping
  transactions would interleave.
- **Reload:** after a restore the UI dispatches `library/RETRY_LOAD`. `useStorageIntegrity` now
  runs once per `loadAttempt` (not once per launch), so the integrity check runs after every
  B4 restore.
- **FTS:** the insert triggers index the pages, so no rebuild is needed (covered by B2's round
  trip test). **Deadlines:** open deadlines still ahead get new reminders through
  `scheduleReminders` (asking for notification permission once), and their ids are written
  back.
- **"PDFs only" backups** (`restorable: 'pdfs'`) are converted by `asImportedPdfs`: PDF
  documents become `imported_pdf` with no pages (the R1 indexer makes them again). Office files
  keep their row. Pages, annotations, bookmarks and submissions are dropped, and documents
  whose file isn't in the zip are skipped.
- **Settings** (`backup/restoreSettings.ts`, pure): a field counts as "set on this phone" when
  it differs from `initialSettingsState`. Theme only applies over `system`. The profile goes
  field by field, filling only empty fields. Unknown values are ignored. After a full restore,
  one alert ("Use the settings from the backup?") applies them. The saved signature comes back
  only when this phone has none. `sanitizeDefaultEnhance` moved to `settingsStorage.ts`.
- **UI:** `components/backup/RestoreHost.tsx`, always mounted in `AppNavigator` and opened by
  `ui/OPEN_BACKUP` (`ui.backupToOpen`). It shows a preview (counts, date and version, Restore /
  Add switch, what's new / already here / kept both, free space), then progress with Cancel.
  Errors say plainly that nothing was changed.
- **Entry points:**
  - Settings → Backup: "Restore from backup…" and "Import course or documents…". Both open the
    picker; the mode defaults by backup kind and can be switched in the preview.
  - The Library's existing "Open a file" picker now also accepts zips, instead of a separate
    Library button.
  - Android "Open with" for `application/zip` / `application/x-zip-compressed` (`app.json`;
    needs a new dev build).
  Incoming zips are copied to `cache/restore/` first (`backup/incomingZip.ts`,
  `store/backupIntake.ts`), because provider `content://` URIs can't be opened as a seekable
  handle. The copy is removed when the dialog closes, and Storage → Clear also empties it.
- **Still open from B2:** `updated_at` changes on every write, including the Reader's last
  page, so a document only *read* after a backup is "kept both" on a second restore. It hasn't
  been seen in practice yet.

- Entry points: Settings → Backup → **Restore from backup…** and Library → **Import
  course or documents…** (both use `expo-document-picker` for `.zip`); add an "Open with" intent
  filter for `application/zip` that routes PDF Scan zips here.
- Flow:
  1. Read `manifest.json` (check `format`, the app version, and that the zip is a PDF Scan
     backup).
  2. **Preview:** "3 courses · 120 documents · 450 MB. You have 2.1 GB free." plus the plan
     from `importPlan` ("118 new, 2 already here"). Mode: Restore (default for full backups) or
     Add (default for course or document exports).
  3. Copy the files **first**, one document at a time, into
     `library/.incoming/<docId>/`, checking each entry's CRC.
  4. Then, in **one database transaction**, insert the rows from the plan, and move each
     `.incoming/<docId>` folder into place. If anything fails, roll back the transaction and
     delete `.incoming/`, so a failed restore leaves the library exactly as it was.
  5. Afterwards: reload the library (`useLibraryPersistence`), let the FTS triggers index the
     pages (or run `INSERT INTO pages_fts(pages_fts) VALUES('rebuild')` once), reschedule
     future deadline notifications (`deadlines.scheduleReminders`), apply `settings.json`
     only on a full restore and only for fields the user hasn't set on this phone (ask once:
     "Use the settings from the backup?").
- Restoring an older backup into a newer app goes through `upgradeLibraryJson`; a backup from
  a **newer** app version than this one is refused with "Update PDF Scan to restore this
  backup".
- Tests: restore into an empty library; restore twice (no duplicates); Add mode (new ids, course
  matching); rollback on a corrupt entry (the library is unchanged, `.incoming` removed);
  deadlines rescheduled; a newer-format backup refused.

**Done when:** a full backup made on one phone restores on a fresh install on another phone
with every course, document, annotation, bookmark, submission and deadline, and a course zip
from a classmate adds its documents under a matching course without touching the rest.

### B5 · Backup reminders and automatic backups to a folder *(S)*
Status: done (commit 956c5d5)

As built:
- `backup/schedule.ts` (pure): `backupReminderDue`, `autoBackupDue`, `rotateAutoBackups`.
  "The library has changed" means `libraryRepo.libraryChangedAt`, the newest
  `documents.updated_at` or `courses.created_at`. Since `updated_at` also moves when the Reader
  saves the page it's on, reading counts as a change. An automatic backup is skipped when
  nothing changed since the last one.
- **Home card:** `store/useBackupReminder.ts`, a one-line card on top of Home with "Later" and
  "Back up". "Back up" goes through `ui/REQUEST_EXPORT` to `components/backup/ExportHost.tsx`
  (always mounted), which runs B3's dialog.
- **Semester hint:** archiving a semester with documents shows "Spring 2026 archived. Back it
  up before you forget?" with "Back up", which exports that semester's courses. Without
  documents it shows the plain "archived" snack.
- **Automatic backups:** `backup/autoBackup.runAutoBackup` + `store/useAutoBackup.ts` (after
  boot, Android, once per launch). They only start while no scan session is open; one already
  running isn't stopped by a new scan. The chip is `components/backup/AutoBackupChip.tsx`
  (`ui.autoBackupProgress`). Files are named `PDF Scan auto-backup YYYY-MM-DD.zip`.
- **Rotation:** only deletes URIs the app recorded (`settings.autoBackupUris`, from
  `saveFileToFolder`'s return value). Choosing another folder clears that list. An automatic
  backup also sets `lastBackupAt`.
- **One backup at a time:** `createBackup` throws `BackupBusyError` if a backup is already
  running. The automatic one then just stops, since the manual backup does the same job.
- **Wi-Fi rule:** as planned, just "not while scanning or saving" (no cloud-folder detection).
  **iOS:** the reminder only; B3's Backup screen already has the iCloud note.

- **Reminder:** when the library has changed and the last backup is more than 30 days old (or
  there was never one and the library has 20+ documents), Home shows a one-line card: "Last
  backup: never. Back up now?" with "Back up" and "Later" (snoozes 14 days). Also a quiet hint
  after archiving a semester: "Back up Spring 2026 before you forget?"
- **Automatic backup (Android):** in Settings → Backup, "Back up automatically to a folder"
  (weekly or monthly) to the SAF folder the student chose (it can be a Google Drive or SD-card
  folder). Runs when the app opens and the backup is due, in the background with a small
  progress chip, only on Wi-Fi if the folder belongs to a cloud provider (can't be detected
  reliably, so the rule is simply "not while saving or scanning"). Keeps the last 2 automatic
  backups in that folder (deletes older ones it made itself; never other files).
- iOS: the reminder only; iOS already includes the app's documents in iCloud device backups,
  and Settings says so.
- Tests: reminder conditions and snooze; rotation keeps 2 and only deletes its own files; due
  dates.

**Done when:** a student who never backed up is reminded once the library matters, and an
Android student with automatic backups always has a recent zip in their chosen folder.

### B6 · Google Drive backup *(L — later, Pro, phase P3)*
Status: later

Outline only, so B2–B5 leave the right gaps:
- Sign-in with `expo-auth-session` (no Google SDK), scope **`drive.appdata`** only (the app's
  hidden folder in the student's own Drive; it can't see other files). Needs a Google Cloud
  project and OAuth consent screen; record the client ids in EAS secrets.
- Incremental, not a whole zip each time: upload `library.json` snapshots plus each document's
  files, named by document id and `updated_at`; only changed documents are uploaded. Restore
  reads the latest snapshot and downloads the files it needs, then runs B4's commit step.
- Only on Wi-Fi by default, resumable uploads, and a clear "Connected as name@gmail.com ·
  Disconnect" in Settings. The privacy promise stays true: data goes only to the student's own
  account.

---

## Order and dependencies
B1 (it gives B3/B4 the space checks and the integrity repair), then B2, then B3, then B4, then
B5. B6 waits for §10 Pro.

## Critical files
- `src/services/storage/{integrity,usage}.ts` (new), `plugins/withBackupRules.js` (new), `app.json`
- `src/services/backup/{zip/crc32,zip/zipWriter,zip/zipReader,format,createBackup,restoreBackup}.ts` (new)
- `src/services/persistence/{migrations,libraryRepo,libraryFiles,dbService}.ts`,
  `src/services/export/deviceExportService.ts`, `src/services/sharing/shareService.ts`,
  `src/services/submit/deadlines.ts`
- `src/screens/SettingsScreen.tsx` plus new Storage and Backup screens, `src/screens/{HomeScreen,CourseScreen,LibraryScreen}.tsx`
- `src/i18n/en.ts` (all new UI text goes through the catalog; see AGENTS.md)

## Verification (for the whole of §8)
1. `npm run typecheck && npm test` pass in CI.
2. On an Android device (dev build):
   - Settings → Storage shows space per course; "Clear" frees cache space;
   - back up a library of about 500 pages; open the zip on a computer and find the PDFs by
     course;
   - uninstall, reinstall, restore: everything is back, including annotations, bookmarks,
     submissions, and deadline reminders;
   - export one course, import it on a second phone with Add: it lands in a matching course;
   - fill the phone until under 300 MB is free: the warning appears before a scan;
   - turn on automatic backups to a Drive folder; after the due date, a new zip appears there.
3. iOS: backup and restore through the share sheet and the Files app.
