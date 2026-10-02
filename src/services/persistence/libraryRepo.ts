import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Annotation,
  Bookmark,
  Course,
  Deadline,
  DocFormat,
  DocType,
  CaptureMode,
  IndexState,
  PageRotation,
  LibraryDocument,
  LibraryPage,
  PageOcr,
  Semester,
  Submission,
  TimetableSlot,
} from '../../types/models';
import { COURSE_COLORS, isCourseColor } from '../courses/palette';
import { parseOcrScript } from '../scripts/registry';
import { parseSubmitPreset, serializeSubmitPreset } from '../submit/preset';
import { buildSearchHaystack } from '../search/searchService';
import { fromStoredPath, toStoredPath } from './libraryFiles';

// Row shapes exactly as stored (see migrations.ts). Paths are relative to the document directory;
// libraryFiles.ts's toStoredPath/fromStoredPath convert at this boundary only.
type DocumentRow = {
  id: string;
  name: string;
  format: string;
  mode: string;
  pdf_path: string | null;
  content_path: string | null;
  size_bytes: number;
  created_at: number;
  updated_at: number;
  star: number;
  tag: string | null;
  locked: number;
  cover_kind: string | null;
  source_kind: string | null;
  course_id: string | null;
  doc_type: string | null;
  archived: number;
  pdf_layout: string | null;
  pdf_page_size: string | null;
  indexed_at: number | null;
  index_state: string | null;
  last_page: number | null;
  missing_files: number;
  disk_bytes: number | null;
};

type PageRow = {
  id: string;
  document_id: string;
  idx: number;
  master_path: string;
  display_path: string | null;
  thumb_path: string | null;
  width: number;
  height: number;
  ocr_text: string | null;
  ocr_json: string | null;
  ocr_failed: number;
  layout: string | null;
  text_source: string | null;
  rotation: number;
};

type CourseRow = {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  emoji: string | null;
  teacher: string | null;
  semester_id: string | null;
  archived: number;
  sort_order: number;
  created_at: number;
  submit_preset: string | null;
  ocr_script: string | null;
};

type SemesterRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  archived: number;
  created_at: number;
};

type SlotRow = { id: string; course_id: string; weekday: number; start_min: number; end_min: number };

type BookmarkRow = { id: string; document_id: string; page_id: string; label: string | null; created_at: number };

type AnnotationRow = {
  id: string;
  document_id: string;
  page_id: string;
  kind: string;
  color: string;
  data: string;
  text: string | null;
  created_at: number;
  updated_at: number;
};

type DeadlineRow = {
  id: string;
  course_id: string;
  title: string;
  due_at: number;
  doc_type: string | null;
  reminder_ids: string;
  done_submission_id: string | null;
  created_at: number;
};

type SubmissionRow = {
  id: string;
  document_id: string;
  course_id: string | null;
  file_name: string;
  size_bytes: number;
  size_limit_bytes: number | null;
  page_count: number;
  created_at: number;
  preset: string | null;
  type_number: number | null;
};

export type LoadedLibrary = {
  documents: LibraryDocument[];
  courses: Course[];
  semesters: Semester[];
  timetable: TimetableSlot[];
  // §4 S7, newest first. Optional so callers that predate it (the legacy import, tests) needn't
  // pass it; missing means "none".
  submissions?: Submission[];
  // §4 S8, by due date. Optional for the same reason.
  deadlines?: Deadline[];
  // §5 T4. Optional for the same reason.
  annotations?: Annotation[];
  // §5 T5, oldest first. Optional for the same reason.
  bookmarks?: Bookmark[];
};

const DOC_TYPES: readonly DocType[] = ['assignment', 'notes', 'handout', 'exam', 'lab', 'other'];

function toDocType(value: string | null): DocType | undefined {
  return DOC_TYPES.includes(value as DocType) ? (value as DocType) : undefined;
}

function parseOcr(text: string | null, json: string | null): PageOcr | undefined {
  if (json) {
    try {
      return JSON.parse(json) as PageOcr;
    } catch {
      // A corrupt blob loses box positions, not the text - fall through to text-only.
    }
  }
  return text === null ? undefined : { text, blocks: [] };
}

function rowToPage(row: PageRow): LibraryPage {
  return {
    id: row.id,
    fileUri: fromStoredPath(row.master_path) ?? '',
    displayUri: fromStoredPath(row.display_path),
    thumbUri: fromStoredPath(row.thumb_path),
    width: row.width,
    height: row.height,
    ocr: parseOcr(row.ocr_text, row.ocr_json),
    ocrFailed: row.ocr_failed ? true : undefined,
    layout: row.layout === 'fullPage' ? 'fullPage' : undefined,
    textSource: row.text_source === 'pdf' || row.text_source === 'ocr' ? row.text_source : undefined,
    rotation: toRotation(row.rotation),
  };
}

// 0 (or anything that isn't a quarter turn) reads as undefined, like every page saved before R3.
function toRotation(value: number): PageRotation | undefined {
  return value === 90 || value === 180 || value === 270 ? value : undefined;
}

const INDEX_STATES: readonly IndexState[] = ['done', 'partial', 'encrypted', 'failed'];

function rowToCourse(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? undefined,
    // Migration v3 and every write give a course a palette id; this only guards a hand-edited or
    // future-palette value from crashing the theme lookup.
    color: isCourseColor(row.color) ? row.color : COURSE_COLORS[row.sort_order % COURSE_COLORS.length],
    emoji: row.emoji ?? undefined,
    teacher: row.teacher ?? undefined,
    semesterId: row.semester_id ?? undefined,
    archived: !!row.archived,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    submitPreset: parseSubmitPreset(row.submit_preset),
    ocrScript: parseOcrScript(row.ocr_script),
  };
}

function rowToSemester(row: SemesterRow): Semester {
  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

// Newest first, matching the order the reducer keeps (ADD_FILE prepends).
export async function loadAll(db: SQLiteDatabase): Promise<LoadedLibrary> {
  const docRows = await db.getAllAsync<DocumentRow>('SELECT * FROM documents ORDER BY created_at DESC, id');
  const pageRows = await db.getAllAsync<PageRow>('SELECT * FROM pages ORDER BY document_id, idx');
  const courseRows = await db.getAllAsync<CourseRow>('SELECT * FROM courses ORDER BY sort_order, created_at, id');
  const semesterRows = await db.getAllAsync<SemesterRow>('SELECT * FROM semesters ORDER BY starts_on DESC, created_at DESC, id');
  const slotRows = await db.getAllAsync<SlotRow>('SELECT * FROM timetable_slots ORDER BY weekday, start_min, id');
  const submissionRows = await db.getAllAsync<SubmissionRow>(SUBMISSIONS_QUERY);
  const deadlineRows = await db.getAllAsync<DeadlineRow>('SELECT * FROM deadlines ORDER BY due_at, id');
  const annotationRows = await db.getAllAsync<AnnotationRow>('SELECT * FROM annotations ORDER BY created_at, id');
  const bookmarkRows = await db.getAllAsync<BookmarkRow>('SELECT * FROM bookmarks ORDER BY created_at, id');

  const pagesByDoc = new Map<string, LibraryPage[]>();
  for (const row of pageRows) {
    const list = pagesByDoc.get(row.document_id) ?? [];
    list.push(rowToPage(row));
    pagesByDoc.set(row.document_id, list);
  }

  const documents = docRows.map((row): LibraryDocument => {
    const pages = pagesByDoc.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      format: row.format as DocFormat,
      mode: row.mode as CaptureMode,
      pages,
      pdfUri: fromStoredPath(row.pdf_path),
      contentUri: fromStoredPath(row.content_path),
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      star: !!row.star,
      tag: row.tag ?? undefined,
      locked: !!row.locked,
      searchHaystack: buildSearchHaystack(row.name, pages),
      courseId: row.course_id ?? undefined,
      docType: toDocType(row.doc_type),
      coverKind: (row.cover_kind ?? undefined) as LibraryDocument['coverKind'],
      sourceKind: (row.source_kind ?? undefined) as LibraryDocument['sourceKind'],
      archived: row.archived ? true : undefined,
      pdfLayout: row.pdf_layout === '2_in_1' || row.pdf_layout === 'standard' ? row.pdf_layout : undefined,
      pdfPageSize: row.pdf_page_size === 'Letter' || row.pdf_page_size === 'A4' ? row.pdf_page_size : undefined,
      indexedAt: row.indexed_at ?? undefined,
      indexState: INDEX_STATES.includes(row.index_state as IndexState) ? (row.index_state as IndexState) : undefined,
      lastPage: row.last_page && row.last_page > 0 ? row.last_page : undefined,
      missingFiles: row.missing_files ? true : undefined,
    };
  });

  return {
    documents,
    courses: courseRows.map(rowToCourse),
    semesters: semesterRows.map(rowToSemester),
    timetable: slotRows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      weekday: row.weekday,
      startMin: row.start_min,
      endMin: row.end_min,
    })),
    submissions: submissionRows.map(rowToSubmission),
    deadlines: deadlineRows.map(rowToDeadline),
    annotations: annotationRows.map(rowToAnnotation).filter((a): a is Annotation => a !== null),
    bookmarks: bookmarkRows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      pageId: row.page_id,
      label: row.label ?? undefined,
      createdAt: row.created_at,
    })),
  };
}

async function writeBookmark(db: SQLiteDatabase, b: Bookmark): Promise<void> {
  await db.runAsync(
    `INSERT INTO bookmarks (id, document_id, page_id, label, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET page_id = excluded.page_id, label = excluded.label`,
    [b.id, b.documentId, b.pageId, b.label ?? null, b.createdAt]
  );
}

const ANNOTATION_KINDS = ['highlight', 'ink', 'note'];

// A row whose kind or data can't be read is skipped rather than failing the whole load.
function rowToAnnotation(row: AnnotationRow): Annotation | null {
  if (!ANNOTATION_KINDS.includes(row.kind)) return null;
  try {
    return {
      id: row.id,
      documentId: row.document_id,
      pageId: row.page_id,
      kind: row.kind as Annotation['kind'],
      color: row.color,
      data: JSON.parse(row.data) as Annotation['data'],
      text: row.text ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

async function writeAnnotation(db: SQLiteDatabase, a: Annotation): Promise<void> {
  await db.runAsync(
    `INSERT INTO annotations (id, document_id, page_id, kind, color, data, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET page_id = excluded.page_id, kind = excluded.kind, color = excluded.color,
       data = excluded.data, text = excluded.text, updated_at = excluded.updated_at`,
    [a.id, a.documentId, a.pageId, a.kind, a.color, JSON.stringify(a.data), a.text ?? null, a.createdAt, a.updatedAt]
  );
}

function parseIds(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rowToDeadline(row: DeadlineRow): Deadline {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    dueAt: row.due_at,
    docType: toDocType(row.doc_type),
    reminderIds: parseIds(row.reminder_ids),
    doneSubmissionId: row.done_submission_id ?? undefined,
    createdAt: row.created_at,
  };
}

async function writeDeadline(db: SQLiteDatabase, d: Deadline): Promise<void> {
  await db.runAsync(
    `INSERT INTO deadlines (id, course_id, title, due_at, doc_type, reminder_ids, done_submission_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET course_id = excluded.course_id, title = excluded.title, due_at = excluded.due_at,
       doc_type = excluded.doc_type, reminder_ids = excluded.reminder_ids, done_submission_id = excluded.done_submission_id`,
    [d.id, d.courseId, d.title, d.dueAt, d.docType ?? null, JSON.stringify(d.reminderIds), d.doneSubmissionId ?? null, d.createdAt]
  );
}

const SUBMISSIONS_QUERY = 'SELECT * FROM submissions ORDER BY created_at DESC, id';

function rowToSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    documentId: row.document_id,
    courseId: row.course_id ?? undefined,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    sizeLimitBytes: row.size_limit_bytes,
    pageCount: row.page_count,
    createdAt: row.created_at,
    preset: parseSubmitPreset(row.preset),
    typeNumber: row.type_number ?? undefined,
  };
}

async function writeSubmission(db: SQLiteDatabase, s: Submission): Promise<void> {
  await db.runAsync(
    `INSERT INTO submissions (id, document_id, course_id, file_name, size_bytes, size_limit_bytes, page_count,
       created_at, preset, type_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET course_id = excluded.course_id, file_name = excluded.file_name,
       size_bytes = excluded.size_bytes`,
    [
      s.id,
      s.documentId,
      s.courseId ?? null,
      s.fileName,
      s.sizeBytes,
      s.sizeLimitBytes,
      s.pageCount,
      s.createdAt,
      serializeSubmitPreset(s.preset),
      s.typeNumber ?? null,
    ]
  );
}

export async function insertSubmission(db: SQLiteDatabase, submission: Submission): Promise<void> {
  await writeSubmission(db, submission);
}

// Newest first; filtered by course and/or document when given.
export async function listSubmissions(
  db: SQLiteDatabase,
  filter: { courseId?: string; documentId?: string } = {}
): Promise<Submission[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.courseId !== undefined) {
    where.push('course_id = ?');
    params.push(filter.courseId);
  }
  if (filter.documentId !== undefined) {
    where.push('document_id = ?');
    params.push(filter.documentId);
  }
  const sql = `SELECT * FROM submissions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id`;
  return (await db.getAllAsync<SubmissionRow>(sql, params)).map(rowToSubmission);
}

// Writes one document and replaces its pages. Pages are deleted and re-inserted (rather than
// INSERT OR REPLACE) because REPLACE's implicit delete doesn't fire the FTS delete trigger, which
// would leave stale rows in pages_fts. Must run inside a transaction.
// `pagesUnchanged`: the caller knows the pages are the ones already stored (the reducer kept the
// same array), so only the document row is written - a rename, a star, or the Reader saving the
// page it's on (§7 R4) mustn't rewrite every page row.
// §8 B1: disk_bytes (the measured folder size) survives only a write that can't have changed the
// files - same pages, same PDF, same size; any save or edit clears it for the storage report to
// measure again. It isn't part of LibraryDocument, so a spread `...doc` can't carry a stale value.
// `edited` (§8): false when only bookkeeping changed (documentEdited below), which then keeps the
// stored updated_at.
async function writeDocument(
  db: SQLiteDatabase,
  doc: LibraryDocument,
  conflict: 'upsert' | 'ignore',
  pagesUnchanged = false,
  edited = true
): Promise<void> {
  const params = [
    doc.id,
    doc.name,
    doc.format,
    doc.mode,
    toStoredPath(doc.pdfUri),
    toStoredPath(doc.contentUri),
    doc.sizeBytes,
    doc.createdAt,
    Date.now(),
    doc.star ? 1 : 0,
    doc.tag ?? null,
    doc.locked ? 1 : 0,
    doc.coverKind ?? null,
    doc.sourceKind ?? null,
    doc.courseId ?? null,
    doc.docType ?? null,
    doc.archived ? 1 : 0,
    doc.pdfLayout ?? null,
    doc.pdfPageSize ?? null,
    doc.indexedAt ?? null,
    doc.indexState ?? null,
    doc.lastPage ?? null,
    doc.missingFiles ? 1 : 0,
  ];
  const insert = `INSERT INTO documents (id, name, format, mode, pdf_path, content_path, size_bytes, created_at,
       updated_at, star, tag, locked, cover_kind, source_kind, course_id, doc_type, archived, pdf_layout, pdf_page_size,
       indexed_at, index_state, last_page, missing_files)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  if (conflict === 'ignore') {
    const result = await db.runAsync(`${insert} ON CONFLICT (id) DO NOTHING`, params);
    if (result.changes === 0) return;
  } else {
    await db.runAsync(
      `${insert} ON CONFLICT (id) DO UPDATE SET name = excluded.name, format = excluded.format,
         mode = excluded.mode, pdf_path = excluded.pdf_path, content_path = excluded.content_path,
         size_bytes = excluded.size_bytes, updated_at = ${edited ? 'excluded.updated_at' : 'documents.updated_at'}, star = excluded.star,
         tag = excluded.tag, locked = excluded.locked, cover_kind = excluded.cover_kind,
         source_kind = excluded.source_kind, course_id = excluded.course_id, doc_type = excluded.doc_type,
         archived = excluded.archived, pdf_layout = excluded.pdf_layout, pdf_page_size = excluded.pdf_page_size,
         indexed_at = excluded.indexed_at, index_state = excluded.index_state, last_page = excluded.last_page,
         missing_files = excluded.missing_files,
         disk_bytes = CASE WHEN ${pagesUnchanged ? 1 : 0} AND documents.size_bytes = excluded.size_bytes
           AND documents.pdf_path IS excluded.pdf_path THEN documents.disk_bytes ELSE NULL END`,
      params
    );
    if (pagesUnchanged) return;
    await db.runAsync('DELETE FROM pages WHERE document_id = ?', [doc.id]);
  }

  const pageStmt = await db.prepareAsync(
    `INSERT INTO pages (id, document_id, idx, master_path, display_path, thumb_path, width, height, ocr_text,
       ocr_json, ocr_failed, layout, text_source, rotation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    for (let i = 0; i < doc.pages.length; i++) {
      const page = doc.pages[i];
      await pageStmt.executeAsync([
        page.id,
        doc.id,
        i,
        toStoredPath(page.fileUri) ?? '',
        toStoredPath(page.displayUri),
        toStoredPath(page.thumbUri),
        Math.round(page.width),
        Math.round(page.height),
        page.ocr?.text ?? null,
        page.ocr && page.ocr.blocks.length > 0 ? JSON.stringify(page.ocr) : null,
        page.ocrFailed ? 1 : 0,
        page.layout ?? null,
        page.textSource ?? null,
        page.rotation ?? 0,
      ]);
    }
  } finally {
    await pageStmt.finalizeAsync();
  }
}

async function writeCourse(db: SQLiteDatabase, course: Course, conflict: 'upsert' | 'ignore'): Promise<void> {
  const insert = `INSERT INTO courses (id, name, code, color, emoji, teacher, semester_id, archived, sort_order,
       created_at, submit_preset, ocr_script)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const onConflict =
    conflict === 'ignore'
      ? 'ON CONFLICT (id) DO NOTHING'
      : `ON CONFLICT (id) DO UPDATE SET name = excluded.name, code = excluded.code, color = excluded.color,
           emoji = excluded.emoji, teacher = excluded.teacher, semester_id = excluded.semester_id,
           archived = excluded.archived, sort_order = excluded.sort_order, submit_preset = excluded.submit_preset,
           ocr_script = excluded.ocr_script`;
  await db.runAsync(`${insert} ${onConflict}`, [
    course.id,
    course.name,
    course.code ?? null,
    course.color,
    course.emoji ?? null,
    course.teacher ?? null,
    course.semesterId ?? null,
    course.archived ? 1 : 0,
    course.sortOrder,
    course.createdAt,
    serializeSubmitPreset(course.submitPreset),
    course.ocrScript ?? null,
  ]);
}

async function writeSemester(db: SQLiteDatabase, semester: Semester): Promise<void> {
  await db.runAsync(
    `INSERT INTO semesters (id, name, starts_on, ends_on, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, starts_on = excluded.starts_on,
       ends_on = excluded.ends_on, archived = excluded.archived`,
    [semester.id, semester.name, semester.startsOn, semester.endsOn ?? null, semester.archived ? 1 : 0, semester.createdAt]
  );
}

async function writeSlot(db: SQLiteDatabase, slot: TimetableSlot): Promise<void> {
  await db.runAsync(
    `INSERT INTO timetable_slots (id, course_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET course_id = excluded.course_id, weekday = excluded.weekday,
       start_min = excluded.start_min, end_min = excluded.end_min`,
    [slot.id, slot.courseId, slot.weekday, slot.startMin, slot.endMin]
  );
}

async function deleteRows(
  db: SQLiteDatabase,
  table: 'documents' | 'courses' | 'semesters' | 'timetable_slots' | 'submissions' | 'deadlines' | 'annotations' | 'bookmarks',
  ids: string[]
): Promise<void> {
  for (const id of ids) await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

// Used by the one-time legacy import: never overwrites a row that already exists, so re-running
// an interrupted import is harmless.
export async function insertIfMissing(db: SQLiteDatabase, library: LoadedLibrary): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const course of library.courses) await writeCourse(db, course, 'ignore');
    for (const doc of library.documents) await writeDocument(db, doc, 'ignore');
  });
}

// §8 B1: the storage report's cache of each document folder's size. null: not measured since the
// document was last saved or edited.
export async function loadDiskBytes(db: SQLiteDatabase): Promise<Map<string, number | null>> {
  const rows = await db.getAllAsync<{ id: string; disk_bytes: number | null }>('SELECT id, disk_bytes FROM documents');
  return new Map(rows.map((row) => [row.id, row.disk_bytes]));
}

export async function saveDiskBytes(db: SQLiteDatabase, id: string, bytes: number): Promise<void> {
  await db.runAsync('UPDATE documents SET disk_bytes = ? WHERE id = ?', [bytes, id]);
}

// §8 B5: when the library last changed - the newest document saved or edited, or course made -
// for the backup reminder and automatic backups. null: nothing in it. Reading a document doesn't
// move its updated_at (documentEdited), so it isn't a change.
export async function libraryChangedAt(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ at: number | null }>(
    `SELECT MAX(at) AS at FROM (
       SELECT MAX(updated_at) AS at FROM documents
       UNION ALL SELECT MAX(created_at) FROM courses
     )`
  );
  return row?.at ?? null;
}

// §8 B1: ids that have a document row. The integrity check asks the database (not the in-memory
// state) before treating a folder as left over, so a document saved a moment ago isn't moved.
export async function documentIdsInDb(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM documents');
  return new Set(rows.map((row) => row.id));
}

export async function upsertDocuments(db: SQLiteDatabase, docs: LibraryDocument[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const doc of docs) await writeDocument(db, doc, 'upsert');
  });
}

export async function deleteDocuments(db: SQLiteDatabase, ids: string[]): Promise<void> {
  await db.withTransactionAsync(() => deleteRows(db, 'documents', ids));
}

export async function upsertCourses(db: SQLiteDatabase, courses: Course[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const course of courses) await writeCourse(db, course, 'upsert');
  });
}

// Documents in a deleted course fall back to Unsorted via the ON DELETE SET NULL foreign key.
export async function deleteCourses(db: SQLiteDatabase, ids: string[]): Promise<void> {
  await db.withTransactionAsync(() => deleteRows(db, 'courses', ids));
}

// `{n}` for §4's naming template, from the database: the number the next document of `type` in this
// course gets. Same rule as docTypes.nextTypeNumber (which works on in-memory state): count the
// documents that exist (deleted ones are gone, so they free their number), per course, with a
// missing doc_type counting as 'other'. `courseId` undefined = Unsorted.
export async function nextTypeNumber(db: SQLiteDatabase, courseId: string | undefined, type: DocType): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM documents WHERE course_id IS ? AND COALESCE(doc_type, 'other') = ?`,
    [courseId ?? null, type]
  );
  return (row?.n ?? 0) + 1;
}

// Sets every listed course's sort_order to its position in `ids`. Courses not listed keep theirs.
export async function reorderCourses(db: SQLiteDatabase, ids: string[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < ids.length; i++) await db.runAsync('UPDATE courses SET sort_order = ? WHERE id = ?', [i, ids[i]]);
  });
}

export async function upsertSemesters(db: SQLiteDatabase, semesters: Semester[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const semester of semesters) await writeSemester(db, semester);
  });
}

// Courses in a deleted semester stay, with no semester (ON DELETE SET NULL).
export async function deleteSemesters(db: SQLiteDatabase, ids: string[]): Promise<void> {
  await db.withTransactionAsync(() => deleteRows(db, 'semesters', ids));
}

// End of term: the semester and all its courses are archived together, or not at all. Their
// documents are untouched (still searchable, still in the library).
export async function archiveSemester(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE semesters SET archived = 1 WHERE id = ?', [id]);
    await db.runAsync('UPDATE courses SET archived = 1 WHERE semester_id = ?', [id]);
  });
}

// §8: what isn't an edit of the document - the page the Reader is on (§7 R4), the integrity
// check's missing-files flag (§8 B1) and the derived search text. A change to only these keeps
// documents.updated_at, which backups compare (B2's importPlan: "already here" vs "changed since")
// and which says when the library last changed (B5's reminder and automatic backups) - so reading
// a document doesn't count as changing it.
const NOT_EDITS: readonly (keyof LibraryDocument)[] = ['lastPage', 'missingFiles', 'searchHaystack'];

export function documentEdited(before: LibraryDocument, after: LibraryDocument): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof LibraryDocument)[]);
  for (const key of keys) {
    if (NOT_EDITS.includes(key)) continue;
    if (!Object.is(before[key], after[key])) return true;
  }
  return false;
}

export type Diff<T> = { changed: T[]; removedIds: string[] };

// The reducer is immutable, so a document/course whose object reference is unchanged is unchanged.
// Anything new or replaced is `changed`; ids that disappeared are `removedIds`.
export function diffById<T extends { id: string }>(prev: readonly T[], next: readonly T[]): Diff<T> {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  return {
    changed: next.filter((item) => prevById.get(item.id) !== item),
    removedIds: prev.filter((item) => !nextIds.has(item.id)).map((item) => item.id),
  };
}

// Applies the difference between two in-memory snapshots in one transaction (so the reducer's
// ARCHIVE_SEMESTER lands all-or-nothing, like archiveSemester above). Parents are written before
// children (semester -> course -> document/slot, since each may reference a new one) and deleted
// after - except documents, which are deleted first (see below).
export async function syncLibrary(db: SQLiteDatabase, prev: LoadedLibrary, next: LoadedLibrary): Promise<void> {
  const semesters = diffById(prev.semesters, next.semesters);
  const courses = diffById(prev.courses, next.courses);
  const documents = diffById(prev.documents, next.documents);
  const slots = diffById(prev.timetable, next.timetable);
  const submissions = diffById(prev.submissions ?? [], next.submissions ?? []);
  const deadlines = diffById(prev.deadlines ?? [], next.deadlines ?? []);
  const annotations = diffById(prev.annotations ?? [], next.annotations ?? []);
  const bookmarks = diffById(prev.bookmarks ?? [], next.bookmarks ?? []);
  const diffs = [semesters, courses, documents, slots, submissions, deadlines, annotations, bookmarks];
  if (diffs.every((d) => d.changed.length + d.removedIds.length === 0)) return;
  await db.withTransactionAsync(async () => {
    // Removed documents go first: a merge or split (§7 R2) gives its new documents the removed
    // ones' page ids, which must be free again before the new page rows are written. Their
    // submissions, annotations and bookmarks go with them (ON DELETE CASCADE); the ones that moved
    // to a new document are written again below.
    await deleteRows(db, 'documents', documents.removedIds);
    for (const semester of semesters.changed) await writeSemester(db, semester);
    for (const course of courses.changed) await writeCourse(db, course, 'upsert');
    const prevDocs = new Map(prev.documents.map((d) => [d.id, d]));
    for (const doc of documents.changed) {
      const before = prevDocs.get(doc.id);
      await writeDocument(db, doc, 'upsert', before?.pages === doc.pages, !before || documentEdited(before, doc));
    }
    for (const slot of slots.changed) await writeSlot(db, slot);
    // After documents and courses, which they reference.
    for (const submission of submissions.changed) await writeSubmission(db, submission);
    await deleteRows(db, 'submissions', submissions.removedIds);
    for (const deadline of deadlines.changed) await writeDeadline(db, deadline);
    await deleteRows(db, 'deadlines', deadlines.removedIds);
    for (const annotation of annotations.changed) await writeAnnotation(db, annotation);
    await deleteRows(db, 'annotations', annotations.removedIds);
    for (const bookmark of bookmarks.changed) await writeBookmark(db, bookmark);
    await deleteRows(db, 'bookmarks', bookmarks.removedIds);
    await deleteRows(db, 'timetable_slots', slots.removedIds);
    await deleteRows(db, 'courses', courses.removedIds);
    await deleteRows(db, 'semesters', semesters.removedIds);
  });
}
