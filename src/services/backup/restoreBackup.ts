import { Directory, File, Paths } from 'expo-file-system';
import type { PersistedSettings } from '../persistence/settingsStorage';
import { getDb, withWriteLock } from '../persistence/dbService';
import { ensureNotificationPermission, scheduleReminders } from '../submit/deadlines';
import { checkSpaceFor } from '../storage/usage';
import {
  importPlan,
  insertRows,
  LIBRARY_ENTRY,
  loadCurrentLibrary,
  MANIFEST_ENTRY,
  parseManifest,
  SETTINGS_ENTRY,
  targetPathForEntry,
  upgradeLibraryJson,
  BackupFormatError,
  type ImportMode,
  type ImportPlan,
  type LibraryJson,
  type Manifest,
  type Row,
} from './format';
import { extractToFile, openZip, ZipAbortedError, type ZipEntry } from './zip';

// §8 B4: restores a backup, or adds a course or documents someone shared, without ever leaving the
// library half-changed:
//   1. read manifest.json and library.json (refusing other zips and newer formats);
//   2. preview: importPlan says what would happen, and whether it fits;
//   3. copy each incoming document's files into library/.incoming/<id>/, one document at a time,
//      every entry's CRC checked;
//   4. in one database transaction, insert the rows and move each staged folder into place. If
//      anything fails, the transaction rolls back, the moved folders are removed and .incoming is
//      deleted: the library is exactly as it was.
// The caller then reloads the library (which also re-runs B1's integrity check).

const INCOMING = '.incoming';
const SIGNATURE_STAGE = '.signature';

export type OpenedBackup = {
  file: File;
  manifest: Manifest;
  json: LibraryJson;
  // Full backups only (B3).
  settings: Partial<PersistedSettings> | null;
  hasSignature: boolean;
};

export type RestorePreview = {
  plan: ImportPlan;
  // What the files coming in take, and what the phone has (null: unknown).
  bytesNeeded: number;
  freeBytes: number | null;
  fits: boolean;
};

export type RestoreProgress = { bytesDone: number; bytesTotal: number; documentsDone: number; documentsTotal: number };

export type RestoreResult = {
  plan: ImportPlan;
  // Deadlines whose reminders were scheduled again.
  remindersScheduled: number;
  signatureRestored: boolean;
};

export class RestoreSpaceError extends Error {
  constructor(
    readonly bytesNeeded: number,
    readonly freeBytes: number | null
  ) {
    super('Not enough space to restore this backup');
    this.name = 'RestoreSpaceError';
  }
}

function libraryDir(...parts: string[]): Directory {
  return new Directory(Paths.document, 'library', ...parts);
}

// Reads what a zip is, without copying anything. Throws BackupFormatError (NOT_A_BACKUP, TOO_NEW)
// or ZipError (NOT_A_ZIP, UNSUPPORTED_ZIP, CRC_MISMATCH).
export function readBackup(file: File): OpenedBackup {
  const reader = openZip(file);
  try {
    const manifestEntry = reader.entry(MANIFEST_ENTRY);
    const libraryEntry = reader.entry(LIBRARY_ENTRY);
    if (!manifestEntry || !libraryEntry) throw new BackupFormatError('NOT_A_BACKUP', 'Not a PDF Scan backup');
    const manifest = parseManifest(reader.readJson(manifestEntry));
    let json = upgradeLibraryJson(reader.readJson(libraryEntry));
    if (manifest.restorable === 'pdfs') json = asImportedPdfs(json, manifest);
    const settingsEntry = reader.entry(SETTINGS_ENTRY);
    const settings = settingsEntry ? reader.readJson<Partial<PersistedSettings>>(settingsEntry) : null;
    return { file, manifest, json, settings, hasSignature: reader.entries.some((e) => e.name.startsWith('signature/')) };
  } finally {
    reader.close();
  }
}

// A "PDFs only" backup (B3) has each document's readable file and nothing under data/. Its PDFs
// come back as imported PDFs, which §7 R1's indexer gives thumbnails and searchable text again;
// pages, notes and bookmarks referred to files that aren't there, so they're left out, and so are
// the submissions. Office files keep their row. A document whose file isn't in the zip is skipped.
export function asImportedPdfs(json: LibraryJson, manifest: Pick<Manifest, 'readable'>): LibraryJson {
  const tables = { ...json.tables };
  tables.documents = json.tables.documents
    .filter((doc) => manifest.readable[String(doc.id)])
    .map((doc): Row => {
      if (!doc.pdf_path) return doc;
      return {
        ...doc,
        format: 'PDF',
        source_kind: 'imported_pdf',
        indexed_at: null,
        index_state: null,
        pdf_layout: null,
        pdf_page_size: null,
        cover_kind: null,
        last_page: null,
      };
    });
  tables.pages = [];
  tables.annotations = [];
  tables.bookmarks = [];
  tables.submissions = [];
  tables.deadlines = json.tables.deadlines.map((d) => ({ ...d, done_submission_id: null }));
  return { ...json, tables };
}

// The zip entries each incoming document needs, and where they go.
function plannedEntries(backup: OpenedBackup, plan: ImportPlan, entries: ZipEntry[]): Map<string, { entry: ZipEntry; target: string }[]> {
  const byDocument = new Map<string, { entry: ZipEntry; target: string }[]>();
  for (const entry of entries) {
    const target = targetPathForEntry(plan, backup.manifest, entry.name);
    if (!target) continue;
    const documentId = target.split('/')[1];
    const list = byDocument.get(documentId) ?? [];
    list.push({ entry, target });
    byDocument.set(documentId, list);
  }
  return byDocument;
}

export async function previewRestore(backup: OpenedBackup, mode: ImportMode): Promise<RestorePreview> {
  const db = await getDb();
  const plan = importPlan(backup.manifest, backup.json, await loadCurrentLibrary(db), mode);
  const reader = openZip(backup.file);
  let bytesNeeded = 0;
  try {
    for (const files of plannedEntries(backup, plan, reader.entries).values()) for (const { entry } of files) bytesNeeded += entry.size;
  } finally {
    reader.close();
  }
  const space = checkSpaceFor(bytesNeeded);
  return { plan, bytesNeeded, freeBytes: space.freeBytes, fits: space.level !== 'critical' };
}

export async function applyRestore(
  backup: OpenedBackup,
  preview: RestorePreview,
  options: {
    onProgress?: (progress: RestoreProgress) => void;
    signal?: AbortSignal;
    // Full restores: also bring back the saved signature, when this phone has none.
    restoreSignature?: boolean;
  } = {}
): Promise<RestoreResult> {
  const { plan } = preview;
  const space = checkSpaceFor(preview.bytesNeeded);
  if (space.level === 'critical') throw new RestoreSpaceError(preview.bytesNeeded, space.freeBytes);

  const incoming = libraryDir(INCOMING);
  if (incoming.exists) incoming.delete();
  incoming.create({ intermediates: true });

  const moved: Directory[] = [];
  let signatureRestored = false;
  try {
    // 3. Stage every file, one document at a time.
    const reader = openZip(backup.file);
    try {
      const byDocument = plannedEntries(backup, plan, reader.entries);
      const progress: RestoreProgress = {
        bytesDone: 0,
        bytesTotal: preview.bytesNeeded,
        documentsDone: 0,
        documentsTotal: byDocument.size,
      };
      options.onProgress?.({ ...progress });
      for (const files of byDocument.values()) {
        for (const { entry, target } of files) {
          if (options.signal?.aborted) throw new ZipAbortedError();
          const before = progress.bytesDone;
          // library/<id>/<rel> -> library/.incoming/<id>/<rel>
          await extractToFile(reader, entry, new File(incoming, target.slice('library/'.length)), {
            signal: options.signal,
            onProgress: (copied) => {
              progress.bytesDone = before + copied;
              options.onProgress?.({ ...progress });
            },
          });
          progress.bytesDone = before + entry.size;
        }
        progress.documentsDone += 1;
        options.onProgress?.({ ...progress });
      }
      const signatureHere = new Directory(Paths.document, 'signature');
      if (options.restoreSignature && !signatureHere.exists) {
        for (const entry of reader.entries) {
          const name = entry.name.slice('signature/'.length);
          if (!entry.name.startsWith('signature/') || !name || name.includes('/')) continue;
          await extractToFile(reader, entry, new File(incoming, SIGNATURE_STAGE, name), { signal: options.signal });
        }
      }
    } finally {
      reader.close();
    }

    // 4. Rows and folders together.
    const db = await getDb();
    await withWriteLock(() =>
      db.withTransactionAsync(async () => {
        await insertRows(db, plan.tables);
        for (const decision of plan.documents) {
          if (decision.action === 'skip') continue;
          const staged = new Directory(incoming, decision.targetId);
          if (!staged.exists) continue;
          const dest = libraryDir(decision.targetId);
          // A folder with this id but no row (left over from a crash): out of the way, to the trash.
          if (dest.exists) dest.moveSync(libraryDir('.trash', `${Date.now()}_${decision.targetId}`));
          staged.moveSync(dest);
          moved.push(dest);
        }
      })
    );
    const stagedSignature = new Directory(incoming, SIGNATURE_STAGE);
    if (stagedSignature.exists) {
      stagedSignature.moveSync(new Directory(Paths.document, 'signature'));
      signatureRestored = true;
    }
  } catch (error) {
    // The transaction rolled back; take back the folders it had already moved.
    for (const dir of moved) {
      try {
        if (dir.exists) dir.delete();
      } catch (cleanupError) {
        console.warn('restore: could not remove', dir.uri, cleanupError);
      }
    }
    throw error;
  } finally {
    if (incoming.exists) incoming.delete();
  }

  const remindersScheduled = await rescheduleDeadlines(plan).catch((error) => {
    console.warn('restore: rescheduling reminders failed', error);
    return 0;
  });
  return { plan, remindersScheduled, signatureRestored };
}

// Reminders live in the phone's OS, not in the backup: open deadlines that came in and are still
// ahead get theirs scheduled again (when notifications are allowed), and their new ids are stored.
async function rescheduleDeadlines(plan: ImportPlan, now = Date.now()): Promise<number> {
  const due = plan.tables.deadlines.filter((d) => !d.done_submission_id && Number(d.due_at) > now);
  if (due.length === 0 || !(await ensureNotificationPermission().catch(() => false))) return 0;
  const db = await getDb();
  let scheduled = 0;
  for (const row of due) {
    const course = await db.getFirstAsync<{ name: string; code: string | null }>('SELECT name, code FROM courses WHERE id = ?', [
      String(row.course_id),
    ]);
    const ids = await scheduleReminders(
      {
        id: String(row.id),
        courseId: String(row.course_id),
        title: String(row.title),
        dueAt: Number(row.due_at),
        reminderIds: [],
        doneSubmissionId: undefined,
      },
      course?.code || course?.name || ''
    );
    await withWriteLock(() => db.runAsync('UPDATE deadlines SET reminder_ids = ? WHERE id = ?', [JSON.stringify(ids), String(row.id)]));
    if (ids.length > 0) scheduled += 1;
  }
  return scheduled;
}

// For callers that want the cancel error by name.
export { ZipAbortedError as RestoreCancelledError };
