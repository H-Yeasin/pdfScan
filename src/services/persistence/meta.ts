import type { SQLiteDatabase } from 'expo-sqlite';

// §16 G4: facts about this database file, as key/value rows (the `meta` table, migration v17).
// They describe this phone's copy, not the library, so a backup doesn't carry them.

// The one-time import of the AsyncStorage library (legacyLibrary.ts) is over: it ran, or there
// was nothing to import.
export const META_LEGACY_IMPORT_DONE = 'legacyImportDone';

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
}
