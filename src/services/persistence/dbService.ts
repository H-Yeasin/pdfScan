import * as SQLite from 'expo-sqlite';
import { importLegacyLibraryIfPresent } from './legacyLibrary';
import { runMigrations } from './migrations';
import { buildFtsMatchQuery, escapeLikePattern } from './searchQuery';

const DATABASE_NAME = 'pdfscan.db';

// Memoized so every caller (boot load, a sync mid-flight, a search) awaits the same
// open+migrate+import work instead of racing to do it twice. A failed open is not memoized, so
// the next caller retries instead of being stuck with a rejected promise forever.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      // foreign_keys is a per-connection PRAGMA, not persisted in the db file itself, so it must
      // be re-applied on every open - this is what makes pages' ON DELETE CASCADE (and therefore
      // the FTS delete trigger) and documents' ON DELETE SET NULL actually fire.
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      await importLegacyLibraryIfPresent(db);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// For tests: forget the memoized connection so the next getDb() starts from scratch.
export function __resetDbForTests(): void {
  dbPromise = null;
}

// Ids of documents whose OCR text (prefix match per token) or name (substring) matches, most
// recently updated first.
export async function searchDocumentsByText(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id, MAX(ts) AS ts FROM (
       SELECT p.document_id AS id, d.updated_at AS ts
       FROM pages_fts fts
       JOIN pages p ON p.rowid = fts.rowid
       JOIN documents d ON d.id = p.document_id
       WHERE pages_fts MATCH ?
       UNION
       SELECT id, updated_at AS ts FROM documents WHERE name LIKE ? ESCAPE '\\'
     )
     GROUP BY id
     ORDER BY ts DESC`,
    [buildFtsMatchQuery(trimmed), `%${escapeLikePattern(trimmed)}%`]
  );
  return rows.map((row) => row.id);
}

export type PageHit = {
  documentId: string;
  pageId: string;
  // 0-based library page index.
  idx: number;
  // OCR text around the match, with the matched terms in [brackets].
  snippet: string;
  // bm25: lower is a better match.
  rank: number;
};

// §5 T2: pages (not documents) whose OCR text matches, best match first (FTS5 bm25), newest
// document first on a tie. Optional course (null = Unsorted) and type filters, as in the Library.
export async function searchPages(
  query: string,
  options: { courseId?: string | null; type?: string; limit?: number } = {}
): Promise<PageHit[]> {
  const match = buildFtsMatchQuery(query.trim());
  if (!match) return [];
  const where = ['pages_fts MATCH ?'];
  const params: (string | number | null)[] = [match];
  if (options.courseId !== undefined) {
    where.push('d.course_id IS ?');
    params.push(options.courseId);
  }
  if (options.type !== undefined) {
    where.push("COALESCE(d.doc_type, 'other') = ?");
    params.push(options.type);
  }
  params.push(options.limit ?? 50);
  const db = await getDb();
  return db.getAllAsync<PageHit>(
    `SELECT p.document_id AS documentId, p.id AS pageId, p.idx AS idx,
            snippet(pages_fts, 0, '[', ']', '…', 12) AS snippet, bm25(pages_fts) AS rank
     FROM pages_fts
     JOIN pages p ON p.rowid = pages_fts.rowid
     JOIN documents d ON d.id = p.document_id
     WHERE ${where.join(' AND ')}
     ORDER BY rank, d.created_at DESC, p.idx
     LIMIT ?`,
    params
  );
}
