import { Directory, File, Paths } from 'expo-file-system';
import { interruptedWriteTarget } from '../files/atomicWrite';
import type { LibraryDocument } from '../../types/models';

// §8 B1: keeps the library's files and rows in step. Two things go wrong on a phone:
// - a crash between writing a document's folder and saving its row leaves a folder nothing points
//   at (it only takes space);
// - a folder deleted by hand, a cleaner app, or a partial Android restore (Auto Backup brings back
//   the database without the files, or the other way round) leaves rows pointing at nothing.
// The first kind is moved to library/.trash/ and deleted a week later; the second is only
// flagged (documents.missing_files), never deleted - the student decides what to do with it.

const LIBRARY_SEGMENT = 'library';
const TRASH_SEGMENT = '.trash';
export const TRASH_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
// A folder written this recently may belong to a save that hasn't reached the database yet (the
// row is written after the files), so it isn't called left over until it has been quiet a while.
export const ORPHAN_MIN_AGE_MS = 15 * 60 * 1000;

function libraryRoot(): Directory {
  return new Directory(Paths.document, LIBRARY_SEGMENT);
}

export function trashDir(): Directory {
  return new Directory(Paths.document, LIBRARY_SEGMENT, TRASH_SEGMENT);
}

// Folders in library/ that aren't document folders: '.trash' and B4's '.incoming' (anything
// starting with a dot), and 'Courses', the pre-flat layout that the legacy import empties.
function isDocumentFolderName(name: string): boolean {
  return !name.startsWith('.') && name !== 'Courses';
}

// Yields to the JS event loop between folders, so a large library's check never blocks the UI.
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fileExists(uri: string | undefined): boolean {
  if (!uri) return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

// The files a document can't be shown or rebuilt without: its PDF, the original of an Office file,
// and each scanned page's master. Thumbnails and display copies aren't checked - losing them
// only costs a picture. Imported PDFs' pages have no master (fileUri '').
export function documentFilesMissing(doc: LibraryDocument): boolean {
  if (!fileExists(doc.pdfUri) || !fileExists(doc.contentUri)) return true;
  return doc.pages.some((page) => page.fileUri !== '' && !fileExists(page.fileUri));
}

function newestModified(dir: Directory): number {
  let newest = 0;
  for (const entry of dir.list()) {
    const time = entry instanceof Directory ? newestModified(entry) : (entry.lastModified ?? 0);
    if (time > newest) newest = time;
  }
  return newest;
}

// §18 W3: finishes or clears what files/atomicWrite left behind when the app was killed during a
// write. A `.<name>.tmp-<id>` file with no `<name>` next to it is the complete new file (the old
// one is deleted only after the new one is written), so it is moved into place. With `<name>`
// there, it is a write that never finished, and is deleted. Run before findOrphans, so a document
// whose PDF is waiting under its temporary name isn't flagged as missing files. Returns how many
// files were put back.
export async function recoverInterruptedWrites(): Promise<number> {
  const root = libraryRoot();
  if (!root.exists) return 0;
  let recovered = 0;
  for (const folder of root.list()) {
    if (!(folder instanceof Directory) || !isDocumentFolderName(folder.name)) continue;
    for (const entry of folder.list()) {
      if (!(entry instanceof File)) continue;
      const target = interruptedWriteTarget(entry.name);
      if (target === null) continue;
      try {
        const dest = new File(folder, target);
        if (dest.exists) {
          entry.delete();
        } else {
          entry.moveSync(dest);
          recovered += 1;
        }
      } catch (error) {
        console.warn('integrity: could not finish an interrupted write', folder.name, entry.name, error);
      }
    }
    await breathe();
  }
  return recovered;
}

export type IntegrityReport = {
  // Folder names in library/ with no document row (left over from a crash).
  orphanFolders: string[];
  // Documents whose files are missing and that aren't flagged yet.
  missing: string[];
  // Documents flagged missing whose files are back (e.g. a later restore brought them).
  restored: string[];
};

// `documents`: the library in memory. `rowIds`: the ids with a database row. A folder counts as
// left over only when neither knows it, so an unsaved document's files are never touched.
export async function findOrphans(
  documents: readonly LibraryDocument[],
  rowIds: ReadonlySet<string>,
  now = Date.now()
): Promise<IntegrityReport> {
  const report: IntegrityReport = { orphanFolders: [], missing: [], restored: [] };

  for (const doc of documents) {
    const missing = documentFilesMissing(doc);
    if (missing && !doc.missingFiles) report.missing.push(doc.id);
    else if (!missing && doc.missingFiles) report.restored.push(doc.id);
    await breathe();
  }

  const root = libraryRoot();
  if (!root.exists) return report;
  const known = new Set([...documents.map((d) => d.id), ...rowIds]);
  for (const entry of root.list()) {
    if (!(entry instanceof Directory) || !isDocumentFolderName(entry.name) || known.has(entry.name)) continue;
    // An empty folder takes no space and may be a save that has only just created it.
    const newest = newestModified(entry);
    if (newest === 0 || now - newest < ORPHAN_MIN_AGE_MS) continue;
    report.orphanFolders.push(entry.name);
    await breathe();
  }
  return report;
}

// Moves each left-over folder to library/.trash/<time>_<name>/ (the time it was moved, so the
// clean-up below needs no other record), then empties trash older than a week. Returns the
// missing-files flag changes for the caller to dispatch; rows are never deleted here.
export async function repair(
  report: IntegrityReport,
  now = Date.now()
): Promise<{ id: string; missingFiles: boolean }[]> {
  const trash = trashDir();
  for (const name of report.orphanFolders) {
    const folder = new Directory(libraryRoot(), name);
    if (!folder.exists) continue;
    if (!trash.exists) trash.create({ intermediates: true });
    try {
      folder.moveSync(new Directory(trash, `${now}_${name}`));
    } catch (error) {
      console.warn('integrity: could not move a left-over folder', name, error);
    }
    await breathe();
  }
  emptyOldTrash(now);
  return [
    ...report.missing.map((id) => ({ id, missingFiles: true })),
    ...report.restored.map((id) => ({ id, missingFiles: false })),
  ];
}

// Deletes trash entries moved there more than TRASH_KEEP_MS ago. An entry whose name doesn't
// start with a time wasn't put there by repair(), and is left alone.
export function emptyOldTrash(now = Date.now()): void {
  const trash = trashDir();
  if (!trash.exists) return;
  for (const entry of trash.list()) {
    const movedAt = Number(/^(\d+)_/.exec(entry.name)?.[1]);
    if (Number.isFinite(movedAt) && now - movedAt > TRASH_KEEP_MS) entry.delete();
  }
}
