import { Directory, File, Paths } from 'expo-file-system';
import { sanitizeFolderSegment } from '../../utils/sanitize';

const COURSES_SEGMENT = 'Courses';

// Shared by getDocumentDir/deleteDocumentFiles so both always agree on where a document's files
// live. A blank/unset courseFolder (or one that sanitizes to '') resolves to the original flat
// `library/<documentId>` layout — every document saved before Courses routing shipped, and every
// document saved without a course, keeps landing exactly where it always has.
function resolveLibrarySegments(documentId: string, courseFolder?: string): string[] {
  const sanitized = courseFolder ? sanitizeFolderSegment(courseFolder) : '';
  return sanitized ? [COURSES_SEGMENT, sanitized, documentId] : [documentId];
}

export function getDocumentDir(documentId: string, courseFolder?: string): Directory {
  const dir = new Directory(Paths.document, 'library', ...resolveLibrarySegments(documentId, courseFolder));
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

// Callers operating on an already-saved document must pass that document's own `courseFolder`
// (e.g. `doc.courseFolder`), never a live/current UI value — otherwise this resolves to the wrong
// directory and leaves the document's real files behind undeleted.
export function deleteDocumentFiles(documentId: string, courseFolder?: string): void {
  const dir = new Directory(Paths.document, 'library', ...resolveLibrarySegments(documentId, courseFolder));
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
