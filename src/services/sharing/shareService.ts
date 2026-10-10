import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { annotatedPdfFor } from '../annotations/exportPdf';
import { isPageRasterFormat } from '../documents/formatCapabilities';
import { MIME_BY_FORMAT } from '../../utils/docFormat';
import { sanitizeFileName } from '../../utils/sanitize';
import type { Annotation, LibraryDocument } from '../../types/models';

const FALLBACK_FILE_NAME = 'document';

function shareDir(): Directory {
  return new Directory(Paths.cache, 'share');
}

// Library files are stored under fixed names (library/<docId>/document.pdf, page_1.jpg), and
// the receiving app names the file after the URI, so the teacher used to get `document.pdf`.
// This shares a copy named `fileName` (with its extension, e.g. `HW3.pdf`) from
// cache/share/ instead. The folder is emptied first: by the next share the previous copy has
// long been handed over, and this keeps at most one share's copy on disk.
export async function shareAs(uri: string, fileName: string, mimeType: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  const dir = shareDir();
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const copy = new File(dir, fileName);
  new File(uri).copySync(copy);
  await Sharing.shareAsync(copy.uri, { mimeType, dialogTitle: fileName });
}

// `<name>.<ext>` for a document name, safe to hand to another app; `suffix` tells pages apart
// (`HW3_1.jpg`).
export function shareFileName(name: string, extension: string, suffix = ''): string {
  return `${sanitizeFileName(name) || FALLBACK_FILE_NAME}${suffix}.${extension}`;
}

// expo-sharing shares exactly one file per call. A multi-page JPG document has no single
// combined file, so sharing it shares only its first page, with the caller responsible for
// surfacing that as a visible note rather than silently doing something unexpected.
// §18 W14: a PDF goes out with the document's marks and signatures written in (`annotations`:
// the library's; annotations/exportPdf keeps the copy).
export async function shareDocument(doc: LibraryDocument, annotations: readonly Annotation[] = []): Promise<void> {
  const uri = doc.format === 'PDF' ? await annotatedPdfFor(doc, annotations) : isPageRasterFormat(doc.format) ? doc.pages[0]?.fileUri : doc.contentUri;
  if (!uri) return;
  const suffix = doc.format === 'JPG' && doc.pages.length > 1 ? '_1' : '';
  await shareAs(uri, shareFileName(doc.name, doc.format.toLowerCase(), suffix), MIME_BY_FORMAT[doc.format]);
}

export async function shareFileUri(uri: string, mimeType: string, dialogTitle?: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

export async function printDocument(doc: LibraryDocument, annotations: readonly Annotation[] = []): Promise<void> {
  const pdf = doc.format === 'PDF' ? await annotatedPdfFor(doc, annotations) : undefined;
  if (pdf) {
    await Print.printAsync({ uri: pdf });
  } else if (isPageRasterFormat(doc.format) && doc.pages[0]) {
    await Print.printAsync({ uri: doc.pages[0].fileUri });
  } else if (doc.contentUri) {
    await Print.printAsync({ uri: doc.contentUri });
  }
}

export async function printFileUri(uri: string): Promise<void> {
  await Print.printAsync({ uri });
}
