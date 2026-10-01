// expo-sqlite's async API on top of Node's built-in `node:sqlite` (same SQLite engine, FTS5
// included), so persistence code runs real SQL in tests. Each database name maps to one
// in-memory connection until `__resetDatabases()` is called.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type Params = unknown[] | Record<string, unknown> | undefined;
type SqlValue = string | number | bigint | null | Uint8Array;

function normalize(params: Params): SqlValue[] {
  if (!params) return [];
  const list = Array.isArray(params) ? params : Object.values(params);
  return list.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlValue)));
}

export class SQLiteDatabase {
  constructor(readonly databaseName: string, private readonly db: InstanceType<typeof DatabaseSync>) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }
  async runAsync(sql: string, params?: Params): Promise<{ changes: number; lastInsertRowId: number }> {
    const result = this.db.prepare(sql).run(...normalize(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getAllAsync<T>(sql: string, params?: Params): Promise<T[]> {
    return this.db.prepare(sql).all(...normalize(params)) as T[];
  }
  async getFirstAsync<T>(sql: string, params?: Params): Promise<T | null> {
    return (this.db.prepare(sql).get(...normalize(params)) as T | undefined) ?? null;
  }
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  async withExclusiveTransactionAsync(task: (txn: SQLiteDatabase) => Promise<void>): Promise<void> {
    await this.withTransactionAsync(() => task(this));
  }
  async prepareAsync(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      executeAsync: async (params?: Params) => {
        const result = stmt.run(...normalize(params));
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
      finalizeAsync: async () => {},
    };
  }
  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

let databases = new Map<string, SQLiteDatabase>();

export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  let db = databases.get(name);
  if (!db) {
    db = new SQLiteDatabase(name, new DatabaseSync(':memory:'));
    databases.set(name, db);
  }
  return db;
}

export function __resetDatabases(): void {
  databases = new Map();
}
