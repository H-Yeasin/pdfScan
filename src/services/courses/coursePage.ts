import type { LibraryDocument } from '../../types/models';

// §17 U11: what a course's page lists, in order, as one list: the documents first, then
// Deadlines, Bookmarks and Submissions as headers with their counts that open in place. Pure, so
// the screen only draws items and the order and the open / closed rules are tested here.

export type CourseSectionId = 'deadlines' | 'bookmarks' | 'submissions';

export const COURSE_SECTIONS: readonly CourseSectionId[] = ['deadlines', 'bookmarks', 'submissions'];

export type CoursePageItem =
  | { kind: 'documentsHeader'; count: number }
  | { kind: 'doc'; doc: LibraryDocument }
  // The course has documents, but none of them shows (a type filter, archived hidden): said in
  // the list instead of an empty gap.
  | { kind: 'documentsEmpty'; filtered: boolean }
  | { kind: 'archivedToggle'; count: number; showing: boolean }
  | { kind: 'section'; id: CourseSectionId; count: number; open: boolean }
  | { kind: 'sectionBody'; id: CourseSectionId };

export type CoursePageInput = {
  // The documents to list, already filtered and sorted.
  docs: readonly LibraryDocument[];
  // Every document of the course, archived too (0: the course is empty).
  totalDocs: number;
  archivedCount: number;
  showArchived: boolean;
  typeFiltered: boolean;
  // null hides a section: Unsorted has no deadlines; bookmarks and submissions only show once
  // there is one.
  counts: Record<CourseSectionId, number | null>;
  open: ReadonlySet<CourseSectionId>;
};

export function coursePageItems(input: CoursePageInput): CoursePageItem[] {
  const items: CoursePageItem[] = [{ kind: 'documentsHeader', count: input.docs.length }];
  for (const doc of input.docs) items.push({ kind: 'doc', doc });
  // An empty course says so (with Scan) in the header block; this is for a list that only looks
  // empty because of what is hidden.
  if (input.docs.length === 0 && input.totalDocs > 0) items.push({ kind: 'documentsEmpty', filtered: input.typeFiltered });
  if (input.archivedCount > 0) items.push({ kind: 'archivedToggle', count: input.archivedCount, showing: input.showArchived });
  for (const id of COURSE_SECTIONS) {
    const count = input.counts[id];
    if (count === null) continue;
    const open = input.open.has(id);
    items.push({ kind: 'section', id, count, open });
    if (open) items.push({ kind: 'sectionBody', id });
  }
  return items;
}

// Every section starts closed, except Deadlines when a tapped reminder points at one of them.
export function initialOpenSections(highlightDeadlineId: string | null | undefined): Set<CourseSectionId> {
  return new Set<CourseSectionId>(highlightDeadlineId ? ['deadlines'] : []);
}

// A new set (state), with `id` opened or closed.
export function toggleSection(open: ReadonlySet<CourseSectionId>, id: CourseSectionId): Set<CourseSectionId> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function coursePageItemKey(item: CoursePageItem): string {
  switch (item.kind) {
    case 'doc':
      return item.doc.id;
    case 'section':
    case 'sectionBody':
      return `${item.kind}:${item.id}`;
    default:
      return item.kind;
  }
}

export function coursePageItemType(item: CoursePageItem): string {
  return item.kind === 'section' || item.kind === 'sectionBody' ? `${item.kind}:${item.id}` : item.kind;
}
