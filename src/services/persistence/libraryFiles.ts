import { Directory, File, Paths } from 'expo-file-system';

export function getDocumentDir(documentId: string): Directory {
  const dir = new Directory(Paths.document, 'library', documentId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function deleteDocumentFiles(documentId: string): void {
  const dir = new Directory(Paths.document, 'library', documentId);
  if (dir.exists) dir.delete();
}

// Deletes cache-resident files by explicit URI (session discarded, or superseded by copies
// written elsewhere, e.g. into a permanent library document dir). Takes explicit URIs rather
// than sweeping Paths.cache wholesale — other features (skiaEnhance's bakeEnhance, etc.) also
// write there, and a blind sweep could delete files still in use.
export function cleanTemporaryCache(uris: string[]): void {
  uris.forEach((uri) => {
    const file = new File(uri);
    if (file.exists) file.delete();
  });
}
