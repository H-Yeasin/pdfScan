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
  {
    // v5 (§4 S6): each course remembers how its work is submitted (size limit, cover, footer,
    // paper, layout), as JSON (submit/preset.ts). NULL: not set up yet.
    version: 5,
    up: async (db) => {
      await db.execAsync('ALTER TABLE courses ADD COLUMN submit_preset TEXT;');
    },
  },
  {
    // v6 (§4 S7): submission history. A row goes with its document (the file is in the document's
    // folder too); a deleted course leaves its rows Unsorted. `preset` (JSON) and `type_number`
    // are what the file was built with, for rebuilding it if it's gone.
    version: 6,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE submissions (
          id TEXT PRIMARY KEY NOT NULL,
          document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
          course_id TEXT REFERENCES courses (id) ON DELETE SET NULL,
          file_name TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          size_limit_bytes INTEGER,
          page_count INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          preset TEXT,
          type_number INTEGER
        );
        CREATE INDEX idx_submissions_document_id ON submissions (document_id);
        CREATE INDEX idx_submissions_course_id ON submissions (course_id);
      `);
    },
  },
  {
    // v7 (§4 S8): deadlines with local reminders. A deadline goes with its course; its reminder
    // ids are JSON (expo-notifications identifiers).
    version: 7,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE deadlines (
          id TEXT PRIMARY KEY NOT NULL,
          course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          due_at INTEGER NOT NULL,
          doc_type TEXT,
          reminder_ids TEXT NOT NULL DEFAULT '[]',
          done_submission_id TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_deadlines_course_id ON deadlines (course_id);
      `);
    },
  },
  {
    // v8 (§3 K6): documents can be archived (hidden from lists, still searchable).
    version: 8,
    up: async (db) => {
      await db.execAsync('ALTER TABLE documents ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;');
    },
  },
  {
    // v9 (§5 T1): how document.pdf is laid out ('standard' | '2_in_1') and its paper ('A4' |
    // 'Letter'), so library pages map to PDF pages. NULL for documents built before: filled in
    // after load by documents/pdfInfoBackfill.ts, which reads the PDF (not possible in SQL).
    version: 9,
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE documents ADD COLUMN pdf_layout TEXT;
        ALTER TABLE documents ADD COLUMN pdf_page_size TEXT;
      `);
    },
  },
  {
    // v10 (§5 T4): annotations. They go with their document. Not tied to pages by a foreign key:
    // a document's page rows are deleted and re-inserted on every save (libraryRepo.writeDocument),
    // which would cascade them away; the store drops a page's annotations when the page leaves.
    version: 10,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE annotations (
          id TEXT PRIMARY KEY NOT NULL,
          document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
          page_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          color TEXT NOT NULL,
          data TEXT NOT NULL,
          text TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_annotations_document_id ON annotations (document_id);
      `);
    },
  },
  {
    // v11 (§5 T5): bookmarks. Like annotations, they go with their document; no foreign key on
    // the page row, which is rewritten on every save.
    version: 11,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE bookmarks (
          id TEXT PRIMARY KEY NOT NULL,
          document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
          page_id TEXT NOT NULL,
          label TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_bookmarks_document_id ON bookmarks (document_id);
      `);
    },
  },
  {
    // v12 (§6 L1): a course's recognition script (scripts/registry ids). NULL = the app setting.
    version: 12,
    up: async (db) => {
      await db.execAsync('ALTER TABLE courses ADD COLUMN ocr_script TEXT;');
    },
  },
  {
    // v13 (§7 R1): imported PDFs get real page rows. pages.text_source says where a page's text
    // came from ('pdf' text layer | 'ocr'; NULL for scans, which are always OCR).
    // documents.indexed_at / index_state record that an imported PDF was indexed and how; NULL
    // means "not yet", which the background indexer picks up (documents saved before R1 included).
    version: 13,
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE pages ADD COLUMN text_source TEXT;
        ALTER TABLE documents ADD COLUMN indexed_at INTEGER;
        ALTER TABLE documents ADD COLUMN index_state TEXT;
      `);
    },
  },
  {
    // v14 (§7 R3): a page's clockwise turn after saving (0/90/180/270), applied as the PDF page's
    // /Rotate - the master is never re-encoded.
    version: 14,
    up: async (db) => {
      await db.execAsync('ALTER TABLE pages ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0;');
    },
  },
  {
    // v15 (§7 R4): the PDF page (1-based) a document was last read at. NULL: never read.
    version: 15,
    up: async (db) => {
      await db.execAsync('ALTER TABLE documents ADD COLUMN last_page INTEGER;');
    },
  },
  {
    // v16 (§8 B1): documents.missing_files flags a document whose files the start-up integrity
    // check couldn't find (storage/integrity.ts), so the library says so instead of crashing.
    // documents.disk_bytes caches the size of its library/<id>/ folder for the storage report
    // (storage/usage.ts); NULL means "not measured since the last save or edit".
    version: 16,
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE documents ADD COLUMN missing_files INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE documents ADD COLUMN disk_bytes INTEGER;
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
