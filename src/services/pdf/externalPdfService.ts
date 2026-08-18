import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues (see pdfService.ts's matching import)
import { Directory, File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { createId } from '../../utils/id';
import type { ExternalPdfDocument } from '../../types/models';

const EXTERNAL_OPEN_ROOT = 'external-open';

function deriveName(sourceUri: string, originalFileName?: string): string {
  if (originalFileName) return originalFileName.replace(/\.pdf$/i, '');
  const last = decodeURIComponent(sourceUri.split('/').pop() ?? 'Document');
  return last.replace(/\.pdf$/i, '');
}

// Copies an arbitrary PDF (from expo-document-picker, an OS "Open with" intent, or a share-target)
// into a stable app-owned local path and returns a lightweight, never-persisted description of it.
// Always copies, even for the in-app picker's already-app-owned cache URI - the OS "Open with"/
// share-to-app entry points can hand us an ephemeral content:// / security-scoped grant that stops
// resolving once the source app's process dies, so one uniform copy step is what's actually robust.
export async function importExternalPdf(
  sourceUri: string,
  opts?: { originalFileName?: string }
): Promise<ExternalPdfDocument> {
  const id = createId('extpdf');
  const dir = new Directory(Paths.document, EXTERNAL_OPEN_ROOT, id);
  dir.create({ intermediates: true });
  const dest = new File(dir, 'source.pdf');

  const src = new File(sourceUri);
  src.copy(dest);

  let pageCount: number | undefined;
  try {
    const bytes = await dest.bytes();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
  } catch (e) {
    // Best-effort only - a genuinely password-encrypted PDF (or a malformed one) can fail here
    // even with ignoreEncryption:true. The PDF engine's own onLoadComplete/onError is the real
    // source of truth once the reader actually mounts the file.
    console.warn('importExternalPdf: pdf-lib page-count probe failed (may be encrypted)', e);
  }

  return {
    uri: dest.uri,
    name: deriveName(sourceUri, opts?.originalFileName),
    sizeBytes: dest.size ?? 0,
    sourceUri,
    importedAt: Date.now(),
    pageCount,
  };
}

// Housekeeping so external-open/ doesn't grow unbounded across repeated "Open with" launches that
// never get promoted to the library. Not safety-critical - best-effort, called opportunistically.
export function pruneExternalOpens(keepMostRecent = 5): void {
  const root = new Directory(Paths.document, EXTERNAL_OPEN_ROOT);
  if (!root.exists) return;
  const entries = root
    .list()
    .filter((entry): entry is Directory => entry instanceof Directory)
    .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
  entries.slice(keepMostRecent).forEach((entry) => entry.delete());
}
