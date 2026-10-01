import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Course,
  DocFormat,
  DocType,
  CaptureMode,
  LibraryDocument,
  LibraryPage,
  PageOcr,
  Semester,
  TimetableSlot,
} from '../../types/models';
import { COURSE_COLORS, isCourseColor } from '../courses/palette';
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

export type LoadedLibrary = {
  documents: LibraryDocument[];
  courses: Course[];
  semesters: Semester[];
  timetable: TimetableSlot[];
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
  };
}

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
  };
}

// Writes one document and replaces its pages. Pages are deleted and re-inserted (rather than
// INSERT OR REPLACE) because REPLACE's implicit delete doesn't fire the FTS delete trigger, which
// would leave stale rows in pages_fts. Must run inside a transaction.
async function writeDocument(db: SQLiteDatabase, doc: LibraryDocument, conflict: 'upsert' | 'ignore'): Promise<void> {
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
  ];
  const insert = `INSERT INTO documents (id, name, format, mode, pdf_path, content_path, size_bytes, created_at,
       updated_at, star, tag, locked, cover_kind, source_kind, course_id, doc_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  if (conflict === 'ignore') {
    const result = await db.runAsync(`${insert} ON CONFLICT (id) DO NOTHING`, params);
    if (result.changes === 0) return;
  } else {
    await db.runAsync(
      `${insert} ON CONFLICT (id) DO UPDATE SET name = excluded.name, format = excluded.format,
         mode = excluded.mode, pdf_path = excluded.pdf_path, content_path = excluded.content_path,
         size_bytes = excluded.size_bytes, updated_at = excluded.updated_at, star = excluded.star,
         tag = excluded.tag, locked = excluded.locked, cover_kind = excluded.cover_kind,
         source_kind = excluded.source_kind, course_id = excluded.course_id, doc_type = excluded.doc_type`,
      params
    );
    await db.runAsync('DELETE FROM pages WHERE document_id = ?', [doc.id]);
  }

  const pageStmt = await db.prepareAsync(
    `INSERT INTO pages (id, document_id, idx, master_path, display_path, thumb_path, width, height, ocr_text,
       ocr_json, ocr_failed, layout)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      ]);
    }
  } finally {
    await pageStmt.finalizeAsync();
  }
}

async function writeCourse(db: SQLiteDatabase, course: Course, conflict: 'upsert' | 'ignore'): Promise<void> {
  const insert = `INSERT INTO courses (id, name, code, color, emoji, teacher, semester_id, archived, sort_order,
       created_at, submit_preset)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const onConflict =
    conflict === 'ignore'
      ? 'ON CONFLICT (id) DO NOTHING'
      : `ON CONFLICT (id) DO UPDATE SET name = excluded.name, code = excluded.code, color = excluded.color,
           emoji = excluded.emoji, teacher = excluded.teacher, semester_id = excluded.semester_id,
           archived = excluded.archived, sort_order = excluded.sort_order, submit_preset = excluded.submit_preset`;
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
  table: 'documents' | 'courses' | 'semesters' | 'timetable_slots',
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
// children (semester -> course -> document/slot, since each may reference a new one) and deleted after.
export async function syncLibrary(db: SQLiteDatabase, prev: LoadedLibrary, next: LoadedLibrary): Promise<void> {
  const semesters = diffById(prev.semesters, next.semesters);
  const courses = diffById(prev.courses, next.courses);
  const documents = diffById(prev.documents, next.documents);
  const slots = diffById(prev.timetable, next.timetable);
  const diffs = [semesters, courses, documents, slots];
  if (diffs.every((d) => d.changed.length + d.removedIds.length === 0)) return;
  await db.withTransactionAsync(async () => {
    for (const semester of semesters.changed) await writeSemester(db, semester);
    for (const course of courses.changed) await writeCourse(db, course, 'upsert');
    for (const doc of documents.changed) await writeDocument(db, doc, 'upsert');
    for (const slot of slots.changed) await writeSlot(db, slot);
    await deleteRows(db, 'timetable_slots', slots.removedIds);
    await deleteRows(db, 'documents', documents.removedIds);
    await deleteRows(db, 'courses', courses.removedIds);
    await deleteRows(db, 'semesters', semesters.removedIds);
  });
}
