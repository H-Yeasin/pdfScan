import type { Course, LibraryDocument } from '../../types/models';

// §17 U7: the orders Files can list documents in. Saved per device (settings.filesView).
export type SortKey = 'modified' | 'created' | 'name' | 'size' | 'course';
export type SortDir = 'asc' | 'desc';
export type DocumentSort = { key: SortKey; dir: SortDir };

export const SORT_KEYS: readonly SortKey[] = ['modified', 'created', 'name', 'size', 'course'];
export const DEFAULT_SORT: DocumentSort = { key: 'modified', dir: 'desc' };

// The direction a key starts in when picked: newest and biggest first, names and courses A to Z.
export function defaultDirFor(key: SortKey): SortDir {
  return key === 'name' || key === 'course' ? 'asc' : 'desc';
}

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

// When a document last changed: the stored updated_at (loaded since U7), else when it was made.
export function modifiedAt(doc: Pick<LibraryDocument, 'updatedAt' | 'createdAt'>): number {
  return doc.updatedAt ?? doc.createdAt;
}

// Names in the reader's order: case and accents don't separate "lab 2" from "Lab 2", and numbers
// count ("Lab 2" before "Lab 10").
const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;

function compareNames(a: string, b: string): number {
  return collator ? collator.compare(a, b) : a.localeCompare(b);
}

// A new array; the input stays as it is. Ties (same name, same size, same course) fall back to
// newest first, then the id, so the order never jumps between two renders.
export function sortDocuments(docs: readonly LibraryDocument[], sort: DocumentSort, courses: readonly Course[] = []): LibraryDocument[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  // Courses in their own order (the one Home and the folders show); Unsorted after every course
  // whichever way the list runs, and courses that are gone with it.
  const courseRank = new Map(courses.map((c, i) => [c.id, i]));
  const rankOf = (doc: LibraryDocument) => (doc.courseId !== undefined ? (courseRank.get(doc.courseId) ?? Infinity) : Infinity);

  const primary = (a: LibraryDocument, b: LibraryDocument): number => {
    switch (sort.key) {
      case 'modified':
        return sign * (modifiedAt(a) - modifiedAt(b));
      case 'created':
        return sign * (a.createdAt - b.createdAt);
      case 'name':
        return sign * compareNames(a.name, b.name);
      case 'size':
        return sign * (a.sizeBytes - b.sizeBytes);
      case 'course': {
        const ra = rankOf(a);
        const rb = rankOf(b);
        if (ra === rb) return 0;
        if (ra === Infinity) return 1;
        if (rb === Infinity) return -1;
        return sign * (ra - rb);
      }
    }
  };

  return [...docs].sort((a, b) => primary(a, b) || b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
