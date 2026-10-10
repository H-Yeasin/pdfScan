import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { tDoc } from '../../i18n';
import { createId } from '../../utils/id';
import { sanitizeFileName } from '../../utils/sanitize';
import { fromStoredPath } from '../persistence/libraryFiles';

// §8 B2: what goes into a backup zip and how it comes back out.
//
//   manifest.json   what this is (format, versions, kind, counts) and where each document's
//                   readable file is
//   library.json    every row the backup covers, as plain JSON, file paths rewritten to zip paths
//   Courses/<course>/<document>.pdf, Unsorted/<document>.pdf
//                   each document's PDF (or Office original) once, under names a person can find
//   data/<docId>/…  everything else in the document's folder: masters, thumbnails, display copies,
//                   submissions
//
// Rows, not the database file: the importer maps them into whatever schema the app has by then,
// and the database rebuilds its own state (the FTS index, user_version).

export const BACKUP_FORMAT = 'pdfscan-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MANIFEST_ENTRY = 'manifest.json';
export const LIBRARY_ENTRY = 'library.json';
// Full backups only (§8 B3): the student's settings and the saved signature (signature/…).
export const SETTINGS_ENTRY = 'settings.json';

// Parents before children: the order rows are inserted in.
export const TABLES = [
  'semesters',
  'courses',
  'documents',
  'pages',
  'timetable_slots',
  'submissions',
  'deadlines',
  'annotations',
  'bookmarks',
] as const;
export type TableName = (typeof TABLES)[number];
export type Row = Record<string, string | number | null>;
export type Tables = Record<TableName, Row[]>;

// Columns holding a path relative to the document directory (libraryFiles.toStoredPath).
const PATH_COLUMNS: Partial<Record<TableName, string[]>> = {
  documents: ['pdf_path', 'content_path'],
  pages: ['master_path', 'display_path', 'thumb_path'],
};

export type BackupKind = 'full' | 'course' | 'documents';
export type BackupScope = { kind: 'all' } | { kind: 'courses'; courseIds: string[] } | { kind: 'documents'; documentIds: string[] };

// A document's readable copy in the zip, and the file name it had in its folder.
export type ReadableFile = { path: string; original: string };

export type Manifest = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: number;
  kind: BackupKind;
  // 'pdfs': only the readable files and the rows (B3's "PDFs only"); restores as imported PDFs.
  restorable: 'full' | 'pdfs';
  counts: { courses: number; documents: number; pages: number; bytes: number };
  readable: Record<string, ReadableFile>;
};

export type LibraryJson = { formatVersion: number; schemaVersion: number; tables: Tables };

export type BackupFile = { zipPath: string; uri: string; bytes: number; documentId: string };

export type ExportedLibrary = {
  libraryJson: LibraryJson;
  readable: Record<string, ReadableFile>;
  // Every file to copy into the zip, readable ones included, in document order.
  files: BackupFile[];
  counts: Manifest['counts'];
};

export type BackupFormatErrorCode = 'NOT_A_BACKUP' | 'TOO_NEW';

export class BackupFormatError extends Error {
  constructor(
    readonly code: BackupFormatErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

function emptyTables(): Tables {
  return Object.fromEntries(TABLES.map((table) => [table, []])) as unknown as Tables;
}

// ---------------------------------------------------------------------------------------------
// Export

async function selectWhere(db: SQLiteDatabase, table: TableName, column: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  // json_each takes the whole list as one parameter, however long it is.
  return db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE ${column} IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
}

const idsOf = (rows: Row[], column = 'id') => [...new Set(rows.map((row) => row[column]).filter((v): v is string => typeof v === 'string'))];

async function selectScope(db: SQLiteDatabase, scope: BackupScope): Promise<Tables> {
  const tables = emptyTables();
  if (scope.kind === 'all') {
    for (const table of TABLES) tables[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
    return tables;
  }
  if (scope.kind === 'courses') {
    tables.courses = await selectWhere(db, 'courses', 'id', scope.courseIds);
    tables.documents = await selectWhere(db, 'documents', 'course_id', idsOf(tables.courses));
    tables.timetable_slots = await selectWhere(db, 'timetable_slots', 'course_id', idsOf(tables.courses));
    tables.deadlines = await selectWhere(db, 'deadlines', 'course_id', idsOf(tables.courses));
  } else {
    // Chosen documents bring their courses along (so Add can match or create them), but not the
    // courses' timetables or deadlines.
    tables.documents = await selectWhere(db, 'documents', 'id', scope.documentIds);
    tables.courses = await selectWhere(db, 'courses', 'id', idsOf(tables.documents, 'course_id'));
  }
  tables.semesters = await selectWhere(db, 'semesters', 'id', idsOf(tables.courses, 'semester_id'));
  const documentIds = idsOf(tables.documents);
  for (const table of ['pages', 'submissions', 'annotations', 'bookmarks'] as const) {
    tables[table] = await selectWhere(db, table, 'document_id', documentIds);
  }
  return tables;
}

// "Name", "Name (2)", "Name (3)"… unique within one folder, ignoring case (laptops' file systems
// often do).
function uniqueName(base: string, extension: string, used: Set<string>): string {
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}${extension}` : `${base} (${n})${extension}`;
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
  }
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

// Readable paths for each document with a PDF (or, for Office files, the original): one folder
// per course under Courses/, the rest under Unsorted/. Oldest first, so the first of two
// same-named documents keeps the plain name.
function readablePaths(tables: Tables): Record<string, ReadableFile & { stored: string }> {
  const courseFolder = new Map<string, string>();
  const usedCourseFolders = new Set<string>();
  for (const course of [...tables.courses].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))) {
    const name = sanitizeFileName(String(course.name ?? '')) || tDoc('document.backupUntitled');
    courseFolder.set(String(course.id), `${tDoc('document.backupCourses')}/${uniqueName(name, '', usedCourseFolders)}`);
  }

  const usedPerFolder = new Map<string, Set<string>>();
  const out: Record<string, ReadableFile & { stored: string }> = {};
  for (const doc of [...tables.documents].sort((a, b) => Number(a.created_at) - Number(b.created_at))) {
    const stored = (doc.pdf_path || doc.content_path) as string | null;
    if (!stored || !new File(fromStoredPath(stored)!).exists) continue;
    const folder = (doc.course_id && courseFolder.get(String(doc.course_id))) || tDoc('document.backupUnsorted');
    const used = usedPerFolder.get(folder) ?? new Set<string>();
    usedPerFolder.set(folder, used);
    const name = sanitizeFileName(String(doc.name ?? '')) || tDoc('document.backupUntitled');
    const extension = doc.pdf_path ? '.pdf' : extensionOf(stored);
    out[String(doc.id)] = { path: `${folder}/${uniqueName(name, extension, used)}`, original: basename(stored), stored };
  }
  return out;
}

// Where a stored path goes in the zip: the readable copy, data/<docId>/<path in its folder>, or
// - for a file that somehow lives outside the folder - data/<docId>/external/<name>.
function zipPathFor(stored: string, docId: string, readable: (ReadableFile & { stored: string }) | undefined): string {
  if (readable && stored === readable.stored) return readable.path;
  const prefix = `library/${docId}/`;
  if (stored.startsWith(prefix)) return `data/${docId}/${stored.slice(prefix.length)}`;
  return `data/${docId}/external/${basename(stored)}`;
}

function listFilesRecursive(dir: Directory, prefix = ''): { rel: string; file: File }[] {
  if (!dir.exists) return [];
  const out: { rel: string; file: File }[] = [];
  for (const entry of dir.list()) {
    if (entry instanceof Directory) out.push(...listFilesRecursive(entry, `${prefix}${entry.name}/`));
    else out.push({ rel: `${prefix}${entry.name}`, file: entry });
  }
  return out;
}

// The rows of every table in `scope`, with file paths rewritten to zip paths, and the files to
// copy (everything in each document's folder, so submissions and anything added later come too).
// Device-specific values are dropped: the folder-size cache and deadline notification ids
// (restore schedules new ones).
export async function exportRows(db: SQLiteDatabase, scope: BackupScope, schemaVersion: number): Promise<ExportedLibrary> {
  const tables = await selectScope(db, scope);
  const readable = readablePaths(tables);
  const files: BackupFile[] = [];

  const pagesByDoc = new Map<string, Row[]>();
  for (const page of tables.pages) {
    const list = pagesByDoc.get(String(page.document_id)) ?? [];
    list.push(page);
    pagesByDoc.set(String(page.document_id), list);
  }

  for (const doc of tables.documents) {
    const docId = String(doc.id);
    const docReadable = readable[docId];
    const seen = new Set<string>();
    const add = (stored: string, file: File) => {
      const zipPath = zipPathFor(stored, docId, docReadable);
      if (seen.has(zipPath) || !file.exists) return;
      seen.add(zipPath);
      files.push({ zipPath, uri: file.uri, bytes: file.size ?? 0, documentId: docId });
    };
    // The readable copy first, then the folder.
    if (docReadable) add(docReadable.stored, new File(fromStoredPath(docReadable.stored)!));
    for (const { rel, file } of listFilesRecursive(new Directory(Paths.document, 'library', docId))) add(`library/${docId}/${rel}`, file);

    const rewrite = (row: Row, columns: string[]) => {
      for (const column of columns) {
        const stored = row[column];
        if (typeof stored !== 'string' || stored === '') continue;
        // A path outside the folder wasn't picked up by the listing above.
        add(stored, new File(fromStoredPath(stored)!));
        row[column] = zipPathFor(stored, docId, docReadable);
      }
    };
    rewrite(doc, PATH_COLUMNS.documents!);
    doc.disk_bytes = null;
    // §16 G4: "its PDF couldn't be read" is about the file on this phone; the copy that comes out
    // of the backup gets its own try.
    doc.pdf_info_failed = 0;
    for (const page of pagesByDoc.get(docId) ?? []) rewrite(page, PATH_COLUMNS.pages!);
  }
  for (const deadline of tables.deadlines) deadline.reminder_ids = '[]';

  return {
    libraryJson: { formatVersion: BACKUP_FORMAT_VERSION, schemaVersion, tables },
    readable: Object.fromEntries(Object.entries(readable).map(([id, { path, original }]) => [id, { path, original }])),
    files,
    counts: {
      courses: tables.courses.length,
      documents: tables.documents.length,
      pages: tables.pages.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    },
  };
}

export function buildManifest(
  exported: ExportedLibrary,
  info: { kind: BackupKind; appVersion: string; createdAt: number; restorable?: Manifest['restorable'] }
): Manifest {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: info.appVersion,
    schemaVersion: exported.libraryJson.schemaVersion,
    createdAt: info.createdAt,
    kind: info.kind,
    restorable: info.restorable ?? 'full',
    counts: exported.counts,
    readable: exported.readable,
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a backup back

// Checks that manifest.json is a PDF Scan backup this app can read.
export function parseManifest(value: unknown): Manifest {
  const manifest = value as Partial<Manifest> | null;
  if (!manifest || manifest.format !== BACKUP_FORMAT || typeof manifest.formatVersion !== 'number') {
    throw new BackupFormatError('NOT_A_BACKUP', 'Not a PDF Scan backup');
  }
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError('TOO_NEW', 'This backup was made by a newer version of PDF Scan');
  }
  return { ...manifest, readable: manifest.readable ?? {} } as Manifest;
}

// One step per format version: UPGRADES[n] turns a version-n library.json into version n+1.
// None yet; the first format change adds UPGRADES[1].
export type LibraryJsonUpgrade = (json: LibraryJson) => LibraryJson;
const UPGRADES: Record<number, LibraryJsonUpgrade> = {};

// Brings an older library.json up to this app's format, one version at a time. A newer one is
// refused (TOO_NEW: "Update PDF Scan to restore this backup").
export function upgradeLibraryJson(
  value: unknown,
  upgrades: Record<number, LibraryJsonUpgrade> = UPGRADES,
  target = BACKUP_FORMAT_VERSION
): LibraryJson {
  const given = value as LibraryJson | null;
  if (!given || typeof given.formatVersion !== 'number' || typeof given.tables !== 'object' || given.tables === null) {
    throw new BackupFormatError('NOT_A_BACKUP', 'library.json is missing or damaged');
  }
  if (given.formatVersion > target) throw new BackupFormatError('TOO_NEW', 'This backup was made by a newer version of PDF Scan');
  let json: LibraryJson = given;
  while (json.formatVersion < target) {
    const upgrade: LibraryJsonUpgrade | undefined = upgrades[json.formatVersion];
    if (!upgrade) throw new BackupFormatError('NOT_A_BACKUP', `No upgrade from backup format ${json.formatVersion}`);
    json = upgrade(json);
  }
  return { ...json, tables: { ...emptyTables(), ...json.tables } };
}

// ---------------------------------------------------------------------------------------------
// Import planning

// What's already on this phone, as importPlan needs it.
export type CurrentLibrary = {
  // id -> updated_at
  documents: Map<string, number>;
  courses: { id: string; name: string; code: string | null; sortOrder: number }[];
  semesters: { id: string; name: string }[];
  ids: Record<TableName, Set<string>>;
};

export async function loadCurrentLibrary(db: SQLiteDatabase): Promise<CurrentLibrary> {
  const ids = {} as Record<TableName, Set<string>>;
  for (const table of TABLES) ids[table] = new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`)).map((r) => r.id));
  const documents = await db.getAllAsync<{ id: string; updated_at: number }>('SELECT id, updated_at FROM documents');
  const courses = await db.getAllAsync<{ id: string; name: string; code: string | null; sort_order: number }>(
    'SELECT id, name, code, sort_order FROM courses'
  );
  return {
    documents: new Map(documents.map((d) => [d.id, d.updated_at])),
    courses: courses.map((c) => ({ id: c.id, name: c.name, code: c.code, sortOrder: c.sort_order })),
    semesters: await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM semesters'),
    ids,
  };
}

// Restore: a backup of this student's own library; ids are kept, so restoring twice adds nothing.
// Add: someone else's course or documents; everything gets new ids and joins a matching course.
export type ImportMode = 'restore' | 'add';

export type DocumentDecision = {
  sourceId: string;
  targetId: string;
  // insert: new here. skip: already here, unchanged. keepBoth: here but different - the backup's
  // copy comes in next to it under a new id, named "… (restored)".
  action: 'insert' | 'skip' | 'keepBoth';
  name: string;
};

export type CourseDecision = {
  sourceId: string;
  targetId: string;
  // match: Add mode found the same course here (by name and code) and uses it.
  action: 'insert' | 'skip' | 'match';
};

export type ImportPlan = {
  mode: ImportMode;
  documents: DocumentDecision[];
  courses: CourseDecision[];
  // The rows to insert, ids and paths already mapped to this phone (paths: library/<targetId>/…).
  tables: Tables;
  counts: { insert: number; skip: number; keepBoth: number };
};

export type ImportPlanOptions = {
  newId?: (prefix: string) => string;
  restoredSuffix?: string;
};

const ID_PREFIX: Record<TableName, string> = {
  semesters: 'semester',
  courses: 'course',
  documents: 'doc',
  pages: 'page',
  timetable_slots: 'slot',
  submissions: 'sub',
  deadlines: 'deadline',
  annotations: 'annot',
  bookmarks: 'bookmark',
};

const normalize = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

// A zip path in a row -> where that file will be on this phone. Unknown paths are kept as they are.
function storedPathFor(value: Row[string], sourceId: string, targetId: string, readable: ReadableFile | undefined): Row[string] {
  if (typeof value !== 'string' || value === '') return value;
  if (readable && value === readable.path) return `library/${targetId}/${readable.original}`;
  const prefix = `data/${sourceId}/`;
  return value.startsWith(prefix) ? `library/${targetId}/${value.slice(prefix.length)}` : value;
}

// Decides, per row, what an import does - without touching the database or any file, so every
// case can be tested on its own. The result is applied by insertRows (rows) and
// targetPathForEntry (files).
export function importPlan(
  manifest: Pick<Manifest, 'readable'>,
  json: LibraryJson,
  current: CurrentLibrary,
  mode: ImportMode,
  options: ImportPlanOptions = {}
): ImportPlan {
  const newId = options.newId ?? createId;
  const suffix = options.restoredSuffix ?? tDoc('document.restoredSuffix');
  const src = json.tables;
  const out = emptyTables();
  const maps = Object.fromEntries(TABLES.map((t) => [t, new Map<string, string>()])) as Record<TableName, Map<string, string>>;
  const used = Object.fromEntries(TABLES.map((t) => [t, new Set<string>()])) as Record<TableName, Set<string>>;

  // Keeps a row's id when it's free here (Restore), else gives it a new one.
  const claim = (table: TableName, id: string, keep: boolean): string => {
    const target = keep && !current.ids[table].has(id) && !used[table].has(id) ? id : newId(ID_PREFIX[table]);
    used[table].add(target);
    maps[table].set(id, target);
    return target;
  };
  // A reference to a parent row: its new id, else the same id if this phone has it, else null.
  const ref = (table: TableName, id: Row[string]): string | null => {
    if (typeof id !== 'string') return null;
    return maps[table].get(id) ?? (current.ids[table].has(id) ? id : null);
  };

  // Semesters and courses.
  const courseDecisions: CourseDecision[] = [];
  const insertedCourses = new Set<string>();
  if (mode === 'restore') {
    for (const row of src.semesters) {
      const id = String(row.id);
      if (current.ids.semesters.has(id)) maps.semesters.set(id, id);
      else out.semesters.push({ ...row, id: claim('semesters', id, true) });
    }
    for (const row of src.courses) {
      const id = String(row.id);
      if (current.ids.courses.has(id)) {
        maps.courses.set(id, id);
        courseDecisions.push({ sourceId: id, targetId: id, action: 'skip' });
      } else {
        const targetId = claim('courses', id, true);
        out.courses.push({ ...row, id: targetId, semester_id: ref('semesters', row.semester_id) });
        insertedCourses.add(targetId);
        courseDecisions.push({ sourceId: id, targetId, action: 'insert' });
      }
    }
  } else {
    let nextSortOrder = Math.max(-1, ...current.courses.map((c) => c.sortOrder)) + 1;
    const semesterById = new Map(src.semesters.map((s) => [String(s.id), s]));
    for (const row of src.courses) {
      const id = String(row.id);
      const match = current.courses.find((c) => normalize(c.name) === normalize(row.name) && normalize(c.code) === normalize(row.code));
      if (match) {
        maps.courses.set(id, match.id);
        courseDecisions.push({ sourceId: id, targetId: match.id, action: 'match' });
        continue;
      }
      // A new course: its semester is matched by name, or comes along too.
      let semesterId: string | null = null;
      const semester = typeof row.semester_id === 'string' ? semesterById.get(row.semester_id) : undefined;
      if (semester) {
        const sourceSemesterId = String(semester.id);
        semesterId =
          maps.semesters.get(sourceSemesterId) ??
          current.semesters.find((s) => normalize(s.name) === normalize(semester.name))?.id ??
          null;
        if (!semesterId) {
          semesterId = claim('semesters', sourceSemesterId, false);
          out.semesters.push({ ...semester, id: semesterId });
        }
        maps.semesters.set(sourceSemesterId, semesterId);
      }
      const targetId = claim('courses', id, false);
      out.courses.push({ ...row, id: targetId, semester_id: semesterId, sort_order: nextSortOrder++ });
      insertedCourses.add(targetId);
      courseDecisions.push({ sourceId: id, targetId, action: 'insert' });
    }
  }

  // Documents.
  const documentDecisions: DocumentDecision[] = [];
  for (const row of src.documents) {
    const id = String(row.id);
    const name = String(row.name ?? '');
    let decision: DocumentDecision;
    if (mode === 'add') {
      decision = { sourceId: id, targetId: claim('documents', id, false), action: 'insert', name };
    } else if (!current.documents.has(id)) {
      decision = { sourceId: id, targetId: claim('documents', id, true), action: 'insert', name };
    } else if (current.documents.get(id) === row.updated_at) {
      decision = { sourceId: id, targetId: id, action: 'skip', name };
    } else {
      decision = { sourceId: id, targetId: claim('documents', id, false), action: 'keepBoth', name: `${name}${suffix}` };
    }
    documentDecisions.push(decision);
    if (decision.action === 'skip') continue;
    const readable = manifest.readable[id];
    out.documents.push({
      ...row,
      id: decision.targetId,
      name: decision.name,
      course_id: ref('courses', row.course_id),
      pdf_path: storedPathFor(row.pdf_path, id, decision.targetId, readable),
      content_path: storedPathFor(row.content_path, id, decision.targetId, readable),
      disk_bytes: null,
    });
  }
  const decisionBySource = new Map(documentDecisions.map((d) => [d.sourceId, d]));
  // A child row of a document that comes in: its decision; undefined when the document is skipped.
  const incoming = (documentId: Row[string]) => {
    const decision = typeof documentId === 'string' ? decisionBySource.get(documentId) : undefined;
    return decision && decision.action !== 'skip' ? decision : undefined;
  };
  // Restore keeps the ids of an inserted document's rows; Add and "keep both" give new ones.
  const keepIds = (decision: DocumentDecision) => mode === 'restore' && decision.action === 'insert';

  for (const row of src.pages) {
    const decision = incoming(row.document_id);
    if (!decision) continue;
    const readable = manifest.readable[decision.sourceId];
    const page: Row = { ...row, id: claim('pages', String(row.id), keepIds(decision)), document_id: decision.targetId };
    for (const column of PATH_COLUMNS.pages!) page[column] = storedPathFor(row[column], decision.sourceId, decision.targetId, readable);
    out.pages.push(page);
  }

  // Submissions are the student's own history: restored, never added from someone else.
  if (mode === 'restore') {
    for (const row of src.submissions) {
      const decision = incoming(row.document_id);
      if (!decision) continue;
      out.submissions.push({
        ...row,
        id: claim('submissions', String(row.id), keepIds(decision)),
        document_id: decision.targetId,
        course_id: ref('courses', row.course_id),
      });
    }
  }

  for (const table of ['annotations', 'bookmarks'] as const) {
    for (const row of src[table]) {
      const decision = incoming(row.document_id);
      const pageId = typeof row.page_id === 'string' ? maps.pages.get(row.page_id) : undefined;
      if (!decision || !pageId) continue;
      out[table].push({ ...row, id: claim(table, String(row.id), keepIds(decision)), document_id: decision.targetId, page_id: pageId });
    }
  }

  // Course rows: Restore brings back the ones not here yet; Add brings a new course's deadlines
  // (not its timetable, which is the sharer's own).
  for (const row of src.deadlines) {
    const courseId = ref('courses', row.course_id);
    if (!courseId) continue;
    if (mode === 'restore') {
      if (current.ids.deadlines.has(String(row.id))) continue;
      out.deadlines.push({
        ...row,
        id: claim('deadlines', String(row.id), true),
        course_id: courseId,
        done_submission_id: ref('submissions', row.done_submission_id),
      });
    } else if (insertedCourses.has(courseId)) {
      out.deadlines.push({ ...row, id: claim('deadlines', String(row.id), false), course_id: courseId, done_submission_id: null });
    }
  }
  if (mode === 'restore') {
    for (const row of src.timetable_slots) {
      const courseId = ref('courses', row.course_id);
      if (!courseId || current.ids.timetable_slots.has(String(row.id))) continue;
      out.timetable_slots.push({ ...row, id: claim('timetable_slots', String(row.id), true), course_id: courseId });
    }
  }

  return {
    mode,
    documents: documentDecisions,
    courses: courseDecisions,
    tables: out,
    counts: {
      insert: documentDecisions.filter((d) => d.action === 'insert').length,
      skip: documentDecisions.filter((d) => d.action === 'skip').length,
      keepBoth: documentDecisions.filter((d) => d.action === 'keepBoth').length,
    },
  };
}

// Where a zip entry goes on this phone (relative to the document directory), or null when it
// isn't a document file or its document isn't coming in. Paths that try to leave their folder
// ("..") are refused.
export function targetPathForEntry(plan: ImportPlan, manifest: Pick<Manifest, 'readable'>, entryName: string): string | null {
  for (const decision of plan.documents) {
    if (decision.action === 'skip') continue;
    const readable = manifest.readable[decision.sourceId];
    if (readable && entryName === readable.path) return safeJoin(decision.targetId, readable.original);
    const prefix = `data/${decision.sourceId}/`;
    if (entryName.startsWith(prefix)) return safeJoin(decision.targetId, entryName.slice(prefix.length));
  }
  return null;
}

function safeJoin(documentId: string, rel: string): string | null {
  const parts = rel.split('/');
  if (rel === '' || parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return `library/${documentId}/${rel}`;
}

// Inserts a plan's rows, parents first, using only the columns this schema has (a backup from an
// older app may lack newer columns, which then take their defaults). Run it inside the caller's
// transaction (B4), so a failure leaves the library as it was.
export async function insertRows(db: SQLiteDatabase, tables: Tables): Promise<void> {
  for (const table of TABLES) {
    if (tables[table].length === 0) continue;
    const columns = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name));
    for (const row of tables[table]) {
      const keys = Object.keys(row).filter((key) => columns.has(key));
      await db.runAsync(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
        keys.map((key) => row[key])
      );
    }
  }
}
