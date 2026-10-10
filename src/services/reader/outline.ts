import type { PdfOutlineItem } from '../pdf/pdfNative';

// §18 W11: a PDF's outline (its bookmarks tree) as the flat list the Contents tab shows, and the
// section a page belongs to (the fast scroller's bubble). Pure.

// A list this long is already more than anyone scrolls; deeper levels would have no room to
// indent. (Native reads up to 5000 entries, 12 levels.)
export const OUTLINE_MAX_ENTRIES = 2000;
export const OUTLINE_MAX_DEPTH = 8;

export type OutlineEntry = {
  key: string;
  title: string;
  // 0-based page of the file. Undefined: the entry points nowhere in it (a heading only).
  page?: number;
  // 0 for a top-level entry.
  depth: number;
};

// The tree in reading order. Titles are trimmed to one line; an entry with no title is left out
// (its children stay, a level up); a page outside the file is dropped from its entry.
export function flattenOutline(items: readonly PdfOutlineItem[], pageCount: number): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const walk = (list: readonly PdfOutlineItem[], depth: number) => {
    for (const item of list) {
      if (entries.length >= OUTLINE_MAX_ENTRIES) return;
      const title = (item.title ?? '').replace(/\s+/g, ' ').trim();
      if (title) {
        const page = item.page !== undefined && Number.isInteger(item.page) && item.page >= 0 && item.page < pageCount ? item.page : undefined;
        entries.push({ key: String(entries.length), title, page, depth });
      }
      const below = title ? depth + 1 : depth;
      if (item.children?.length && below < OUTLINE_MAX_DEPTH) walk(item.children, below);
    }
  };
  walk(items, 0);
  return entries;
}

// The entry `page` (0-based) is read under: the one that starts nearest before it, or on it. Of
// several on the same page the last in the list, which is the most specific (a chapter and its
// first section often start together). -1 before the first entry's page.
export function sectionIndex(entries: readonly OutlineEntry[], page: number): number {
  let best = -1;
  let bestPage = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const at = entries[i].page;
    if (at === undefined || at > page) continue;
    if (at >= bestPage) {
      best = i;
      bestPage = at;
    }
  }
  return best;
}

export function currentSection(entries: readonly OutlineEntry[], page: number): OutlineEntry | null {
  const index = sectionIndex(entries, page);
  return index < 0 ? null : entries[index];
}
