import { Directory, Paths } from 'expo-file-system';

export function getDocumentDir(documentId: string): Directory {
  const dir = new Directory(Paths.document, 'library', documentId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function deleteDocumentFiles(documentId: string): void {
  const dir = new Directory(Paths.document, 'library', documentId);
  if (dir.exists) dir.delete();
}
