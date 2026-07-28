import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { LibraryDocument } from '../../types/models';

// expo-sharing shares exactly one file per call. A multi-page JPG document has no single
// combined file, so sharing it shares only its first page, with the caller responsible for
// surfacing that as a visible note rather than silently doing something unexpected.
export async function shareDocument(doc: LibraryDocument): Promise<void> {
  const uri = doc.format === 'PDF' ? doc.pdfUri : doc.pages[0]?.fileUri;
  if (!uri) return;
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  await Sharing.shareAsync(uri, {
    mimeType: doc.format === 'PDF' ? 'application/pdf' : 'image/jpeg',
    dialogTitle: doc.name,
  });
}

export async function shareFileUri(uri: string, mimeType: string, dialogTitle?: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

export async function printDocument(doc: LibraryDocument): Promise<void> {
  if (doc.format === 'PDF' && doc.pdfUri) {
    await Print.printAsync({ uri: doc.pdfUri });
  } else if (doc.pages[0]) {
    await Print.printAsync({ uri: doc.pages[0].fileUri });
  }
}
