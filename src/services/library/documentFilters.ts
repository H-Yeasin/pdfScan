import { docTypeOf } from '../courses/docTypes';
import type { DocType, LibraryDocument } from '../../types/models';

// The course id that stands for "no course" wherever a course is picked or filtered by (a course
// page, Files' folders and filters). A real course id never looks like it.
export const UNSORTED_COURSE_ID = '__unsorted__';

// §17 U7: what Files narrows its list to. Empty arrays and false mean "don't narrow". Starred is
// a filter like the rest (its quick chip sits by the toolbar); the old Starred tab became it.
export type DocumentFilters = {
  // Course ids, UNSORTED_COURSE_ID for documents without one. Any of them matches.
  courseIds: readonly string[];
  // Any of them matches; a document without a type is 'other' (docTypeOf).
  types: readonly DocType[];
  submitted: 'any' | 'submitted' | 'notSubmitted';
  bookmarked: boolean;
  starred: boolean;
  // Archived documents are left out of the list unless this is on. A search finds them anyway
  // (K6: archiving puts a document away, it doesn't hide it from search).
  showArchived: boolean;
};

export const NO_FILTERS: DocumentFilters = {
  courseIds: [],
  types: [],
  submitted: 'any',
  bookmarked: false,
  starred: false,
  showArchived: false,
};

export type FilterContext = {
  submittedIds: ReadonlySet<string>;
  bookmarkedIds: ReadonlySet<string>;
  // A search is running: archived documents count as found.
  searching: boolean;
};

export function matchesFilters(doc: LibraryDocument, filters: DocumentFilters, ctx: FilterContext): boolean {
  if (doc.archived && !filters.showArchived && !ctx.searching) return false;
  if (filters.starred && !doc.star) return false;
  if (filters.courseIds.length && !filters.courseIds.includes(doc.courseId ?? UNSORTED_COURSE_ID)) return false;
  if (filters.types.length && !filters.types.includes(docTypeOf(doc))) return false;
  if (filters.bookmarked && !ctx.bookmarkedIds.has(doc.id)) return false;
  if (filters.submitted !== 'any' && ctx.submittedIds.has(doc.id) !== (filters.submitted === 'submitted')) return false;
  return true;
}

// The documents that pass every filter, in the order given.
export function applyFilters(docs: readonly LibraryDocument[], filters: DocumentFilters, ctx: FilterContext): LibraryDocument[] {
  return docs.filter((doc) => matchesFilters(doc, filters, ctx));
}

// How many filters narrow the list, for the Filter button's badge. Each course and each type is
// one (each is a chip under the toolbar). Starred has its own chip, so it isn't counted here.
export function activeFilterCount(filters: DocumentFilters): number {
  return (
    filters.courseIds.length +
    filters.types.length +
    (filters.submitted !== 'any' ? 1 : 0) +
    (filters.bookmarked ? 1 : 0) +
    (filters.showArchived ? 1 : 0)
  );
}

export function hasFilters(filters: DocumentFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.starred;
}

// One removable chip under the toolbar per active filter (Starred is the quick chip instead).
export type FilterChipId =
  | { kind: 'course'; id: string }
  | { kind: 'type'; type: DocType }
  | { kind: 'submitted' }
  | { kind: 'bookmarked' }
  | { kind: 'archived' };

export function activeFilterChips(filters: DocumentFilters): FilterChipId[] {
  return [
    ...filters.courseIds.map((id): FilterChipId => ({ kind: 'course', id })),
    ...filters.types.map((type): FilterChipId => ({ kind: 'type', type })),
    ...(filters.submitted !== 'any' ? [{ kind: 'submitted' } as const] : []),
    ...(filters.bookmarked ? [{ kind: 'bookmarked' } as const] : []),
    ...(filters.showArchived ? [{ kind: 'archived' } as const] : []),
  ];
}

export function withoutChip(filters: DocumentFilters, chip: FilterChipId): DocumentFilters {
  switch (chip.kind) {
    case 'course':
      return { ...filters, courseIds: filters.courseIds.filter((id) => id !== chip.id) };
    case 'type':
      return { ...filters, types: filters.types.filter((type) => type !== chip.type) };
    case 'submitted':
      return { ...filters, submitted: 'any' };
    case 'bookmarked':
      return { ...filters, bookmarked: false };
    case 'archived':
      return { ...filters, showArchived: false };
  }
}

export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// The course a file imported into Files goes to: the one course the list is filtered to, else
// none (Unsorted).
export function importCourseId(filters: DocumentFilters): string | undefined {
  if (filters.courseIds.length !== 1) return undefined;
  const [id] = filters.courseIds;
  return id === UNSORTED_COURSE_ID ? undefined : id;
}
