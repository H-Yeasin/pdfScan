import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Course, LibraryDocument, LibraryPage } from '../../types/models';
import { sanitizeFolderSegment } from '../../utils/sanitize';
import { buildSearchHaystack } from '../search/searchService';
import { legacyCourseDocumentDir } from './libraryFiles';
import { insertIfMissing, type LoadedLibrary } from './libraryRepo';

// --- The pre-SQLite library format ------------------------------------------------------------
// Before schema v1 the whole library was one JSON blob in AsyncStorage. Everything in this file
// exists only to import that blob once; nothing else may depend on these types.

export const LEGACY_INDEX_KEY = 'library:index';
// The imported blob is kept under this key for one release as a safety net, then deleted.
export const LEGACY_BACKUP_KEY = 'library:index:migrated-v1';

export type LegacyFolder = { id: string; name: string; createdAt: number };

export type LegacyDocument = Omit<LibraryDocument, 'courseId' | 'searchHaystack'> & {
  searchHaystack?: string;
  // Logical folder id; undefined meant "unfiled".
  folderId?: string;
  // Free-text course name that also routed files into library/Courses/<segment>/<id>/.
  courseFolder?: string;
};

export type LegacyIndexV2 = { version: 2; documents: LegacyDocument[]; folders: LegacyFolder[] };

// Handles both the v2 shape and the pre-folders v1 shape (or anything unrecognized), always
// normalizing to v2 so the importer only deals with one shape.
export function migrateLibraryIndex(parsed: unknown): LegacyIndexV2 {
  if (!parsed || typeof parsed !== 'object') return { version: 2, documents: [], folders: [] };
  const obj = parsed as Partial<LegacyIndexV2>;
  const documents = Array.isArray(obj.documents) ? obj.documents : [];
  if (obj.version === 2) {
    const folders = Array.isArray(obj.folders) ? obj.folders : [];
    return { version: 2, documents, folders };
  }
  return { version: 2, documents, folders: [] };
}

// Deterministic, so re-running an interrupted import maps a course name to the same id.
function courseIdForCourseFolder(segment: string): string {
  return `course_cf_${segment.replace(/[^a-z0-9]+/g, '_')}`;
}

// Merge rules for the Course model:
//  - every legacy folder becomes a course with the same id;
//  - every distinct courseFolder name becomes a course, reusing a folder-course whose name matches
//    case-insensitively (and merging names that sanitize to the same directory segment, since
//    those always shared one directory on disk);
//  - a document is filed under its folder if it had one, otherwise under its courseFolder's course.
export function convertLegacyIndex(index: LegacyIndexV2): { courses: Course[]; documents: LegacyDocument[]; courseIdByDoc: Map<string, string> } {
  const courses: Course[] = index.folders.map((f) => ({
    id: f.id,
    name: f.name,
    archived: false,
    createdAt: f.createdAt,
  }));
  const byLowerName = new Map(courses.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const folderIds = new Set(courses.map((c) => c.id));
  const bySegment = new Map<string, string>();

  const courseIdByDoc = new Map<string, string>();
  for (const doc of index.documents) {
    if (doc.folderId && folderIds.has(doc.folderId)) {
      courseIdByDoc.set(doc.id, doc.folderId);
      continue;
    }
    const name = doc.courseFolder?.trim();
    const segment = name ? sanitizeFolderSegment(name) : '';
    if (!name || !segment) continue;

    let courseId = byLowerName.get(name.toLowerCase()) ?? bySegment.get(segment);
    if (!courseId) {
      courseId = courseIdForCourseFolder(segment);
      courses.push({ id: courseId, name, archived: false, createdAt: doc.createdAt ?? Date.now() });
      byLowerName.set(name.toLowerCase(), courseId);
    }
    bySegment.set(segment, courseId);
    courseIdByDoc.set(doc.id, courseId);
  }
  return { courses, documents: index.documents, courseIdByDoc };
}

function rebase(uri: string | undefined, fromPrefix: string, toPrefix: string): string | undefined {
  return uri && uri.startsWith(fromPrefix) ? toPrefix + uri.slice(fromPrefix.length) : uri;
}

// Moves a course-routed document's directory to the flat library/<id>/ layout and rewrites its
// stored URIs. Idempotent: if the flat directory already exists (an earlier, interrupted import
// got this far) the move is skipped and only the URIs are rewritten.
function relocateLegacyDocument(doc: LegacyDocument): LegacyDocument {
  if (!doc.courseFolder) return doc;
  const legacyDir = legacyCourseDocumentDir(doc.id, doc.courseFolder);
  if (!legacyDir) return doc;

  const from = legacyDir.uri;
  const flatDir = new Directory(Paths.document, 'library', doc.id);
  if (legacyDir.exists && !flatDir.exists) legacyDir.moveSync(flatDir);
  const to = flatDir.uri;

  const pages: LibraryPage[] = (doc.pages ?? []).map((p) => ({ ...p, fileUri: rebase(p.fileUri, from, to) ?? '' }));
  return {
    ...doc,
    pages,
    pdfUri: rebase(doc.pdfUri, from, to),
    contentUri: rebase(doc.contentUri, from, to),
  };
}

export function toLibraryDocuments(converted: ReturnType<typeof convertLegacyIndex>): LibraryDocument[] {
  return converted.documents.map((legacy) => {
    const doc = relocateLegacyDocument(legacy);
    const { folderId: _folderId, courseFolder: _courseFolder, ...rest } = doc;
    return {
      ...rest,
      pages: Array.isArray(rest.pages) ? rest.pages : [],
      star: !!rest.star,
      locked: !!rest.locked,
      sizeBytes: rest.sizeBytes ?? 0,
      createdAt: rest.createdAt ?? Date.now(),
      courseId: converted.courseIdByDoc.get(legacy.id),
      searchHaystack: buildSearchHaystack(rest.name, rest.pages ?? []),
    };
  });
}

// Imports the AsyncStorage library (if one is still there) into SQLite. Throws on an unreadable
// or unparseable blob - the caller must treat that as a failed load and never write, so a
// transient read error can't be mistaken for an empty library.
export async function importLegacyLibraryIfPresent(db: SQLiteDatabase): Promise<boolean> {
  const raw = await AsyncStorage.getItem(LEGACY_INDEX_KEY);
  if (raw === null) return false;

  const index = migrateLibraryIndex(JSON.parse(raw));
  const converted = convertLegacyIndex(index);
  const library: LoadedLibrary = { courses: converted.courses, documents: toLibraryDocuments(converted) };
  await insertIfMissing(db, library);

  // Only once the rows are committed: keep the blob as a backup, then retire the live key so the
  // import never runs again.
  await AsyncStorage.setItem(LEGACY_BACKUP_KEY, raw);
  await AsyncStorage.removeItem(LEGACY_INDEX_KEY);
  return true;
}
