import type { Bookmark, LibraryDocument } from '../../types/models';

export type BookmarkedPage = { bookmark: Bookmark; doc: LibraryDocument; idx: number };

// §5 T5: a course's bookmarked pages (courseId null = Unsorted) with their documents, newest
// document first, then in page order. Bookmarks whose page is gone are left out.
export function courseBookmarks(
  bookmarks: readonly Bookmark[],
  docs: readonly LibraryDocument[],
  courseId: string | null
): BookmarkedPage[] {
  const out: BookmarkedPage[] = [];
  for (const bookmark of bookmarks) {
    const doc = docs.find((d) => d.id === bookmark.documentId);
    if (!doc || (doc.courseId ?? null) !== courseId) continue;
    const idx = doc.pages.findIndex((p) => p.id === bookmark.pageId);
    if (idx >= 0) out.push({ bookmark, doc, idx });
  }
  return out.sort((a, b) => b.doc.createdAt - a.doc.createdAt || a.doc.id.localeCompare(b.doc.id) || a.idx - b.idx);
}

// One document's bookmarks in page order.
export function documentBookmarks(bookmarks: readonly Bookmark[], doc: LibraryDocument): BookmarkedPage[] {
  return courseBookmarks(
    bookmarks.filter((b) => b.documentId === doc.id),
    [doc],
    doc.courseId ?? null
  );
}
