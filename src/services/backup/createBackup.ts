import { Directory, File, Paths } from 'expo-file-system';
import { APP_VERSION } from '../../config/appInfo';
import { tDoc } from '../../i18n';
import { toLocalDateString } from '../../utils/localDate';
import { sanitizeFileName } from '../../utils/sanitize';
import { getDb } from '../persistence/dbService';
import { getSchemaVersion } from '../persistence/migrations';
import { loadSettings, type PersistedSettings } from '../persistence/settingsStorage';
import { checkSpaceFor } from '../storage/usage';
import { buildManifest, exportRows, LIBRARY_ENTRY, MANIFEST_ENTRY, SETTINGS_ENTRY, type BackupKind, type BackupScope, type Manifest } from './format';
import { addFileFromDisk, createZip, ZipAbortedError } from './zip';

// §8 B3: makes a backup or export zip in Paths.cache/backup/, one document at a time, with
// progress and cancel. Where it goes next (share sheet, an Android folder) is the caller's
// business; the cache copy is deleted once it has been handed over (discardBackup).

export type BackupInclude = 'everything' | 'pdfsOnly';

export type BackupRequest = {
  scope: BackupScope;
  // 'pdfsOnly': just the readable PDFs (and Office originals) plus manifest.json and
  // library.json - much smaller, opens anywhere, and still imports later as imported PDFs.
  include: BackupInclude;
  // The course name for a course export's file name.
  courseName?: string;
  // §8 B5: automatic backups get their own name, so they're told apart in the folder.
  automatic?: boolean;
};

export type BackupProgress = {
  bytesDone: number;
  bytesTotal: number;
  documentsDone: number;
  documentsTotal: number;
};

export type BackupResult = {
  file: File;
  fileName: string;
  bytes: number;
  manifest: Manifest;
};

// Not enough space for the zip: stops before writing anything (B1's 50 MB floor, after the zip).
export class BackupSpaceError extends Error {
  constructor(
    readonly bytesNeeded: number,
    readonly freeBytes: number | null
  ) {
    super('Not enough space for the backup');
    this.name = 'BackupSpaceError';
  }
}

// One backup at a time: they share cache/backup/ (each empties it first). A second one - an
// automatic backup starting while the student backs up by hand - is refused, not queued.
export class BackupBusyError extends Error {
  constructor() {
    super('A backup is already running');
    this.name = 'BackupBusyError';
  }
}
let running = false;

export function backupDir(): Directory {
  return new Directory(Paths.cache, 'backup');
}

function kindOf(scope: BackupScope): BackupKind {
  return scope.kind === 'all' ? 'full' : scope.kind === 'courses' ? 'course' : 'documents';
}

// "PDF Scan backup 2026-10-02.zip", "Chemistry 2026-10-02.zip", "PDF Scan documents 2026-10-02.zip".
export function backupFileName(request: Pick<BackupRequest, 'scope' | 'courseName' | 'automatic'>, now: number): string {
  const date = toLocalDateString(now);
  if (request.automatic) return `${sanitizeFileName(tDoc('document.autoBackupFileName', { date }))}.zip`;
  const kind = kindOf(request.scope);
  const base =
    kind === 'full'
      ? tDoc('document.backupFileName', { date })
      : kind === 'course' && request.courseName
        ? tDoc('document.courseExportFileName', { course: request.courseName, date })
        : tDoc('document.documentsExportFileName', { date });
  return `${sanitizeFileName(base) || tDoc('document.backupFileName', { date })}.zip`;
}

// The settings a full backup carries: the student's choices. Left out: crash reporting (opt-in
// is asked again on a new phone), folder permissions and anything else tied to this device or
// this install (first run, scanner availability, the last opened document, backup history).
const BACKED_UP_SETTINGS = [
  'themePref',
  'ocrScript',
  'defaultEnhanceByMode',
  'lastCaptureMode',
  'profile',
  'nameTemplate',
  'profilePrompted',
  'unsortedPromptDone',
  'uiLanguage',
  'documentLanguage',
] as const satisfies readonly (keyof PersistedSettings)[];

export async function backedUpSettings(): Promise<Partial<PersistedSettings> | null> {
  const settings = await loadSettings();
  if (!settings) return null;
  const out: Partial<PersistedSettings> = {};
  for (const key of BACKED_UP_SETTINGS) {
    if (settings[key] !== undefined) (out as Record<string, unknown>)[key] = settings[key];
  }
  return out;
}

// The saved signature (Paths.document/signature/), in full backups only.
function signatureFiles(): { zipPath: string; file: File }[] {
  const dir = new Directory(Paths.document, 'signature');
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({ zipPath: `signature/${file.name}`, file }));
}

// Zip headers and the central directory: a little per file, on top of the files themselves.
const ZIP_OVERHEAD_PER_FILE = 200;

type CreateBackupOptions = { onProgress?: (progress: BackupProgress) => void; signal?: AbortSignal; now?: number };

export async function createBackup(request: BackupRequest, options: CreateBackupOptions = {}): Promise<BackupResult> {
  if (running) throw new BackupBusyError();
  running = true;
  try {
    return await writeBackup(request, options);
  } finally {
    running = false;
  }
}

async function writeBackup(request: BackupRequest, options: CreateBackupOptions): Promise<BackupResult> {
  const now = options.now ?? Date.now();
  const db = await getDb();
  const exported = await exportRows(db, request.scope, await getSchemaVersion(db));
  const pdfsOnly = request.include === 'pdfsOnly';
  // PDFs only: the readable copies; everything under data/ stays behind.
  const files = pdfsOnly ? exported.files.filter((file) => !file.zipPath.startsWith('data/')) : exported.files;
  const bytesTotal = files.reduce((sum, file) => sum + file.bytes, 0);
  const manifest = buildManifest(
    { ...exported, counts: { ...exported.counts, bytes: bytesTotal } },
    { kind: kindOf(request.scope), appVersion: APP_VERSION, createdAt: now, restorable: pdfsOnly ? 'pdfs' : 'full' }
  );

  // A full backup also brings the student's settings and saved signature.
  const full = request.scope.kind === 'all' && !pdfsOnly;
  const settings = full ? await backedUpSettings() : null;
  const signature = full ? signatureFiles() : [];
  const json = JSON.stringify(exported.libraryJson);
  const bytesNeeded = bytesTotal + json.length * 2 + files.length * ZIP_OVERHEAD_PER_FILE;
  const space = checkSpaceFor(bytesNeeded);
  if (space.level === 'critical') throw new BackupSpaceError(bytesNeeded, space.freeBytes);

  // One backup in the cache at a time: any earlier one was handed over (or abandoned) already.
  const dir = backupDir();
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const fileName = backupFileName(request, now);
  const dest = new File(dir, fileName);

  const documentIds = [...new Set(files.map((file) => file.documentId))];
  const progress: BackupProgress = { bytesDone: 0, bytesTotal, documentsDone: 0, documentsTotal: documentIds.length };
  options.onProgress?.({ ...progress });

  const writer = createZip(dest, { modified: new Date(now) });
  try {
    writer.addJson(MANIFEST_ENTRY, manifest);
    writer.addJson(LIBRARY_ENTRY, exported.libraryJson);
    if (settings) writer.addJson(SETTINGS_ENTRY, settings);
    for (const { zipPath, file } of signature) await addFileFromDisk(writer, zipPath, file, { signal: options.signal });
    // exportRows lists files document by document, so a document is done when the next starts.
    let currentDoc: string | null = null;
    for (const file of files) {
      if (options.signal?.aborted) throw new ZipAbortedError();
      if (currentDoc !== null && file.documentId !== currentDoc) progress.documentsDone += 1;
      currentDoc = file.documentId;
      const before = progress.bytesDone;
      await addFileFromDisk(writer, file.zipPath, new File(file.uri), {
        signal: options.signal,
        onProgress: (copied) => {
          progress.bytesDone = before + copied;
          options.onProgress?.({ ...progress });
        },
      });
      progress.bytesDone = before + file.bytes;
    }
    progress.documentsDone = documentIds.length;
    options.onProgress?.({ ...progress });
    const bytes = writer.finish();
    return { file: dest, fileName, bytes, manifest };
  } catch (error) {
    writer.abort();
    if (dest.exists) dest.delete();
    throw error;
  }
}

// Deletes the cache copy once it has been shared or saved.
export function discardBackup(result: Pick<BackupResult, 'file'>): void {
  try {
    if (result.file.exists) result.file.delete();
  } catch (error) {
    console.warn('discardBackup: could not delete', error);
  }
}
