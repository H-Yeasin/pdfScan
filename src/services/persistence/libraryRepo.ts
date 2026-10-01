import type { SQLiteDatabase } from 'expo-sqlite';
import type { Course, DocFormat, CaptureMode, LibraryDocument, LibraryPage, PageOcr } from '../../types/models';
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
};

type CourseRow = {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  semester: string | null;
  archived: number;
  created_at: number;
};

export type LoadedLibrary = { documents: LibraryDocument[]; courses: Course[] };

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
  };
}

function rowToCourse(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? undefined,
    color: row.color ?? undefined,
    semester: row.semester ?? undefined,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

// Newest first, matching the order the reducer keeps (ADD_FILE prepends).
export async function loadAll(db: SQLiteDatabase): Promise<LoadedLibrary> {
  const docRows = await db.getAllAsync<DocumentRow>('SELECT * FROM documents ORDER BY created_at DESC, id');
  const pageRows = await db.getAllAsync<PageRow>('SELECT * FROM pages ORDER BY document_id, idx');
  const courseRows = await db.getAllAsync<CourseRow>('SELECT * FROM courses ORDER BY created_at, id');

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
      coverKind: (row.cover_kind ?? undefined) as LibraryDocument['coverKind'],
      sourceKind: (row.source_kind ?? undefined) as LibraryDocument['sourceKind'],
    };
  });

  return { documents, courses: courseRows.map(rowToCourse) };
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
  ];
  const insert = `INSERT INTO documents (id, name, format, mode, pdf_path, content_path, size_bytes, created_at,
       updated_at, star, tag, locked, cover_kind, source_kind, course_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  if (conflict === 'ignore') {
    const result = await db.runAsync(`${insert} ON CONFLICT (id) DO NOTHING`, params);
    if (result.changes === 0) return;
  } else {
    await db.runAsync(
      `${insert} ON CONFLICT (id) DO UPDATE SET name = excluded.name, format = excluded.format,
         mode = excluded.mode, pdf_path = excluded.pdf_path, content_path = excluded.content_path,
         size_bytes = excluded.size_bytes, updated_at = excluded.updated_at, star = excluded.star,
         tag = excluded.tag, locked = excluded.locked, cover_kind = excluded.cover_kind,
         source_kind = excluded.source_kind, course_id = excluded.course_id`,
      params
    );
    await db.runAsync('DELETE FROM pages WHERE document_id = ?', [doc.id]);
  }

  const pageStmt = await db.prepareAsync(
    `INSERT INTO pages (id, document_id, idx, master_path, display_path, thumb_path, width, height, ocr_text,
       ocr_json, ocr_failed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      ]);
    }
  } finally {
    await pageStmt.finalizeAsync();
  }
}

async function writeCourse(db: SQLiteDatabase, course: Course, conflict: 'upsert' | 'ignore'): Promise<void> {
  const insert = `INSERT INTO courses (id, name, code, color, semester, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const onConflict =
    conflict === 'ignore'
      ? 'ON CONFLICT (id) DO NOTHING'
      : `ON CONFLICT (id) DO UPDATE SET name = excluded.name, code = excluded.code, color = excluded.color,
           semester = excluded.semester, archived = excluded.archived`;
  await db.runAsync(`${insert} ${onConflict}`, [
    course.id,
    course.name,
    course.code ?? null,
    course.color ?? null,
    course.semester ?? null,
    course.archived ? 1 : 0,
    course.createdAt,
  ]);
}

async function deleteRows(db: SQLiteDatabase, table: 'documents' | 'courses', ids: string[]): Promise<void> {
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

// Applies the difference between two in-memory snapshots in one transaction. Courses are written
// before documents (a new document may reference a new course) and deleted after them.
export async function syncLibrary(db: SQLiteDatabase, prev: LoadedLibrary, next: LoadedLibrary): Promise<void> {
  const courses = diffById(prev.courses, next.courses);
  const documents = diffById(prev.documents, next.documents);
  if (
    courses.changed.length + courses.removedIds.length + documents.changed.length + documents.removedIds.length ===
    0
  ) {
    return;
  }
  await db.withTransactionAsync(async () => {
    for (const course of courses.changed) await writeCourse(db, course, 'upsert');
    for (const doc of documents.changed) await writeDocument(db, doc, 'upsert');
    await deleteRows(db, 'documents', documents.removedIds);
    await deleteRows(db, 'courses', courses.removedIds);
  });
}
