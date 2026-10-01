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
