import { Directory, File, Paths } from 'expo-file-system';
import type { LibraryDocument } from '../../types/models';
import { extractDocumentText } from './textSelection';

// `text` as a .txt file in the cache, for sharing (shareService.shareAs gives it the name the
// student sees). Replaces an earlier export under the same `key`.
export function writeExportText(key: string, text: string): string {
  const dir = new Directory(Paths.cache, 'extract');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${key}.txt`);
  if (file.exists) file.delete();
  file.write(text);
  return file.uri;
}

// §5 T3 "Extract text": the document's OCR text.
export function writeDocumentText(doc: Pick<LibraryDocument, 'id' | 'pages'>): string {
  return writeExportText(doc.id, extractDocumentText(doc));
}
