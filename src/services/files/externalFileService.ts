import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues (see pdfService.ts's matching import)
import { Directory, File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { createId } from '../../utils/id';
import { detectDocFormat, EXTENSION_BY_FORMAT, isLegacyWordDoc } from '../../utils/docFormat';
import type { DocFormat, ExternalFileDocument } from '../../types/models';

const EXTERNAL_OPEN_ROOT = 'external-open';

function deriveName(sourceUri: string, format: DocFormat, originalFileName?: string): string {
  const extPattern = new RegExp(`${EXTENSION_BY_FORMAT[format].replace('.', '\\.')}$`, 'i');
  if (originalFileName) return originalFileName.replace(extPattern, '');
  const last = decodeURIComponent(sourceUri.split('/').pop() ?? 'Document');
  return last.replace(extPattern, '');
}

function findSourceFile(dir: Directory): File | undefined {
  return dir.list().find((entry): entry is File => entry instanceof File && entry.name.startsWith('source'));
}

// §7 R5: an old binary Word file (.doc). There's no viewer for it, so it's refused before it is
// copied, and the message says what to do instead.
export class LegacyWordDocError extends Error {
  constructor() {
    super('Legacy .doc files are not supported');
    this.name = 'LegacyWordDocError';
  }
}

// Copies an arbitrary file (from expo-document-picker, an OS "Open with" intent, or a share-target)
// into a stable app-owned local path and returns a lightweight, never-persisted description of it.
// Always copies, even for the in-app picker's already-app-owned cache URI - the OS "Open with"/
// share-to-app entry points can hand us an ephemeral content:// / security-scoped grant that stops
// resolving once the source app's process dies, so one uniform copy step is what's actually robust.
export async function importExternalFile(
  sourceUri: string,
  opts?: { originalFileName?: string; mimeType?: string }
): Promise<ExternalFileDocument> {
  if (isLegacyWordDoc(sourceUri, opts)) throw new LegacyWordDocError();
  const format = detectDocFormat(sourceUri, opts) ?? 'PDF';
  const id = createId('extfile');
  const dir = new Directory(Paths.document, EXTERNAL_OPEN_ROOT, id);
  await dir.create({ intermediates: true });
  const dest = new File(dir, `source${EXTENSION_BY_FORMAT[format]}`);

  const src = new File(sourceUri);
  await src.copy(dest);

  let pageCount: number | undefined;
  if (format === 'PDF') {
    try {
      const bytes = await dest.bytes();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } catch (e) {
      // Best-effort only - a genuinely password-encrypted PDF (or a malformed one) can fail here
      // even with ignoreEncryption:true. The PDF engine's own onLoadComplete/onError is the real
      // source of truth once the reader actually mounts the file.
      console.warn('importExternalFile: pdf-lib page-count probe failed (may be encrypted)', e);
    }
  }

  return {
    uri: dest.uri,
    name: deriveName(sourceUri, format, opts?.originalFileName),
    format,
    sizeBytes: dest.size ?? 0,
    sourceUri,
    importedAt: Date.now(),
    pageCount,
  };
}

// Housekeeping so external-open/ doesn't grow unbounded across repeated "Open with" launches that
// never get promoted to the library. Not safety-critical - best-effort, called opportunistically.
// Directory instances have no modificationTime of their own in this expo-file-system version
// (only File does), so recency is read off each entry's source<ext> file instead.
export function pruneExternalOpens(keepMostRecent = 5): void {
  const root = new Directory(Paths.document, EXTERNAL_OPEN_ROOT);
  if (!root.exists) return;
  const entries = root
    .list()
    .filter((entry): entry is Directory => entry instanceof Directory)
    .sort((a, b) => {
      const aTime = findSourceFile(a)?.lastModified ?? 0;
      const bTime = findSourceFile(b)?.lastModified ?? 0;
      return bTime - aTime;
    });
  entries.slice(keepMostRecent).forEach((entry) => entry.delete());
}
