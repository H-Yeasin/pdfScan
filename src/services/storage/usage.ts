import { Directory, Paths } from 'expo-file-system';
import type { LibraryDocument } from '../../types/models';
import { getDb } from '../persistence/dbService';
import { loadDiskBytes, saveDiskBytes } from '../persistence/libraryRepo';
import { pruneExternalOpens } from '../files/externalFileService';

// §8 B1: how much space the app uses, where, and how much the phone has left.

const MB = 1024 * 1024;
// Under this much free space (after what's about to be written) the student is warned before a
// scan or a save, with a way to free some.
export const LOW_SPACE_BYTES = 300 * MB;
// Under this much a save stops instead: a half-written document is worse than none, and the
// session is kept, so nothing is lost.
export const CRITICAL_SPACE_BYTES = 50 * MB;
// What one saved page roughly takes in the library: a 2400 px master, its display copy, the
// thumbnail and its share of the PDF. Generous on purpose - it's only for the space check.
export const BYTES_PER_SAVED_PAGE = 3 * MB;

// Paths.cache folders only this app writes to, safe to empty whenever no work is running.
// 'backup' (§8 B3) holds a zip only until it is shared or saved; one left behind by a crash is
// the biggest thing in the cache.
const OWNED_CACHE_FOLDERS = ['share', 'extract', 'pdf-ops', 'pdf-native', 'backup'];
// Where an open scan session's images live (expo-image-manipulator's output, and the loose
// render/crop/merge files in Paths.cache itself): only emptied when there is no session.
const SESSION_CACHE_FOLDERS = ['ImageManipulator'];
const LOOSE_CACHE_FILE = /\.(jpe?g|png|pdf)$/i;

// Yields to the JS event loop between documents, so measuring a big library never blocks the UI.
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function folderBytes(dir: Directory): number {
  if (!dir.exists) return 0;
  try {
    return dir.size ?? 0;
  } catch {
    return 0;
  }
}

function cacheBytes(): number {
  const cache = Paths.cache;
  if (!cache.exists) return 0;
  let total = 0;
  for (const entry of cache.list()) total += entry instanceof Directory ? folderBytes(entry) : entry.size ?? 0;
  return total;
}

// null when the platform can't say (the space check then lets everything through).
export function freeDiskBytes(): number | null {
  try {
    const free = Paths.availableDiskSpace;
    return Number.isFinite(free) && free > 0 ? free : null;
  } catch {
    return null;
  }
}

export type CourseUsage = { courseId: string | null; bytes: number; documents: number };
export type DocumentUsage = { id: string; bytes: number };

export type StorageReport = {
  // Everything the app keeps: the database, the library, the signature, recently opened outside
  // files, and the caches.
  totalBytes: number;
  // Per course, biggest first. courseId null = Unsorted.
  byCourse: CourseUsage[];
  // Every document's folder, biggest first.
  documents: DocumentUsage[];
  // The library's other contents: trash (§8 B1 integrity) and folders not measured per document.
  otherLibraryBytes: number;
  cacheBytes: number;
  freeBytes: number | null;
};

// Sizes come from documents.disk_bytes where it's still valid; a document saved or edited since
// it was last measured is measured now (one folder at a time) and the result cached.
export async function storageReport(documents: readonly LibraryDocument[]): Promise<StorageReport> {
  const db = await getDb();
  const cached = await loadDiskBytes(db);

  const perDocument: DocumentUsage[] = [];
  for (const doc of documents) {
    let bytes = cached.get(doc.id) ?? null;
    if (bytes === null) {
      bytes = folderBytes(new Directory(Paths.document, 'library', doc.id));
      // Only documents with a row; one not saved yet is measured again next time.
      if (cached.has(doc.id)) await saveDiskBytes(db, doc.id, bytes);
      await breathe();
    }
    perDocument.push({ id: doc.id, bytes });
  }

  const byCourseId = new Map<string | null, CourseUsage>();
  documents.forEach((doc, i) => {
    const key = doc.courseId ?? null;
    const usage = byCourseId.get(key) ?? { courseId: key, bytes: 0, documents: 0 };
    usage.bytes += perDocument[i].bytes;
    usage.documents += 1;
    byCourseId.set(key, usage);
  });

  const documentsTotal = perDocument.reduce((sum, d) => sum + d.bytes, 0);
  const libraryBytes = folderBytes(new Directory(Paths.document, 'library'));
  const caches = cacheBytes();
  const otherAppBytes =
    folderBytes(new Directory(Paths.document, 'SQLite')) +
    folderBytes(new Directory(Paths.document, 'signature')) +
    folderBytes(new Directory(Paths.document, 'external-open'));

  return {
    totalBytes: Math.max(libraryBytes, documentsTotal) + otherAppBytes + caches,
    byCourse: [...byCourseId.values()].sort((a, b) => b.bytes - a.bytes),
    documents: [...perDocument].sort((a, b) => b.bytes - a.bytes),
    otherLibraryBytes: Math.max(0, libraryBytes - documentsTotal),
    cacheBytes: caches,
    freeBytes: freeDiskBytes(),
  };
}

// Empties the caches the app owns and prunes recently opened outside files. With a scan session
// open (`sessionActive`), its images stay: only the folders no session uses are emptied.
// Returns roughly how many bytes were freed.
export function cleanCaches({ sessionActive }: { sessionActive: boolean }): number {
  const before = cacheBytes() + folderBytes(new Directory(Paths.document, 'external-open'));
  const cache = Paths.cache;
  if (cache.exists) {
    for (const entry of cache.list()) {
      const owned = entry instanceof Directory
        ? OWNED_CACHE_FOLDERS.includes(entry.name) || (!sessionActive && SESSION_CACHE_FOLDERS.includes(entry.name))
        : !sessionActive && LOOSE_CACHE_FILE.test(entry.name);
      if (!owned) continue;
      try {
        entry.delete();
      } catch (error) {
        console.warn('cleanCaches: could not delete', entry.name, error);
      }
    }
  }
  pruneExternalOpens();
  const after = cacheBytes() + folderBytes(new Directory(Paths.document, 'external-open'));
  return Math.max(0, before - after);
}

export type SpaceLevel = 'ok' | 'low' | 'critical';

// The thresholds alone, so they can be tested without a disk.
export function spaceLevel(freeBytes: number | null, bytesNeeded: number): SpaceLevel {
  if (freeBytes === null) return 'ok';
  const left = freeBytes - bytesNeeded;
  if (left < CRITICAL_SPACE_BYTES) return 'critical';
  if (left < LOW_SPACE_BYTES) return 'low';
  return 'ok';
}

// Before a scan (bytesNeeded 0) and before a save (BYTES_PER_SAVED_PAGE per page): 'low' warns
// with a "Free up space" button, 'critical' stops a save.
export function checkSpaceFor(bytesNeeded: number): { level: SpaceLevel; freeBytes: number | null } {
  const freeBytes = freeDiskBytes();
  return { level: spaceLevel(freeBytes, bytesNeeded), freeBytes };
}
