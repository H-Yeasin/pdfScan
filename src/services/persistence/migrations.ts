import type { SQLiteDatabase } from 'expo-sqlite';
import { isCourseColor, nextCourseColor } from '../courses/palette';
import type { CourseColor } from '../../types/models';
import { createId } from '../../utils/id';
import { toLocalDateString } from '../../utils/localDate';

// Ordered, append-only schema history. Each entry runs once, inside its own transaction, and
// bumps `PRAGMA user_version` to its `version` - never edit a shipped migration, add a new one.
export type Migration = { version: number; up: (db: SQLiteDatabase) => Promise<void> };

export const MIGRATIONS: Migration[] = [
  {
    // v1: SQLite becomes the library's single source of truth. The pre-v1 tables (documents /
    // document_pages / document_pages_fts) were only a partial search copy of the AsyncStorage
    // index, so they're dropped and rebuilt from that index by the legacy import, which runs
    // right after migrations (see legacyLibrary.ts).
    version: 1,
    up: async (db) => {
      await db.execAsync(`
        DROP TRIGGER IF EXISTS document_pages_ai;
        DROP TRIGGER IF EXISTS document_pages_ad;
        DROP TRIGGER IF EXISTS document_pages_au;
        DROP TABLE IF EXISTS document_pages_fts;
        DROP TABLE IF EXISTS document_pages;
        DROP TABLE IF EXISTS documents;

        CREATE TABLE courses (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          code TEXT,
          color TEXT,
          semester TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE documents (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          format TEXT NOT NULL,
          mode TEXT NOT NULL,
          pdf_path TEXT,
          content_path TEXT,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          star INTEGER NOT NULL DEFAULT 0,
          tag TEXT,
          locked INTEGER NOT NULL DEFAULT 0,
          cover_kind TEXT,
          source_kind TEXT,
          course_id TEXT REFERENCES courses (id) ON DELETE SET NULL
        );
        CREATE INDEX idx_documents_course_id ON documents (course_id);

        CREATE TABLE pages (
          id TEXT PRIMARY KEY NOT NULL,
          document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
          idx INTEGER NOT NULL,
          master_path TEXT NOT NULL,
          display_path TEXT,
          thumb_path TEXT,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          ocr_text TEXT,
          ocr_json TEXT,
          ocr_failed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_pages_document_id ON pages (document_id, idx);

        CREATE VIRTUAL TABLE pages_fts USING fts5(
          ocr_text,
          content='pages',
          content_rowid='rowid'
        );

        CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
          INSERT INTO pages_fts (rowid, ocr_text) VALUES (new.rowid, new.ocr_text);
        END;
        CREATE TRIGGER pages_ad AFTER DELETE ON pages BEGIN
          INSERT INTO pages_fts (pages_fts, rowid, ocr_text) VALUES ('delete', old.rowid, old.ocr_text);
        END;
        CREATE TRIGGER pages_au AFTER UPDATE ON pages BEGIN
          INSERT INTO pages_fts (pages_fts, rowid, ocr_text) VALUES ('delete', old.rowid, old.ocr_text);
          INSERT INTO pages_fts (rowid, ocr_text) VALUES (new.rowid, new.ocr_text);
        END;
      `);
    },
  },
  {
    // v2: pages.layout - 'fullPage' for true-size ID card canvases (C4), NULL for normal pages.
    version: 2,
    up: async (db) => {
      await db.execAsync('ALTER TABLE pages ADD COLUMN layout TEXT;');
    },
  },
  {
    // v3 (§3 K1): semesters become their own table; courses get semester_id, emoji, teacher,
    // sort_order and a colour each; documents get doc_type (NULL = 'other').
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE semesters (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          starts_on TEXT NOT NULL,
          ends_on TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        ALTER TABLE courses ADD COLUMN semester_id TEXT REFERENCES semesters (id) ON DELETE SET NULL;
        ALTER TABLE courses ADD COLUMN emoji TEXT;
        ALTER TABLE courses ADD COLUMN teacher TEXT;
        ALTER TABLE courses ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX idx_courses_semester_id ON courses (semester_id);
        ALTER TABLE documents ADD COLUMN doc_type TEXT;
      `);
      await moveCourseSemesters(db);
      await db.execAsync('ALTER TABLE courses DROP COLUMN semester;');
    },
  },
  {
    // v4 (§3 K5): the optional weekly timetable that drives course suggestions. A slot belongs to
    // one course and goes with it.
    version: 4,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE timetable_slots (
          id TEXT PRIMARY KEY NOT NULL,
          course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
          weekday INTEGER NOT NULL,
          start_min INTEGER NOT NULL,
          end_min INTEGER NOT NULL
        );
        CREATE INDEX idx_timetable_slots_course_id ON timetable_slots (course_id);
      `);
    },
  },
];

// v3 data move. The old free-text courses.semester becomes semesters rows: one per distinct name
// (trimmed, case-insensitive, so "Fall 2026" and "fall 2026 " are one semester), starting on the
// day its earliest course was created - the only date there is; the student can correct it.
// sort_order follows creation order (the order courses were listed in before), and any course
// without a valid palette colour gets one the way a new course would.
async function moveCourseSemesters(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; semester: string | null; color: string | null; archived: number; created_at: number }>(
    'SELECT id, semester, color, archived, created_at FROM courses ORDER BY created_at, id'
  );

  const semesterIdByKey = new Map<string, string>();
  const assigned: { color: CourseColor; archived: boolean }[] = rows
    .filter((row) => isCourseColor(row.color))
    .map((row) => ({ color: row.color as CourseColor, archived: !!row.archived }));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.semester?.trim();
    let semesterId: string | null = null;
    if (name) {
      const key = name.toLowerCase();
      semesterId = semesterIdByKey.get(key) ?? null;
      if (!semesterId) {
        semesterId = createId('semester');
        semesterIdByKey.set(key, semesterId);
        // Rows are in creation order, so the first course seen is the semester's earliest.
        await db.runAsync('INSERT INTO semesters (id, name, starts_on, archived, created_at) VALUES (?, ?, ?, 0, ?)', [
          semesterId,
          name,
          toLocalDateString(row.created_at),
          row.created_at,
        ]);
      }
    }

    let color: CourseColor;
    if (isCourseColor(row.color)) {
      color = row.color;
    } else {
      color = nextCourseColor(assigned);
      assigned.push({ color, archived: !!row.archived });
    }
    await db.runAsync('UPDATE courses SET semester_id = ?, sort_order = ?, color = ? WHERE id = ?', [
      semesterId,
      i,
      color,
      row.id,
    ]);
  }
}

export async function getSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export async function runMigrations(db: SQLiteDatabase, migrations: Migration[] = MIGRATIONS): Promise<void> {
  let current = await getSchemaVersion(db);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      // PRAGMA arguments can't be bound parameters; `version` is a trusted integer constant.
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    current = migration.version;
  }
}
