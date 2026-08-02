import * as SQLite from 'expo-sqlite';
import type { LibraryDocument } from '../../types/models';

const DATABASE_NAME = 'pdfscan.db';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    course_folder TEXT
  );

  CREATE TABLE IF NOT EXISTS document_pages (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    extracted_text TEXT,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS document_pages_fts USING fts5(
    extracted_text,
    content='document_pages',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS document_pages_ai AFTER INSERT ON document_pages BEGIN
    INSERT INTO document_pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
  END;

  CREATE TRIGGER IF NOT EXISTS document_pages_ad AFTER DELETE ON document_pages BEGIN
    INSERT INTO document_pages_fts(document_pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
  END;

  CREATE TRIGGER IF NOT EXISTS document_pages_au AFTER UPDATE ON document_pages BEGIN
    INSERT INTO document_pages_fts(document_pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
    INSERT INTO document_pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
  END;
`;

// Memoized so every caller (boot init, a save mid-flight, a search) awaits the
// same open+migrate work instead of racing to open/migrate the connection twice.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// `CREATE TABLE IF NOT EXISTS` only covers fresh installs - an already-existing `documents` table
// from before Courses routing shipped needs this column added explicitly. Guarded via
// `PRAGMA table_info` (rather than a version counter) so it's idempotent and self-verifying on
// every startup instead of relying on a separately-tracked schema version staying in sync.
async function ensureCourseFolderColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(documents)');
  if (!columns.some((c) => c.name === 'course_folder')) {
    await db.execAsync('ALTER TABLE documents ADD COLUMN course_folder TEXT');
  }
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      // foreign_keys is a per-connection PRAGMA, not persisted in the db file itself,
      // so it must be re-applied on every open — this is what makes the pages'
      // ON DELETE CASCADE (and therefore the FTS delete trigger) actually fire.
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(SCHEMA_SQL);
      await ensureCourseFolderColumn(db);
      return db;
    });
  }
  return dbPromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDb();
}

export async function insertScannedDocument(doc: LibraryDocument): Promise<void> {
  const db = await getDb();
  const filePath = doc.pdfUri ?? doc.pages[0]?.fileUri ?? '';

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO documents (id, title, created_at, updated_at, file_path, page_count, file_size, course_folder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc.id, doc.name, doc.createdAt, Date.now(), filePath, doc.pages.length, doc.sizeBytes, doc.courseFolder ?? null]
    );

    const pageStmt = await db.prepareAsync(
      `INSERT OR REPLACE INTO document_pages (id, document_id, page_index, image_path, extracted_text)
       VALUES (?, ?, ?, ?, ?)`
    );
    try {
      for (let i = 0; i < doc.pages.length; i++) {
        const page = doc.pages[i];
        await pageStmt.executeAsync([page.id, doc.id, i, page.fileUri, page.ocr?.text ?? null]);
      }
    } finally {
      await pageStmt.finalizeAsync();
    }
  });
}

export async function deleteScannedDocument(documentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM documents WHERE id = ?', [documentId]);
}

export async function searchDocumentsByText(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const matchQuery = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' ');
  const likeParam = `%${trimmed}%`;

  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id, MAX(ts) AS ts FROM (
       SELECT dp.document_id AS id, d.updated_at AS ts
       FROM document_pages_fts fts
       JOIN document_pages dp ON dp.rowid = fts.rowid
       JOIN documents d ON d.id = dp.document_id
       WHERE document_pages_fts MATCH ?
       UNION
       SELECT id, updated_at AS ts FROM documents WHERE title LIKE ?
     )
     GROUP BY id
     ORDER BY ts DESC`,
    [matchQuery, likeParam]
  );
  return rows.map((row) => row.id);
}
