import { Directory, File, Paths } from 'expo-file-system';
import { sanitizeFolderSegment } from '../../utils/sanitize';

const LIBRARY_SEGMENT = 'library';

// Every library document's files live in library/<documentId>/, whatever course it's filed under,
// so moving a document between courses never touches the filesystem.
export function getDocumentDir(documentId: string): Directory {
  const dir = new Directory(Paths.document, LIBRARY_SEGMENT, documentId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function deleteDocumentFiles(documentId: string): void {
  const dir = new Directory(Paths.document, LIBRARY_SEGMENT, documentId);
  if (dir.exists) dir.delete();
}

// Where a document filed under the old free-text "courseFolder" lived before every document moved
// to the flat layout. Only the one-time legacy import (legacyLibrary.ts) uses this; returns null
// when the name sanitizes to nothing, which always meant the flat layout.
export function legacyCourseDocumentDir(documentId: string, courseFolder: string): Directory | null {
  const segment = sanitizeFolderSegment(courseFolder);
  return segment ? new Directory(Paths.document, LIBRARY_SEGMENT, 'Courses', segment, documentId) : null;
}

// Paths are persisted relative to the app's document directory: on iOS the absolute container
// path can change across app updates, which would orphan every absolute URI on disk. Anything
// outside the document directory (or already relative) is stored unchanged.
function documentBaseUri(): string {
  const base = Paths.document.uri;
  return base.endsWith('/') ? base : `${base}/`;
}

export function toStoredPath(uri: string | undefined): string | null {
  if (!uri) return null;
  const base = documentBaseUri();
  return uri.startsWith(base) ? uri.slice(base.length) : uri;
}

export function fromStoredPath(stored: string | null): string | undefined {
  if (!stored) return undefined;
  return /^[a-z][a-z0-9+.-]*:/i.test(stored) ? stored : `${documentBaseUri()}${stored}`;
}

// Deletes cache-resident files by explicit URI (session discarded, or superseded by copies
// written elsewhere, e.g. into a permanent library document dir). Takes explicit URIs rather
// than sweeping Paths.cache wholesale — other features (skiaEnhance, etc.) also write there, and
// a blind sweep could delete files still in use.
export function cleanTemporaryCache(uris: string[]): void {
  uris.forEach((uri) => {
    const file = new File(uri);
    if (file.exists) file.delete();
  });
}
