import * as SQLite from 'expo-sqlite';
import { getSchemaVersion, MIGRATIONS, runMigrations } from '../migrations';

import { resetStorage } from '../../../test/db';

beforeEach(resetStorage);

async function tableNames(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger')");
  return rows.map((r) => r.name).sort();
}

describe('runMigrations', () => {
  it('builds the current schema on an empty database', async () => {
    const db = await SQLite.openDatabaseAsync('t.db');
    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(await tableNames(db)).toEqual(expect.arrayContaining(['courses', 'documents', 'pages', 'pages_fts', 'pages_ai']));
  });

  it('is a no-op the second time', async () => {
    const db = await SQLite.openDatabaseAsync('t.db');
    await runMigrations(db);
    await db.runAsync("INSERT INTO courses (id, name, created_at) VALUES ('c1', 'Math', 1)");
    await runMigrations(db);
    expect(await db.getAllAsync('SELECT id FROM courses')).toEqual([{ id: 'c1' }]);
  });

  it('replaces the pre-v1 search-only tables', async () => {
    const db = await SQLite.openDatabaseAsync('t.db');
    await db.execAsync(`
      CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT, course_folder TEXT);
      CREATE TABLE document_pages (id TEXT PRIMARY KEY, document_id TEXT, extracted_text TEXT);
      CREATE VIRTUAL TABLE document_pages_fts USING fts5(extracted_text, content='document_pages', content_rowid='rowid');
      INSERT INTO documents VALUES ('old', 'Old', NULL);
    `);
    await runMigrations(db);
    const names = await tableNames(db);
    expect(names).not.toContain('document_pages');
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(documents)');
    expect(columns.map((c) => c.name)).toContain('course_id');
    expect(await db.getAllAsync('SELECT * FROM documents')).toEqual([]);
  });

  it('rolls back a failing migration and leaves the version untouched', async () => {
    const db = await SQLite.openDatabaseAsync('t.db');
    await expect(
      runMigrations(db, [
        { version: 1, up: async (d) => d.execAsync('CREATE TABLE a (x)') },
        { version: 2, up: async (d) => d.execAsync('CREATE TABLE b (x); THIS IS NOT SQL') },
      ])
    ).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(1);
    expect(await tableNames(db)).not.toContain('b');
  });
});

describe('v3: semesters and course fields', () => {
  // A database as it was at v2, with `courses.semester` still free text.
  async function v2Db(): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync('t.db');
    await runMigrations(db, MIGRATIONS.filter((m) => m.version <= 2));
    expect(await getSchemaVersion(db)).toBe(2);
    return db;
  }

  async function insertCourse(db: SQLite.SQLiteDatabase, id: string, createdAt: number, semester: string | null, color: string | null = null) {
    await db.runAsync('INSERT INTO courses (id, name, color, semester, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      id.toUpperCase(),
      color,
      semester,
      createdAt,
    ]);
  }

  it('moves semester strings into semesters rows, matching by name', async () => {
    const db = await v2Db();
    // Local noon, so the expected day doesn't depend on the test machine's time zone.
    const sep1 = new Date(2026, 8, 1, 12).getTime();
    const sep3 = new Date(2026, 8, 3, 12).getTime();
    const jan5 = new Date(2027, 0, 5, 12).getTime();
    await insertCourse(db, 'math', sep3, 'Fall 2026');
    await insertCourse(db, 'bio', sep1, ' fall 2026 ');
    await insertCourse(db, 'cs', jan5, 'Spring 2027');
    await insertCourse(db, 'art', jan5 + 1, '  ');

    await runMigrations(db);

    const semesters = await db.getAllAsync<{ id: string; name: string; starts_on: string; ends_on: string | null }>(
      'SELECT id, name, starts_on, ends_on FROM semesters ORDER BY starts_on'
    );
    expect(semesters.map((s) => [s.name, s.starts_on, s.ends_on])).toEqual([
      // Named after, and starting on the day of, its earliest course.
      ['fall 2026', '2026-09-01', null],
      ['Spring 2027', '2027-01-05', null],
    ]);
    const courses = await db.getAllAsync<{ id: string; semester_id: string | null; sort_order: number }>(
      'SELECT id, semester_id, sort_order FROM courses ORDER BY sort_order'
    );
    expect(courses.map((c) => c.id)).toEqual(['bio', 'math', 'cs', 'art']);
    expect(courses.map((c) => c.sort_order)).toEqual([0, 1, 2, 3]);
    const [fall, spring] = semesters.map((s) => s.id);
    expect(courses.map((c) => c.semester_id)).toEqual([fall, fall, spring, null]);

    const courseColumns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(courses)')).map((c) => c.name);
    expect(courseColumns).toEqual(expect.arrayContaining(['semester_id', 'emoji', 'teacher', 'sort_order']));
    expect(courseColumns).not.toContain('semester');
    const docColumns = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(documents)')).map((c) => c.name);
    expect(docColumns).toContain('doc_type');
  });

  it('works without any old semester strings, and gives every course a colour', async () => {
    const db = await v2Db();
    await insertCourse(db, 'a', 1, null);
    await insertCourse(db, 'b', 2, null, 'blue');
    await insertCourse(db, 'c', 3, null, '#ff0000');

    await runMigrations(db);

    expect(await db.getAllAsync('SELECT * FROM semesters')).toEqual([]);
    const rows = await db.getAllAsync<{ id: string; color: string; semester_id: string | null }>(
      'SELECT id, color, semester_id FROM courses ORDER BY sort_order'
    );
    // 'b' keeps its valid colour; the others get the next free ones around it.
    expect(rows).toEqual([
      { id: 'a', color: 'teal', semester_id: null },
      { id: 'b', color: 'blue', semester_id: null },
      { id: 'c', color: 'orange', semester_id: null },
    ]);
  });

  it('migrates an empty v2 database', async () => {
    const db = await v2Db();
    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
  });

  it('adds documents.last_position to a v17 library, empty (§18 W19)', async () => {
    const db = await SQLite.openDatabaseAsync('t.db');
    await runMigrations(db, MIGRATIONS.filter((m) => m.version <= 17));
    await db.runAsync("INSERT INTO documents (id, name, format, mode, size_bytes, created_at, updated_at, last_page) VALUES ('d1', 'Notes', 'PDF', 'document', 1, 1, 1, 7)");
    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBeGreaterThanOrEqual(18);
    expect(await db.getAllAsync('SELECT id, last_page, last_position FROM documents')).toEqual([{ id: 'd1', last_page: 7, last_position: null }]);
    await db.runAsync("UPDATE documents SET last_position = ? WHERE id = 'd1'", ['{"kind":"docx","fraction":0.5}']);
    expect(await db.getFirstAsync('SELECT last_position FROM documents')).toEqual({ last_position: '{"kind":"docx","fraction":0.5}' });
  });
});
