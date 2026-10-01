import { Directory, File, Paths } from 'expo-file-system';
import type { LibraryDocument } from '../../types/models';
import { extractDocumentText } from './textSelection';

// §5 T3 "Extract text": the document's OCR text as a .txt file in the cache, for sharing
// (shareService.shareAs gives it the document's name). Replaces an earlier export of it.
export function writeDocumentText(doc: Pick<LibraryDocument, 'id' | 'pages'>): string {
  const dir = new Directory(Paths.cache, 'extract');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${doc.id}.txt`);
  if (file.exists) file.delete();
  file.write(extractDocumentText(doc));
  return file.uri;
}
