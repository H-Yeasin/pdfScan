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

// §18 W14: a PDF goes out with the document's marks and signatures written in (`annotations`:
// the library's; annotations/exportPdf keeps the copy). §18 W23: a JPG-format document goes out
// whole, every page (shareDocumentImages), not only its first.
export async function shareDocument(doc: LibraryDocument, annotations: readonly Annotation[] = []): Promise<void> {
  if (doc.format === 'JPG') return shareDocumentImages(doc);
  const uri = doc.format === 'PDF' ? await annotatedPdfFor(doc, annotations) : isPageRasterFormat(doc.format) ? doc.pages[0]?.fileUri : doc.contentUri;
  if (!uri) return;
  await shareAs(uri, shareFileName(doc.name, doc.format.toLowerCase()), MIME_BY_FORMAT[doc.format]);
}

// §18 W23: the page images of a JPG-format document. expo-sharing hands over one file per call, so
// one page goes as itself and more go as one zip of them (`HW3_1.jpg`, `HW3_2.jpg`, ...). Marks
// and signatures are rows beside the images: Share as PDF is the copy that carries them.
export async function shareDocumentImages(doc: LibraryDocument): Promise<void> {
  const pages = doc.pages.filter((p) => !!p.fileUri);
  if (pages.length === 0) return;
  if (pages.length === 1) {
    await shareAs(pages[0].fileUri, shareFileName(doc.name, 'jpg'), 'image/jpeg');
    return;
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  const { addFileFromDisk, createZip } = require('../backup/zip') as typeof import('../backup/zip');
  const dir = shareDir();
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const fileName = shareFileName(doc.name, 'zip');
  const dest = new File(dir, fileName);
  const writer = createZip(dest);
  try {
    // One page at a time (memory on mid-range phones).
    for (let i = 0; i < pages.length; i++) {
      await addFileFromDisk(writer, shareFileName(doc.name, 'jpg', `_${i + 1}`), new File(pages[i].fileUri));
    }
    writer.finish();
  } catch (error) {
    writer.abort();
    if (dest.exists) dest.delete();
    throw error;
  }
  await Sharing.shareAsync(dest.uri, { mimeType: 'application/zip', dialogTitle: fileName });
}

export async function shareFileUri(uri: string, mimeType: string, dialogTitle?: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

// §18 W23: a JPG-format document prints every page, through the PDF made of them (built now when
// it has none; annotatedPdfFor), with its marks; its first page only if that can't be made.
export async function printDocument(doc: LibraryDocument, annotations: readonly Annotation[] = []): Promise<void> {
  const pdf = isPageRasterFormat(doc.format) ? await annotatedPdfFor(doc, annotations) : undefined;
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
