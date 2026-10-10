import type { LibraryDocument } from '../../types/models';

const SNIPPET_RADIUS = 24;

// The lowercased text the in-memory filter matches against: the name plus every page's OCR text.
// §16 G4: built the first time a document is searched, not when the library loads (that doubled
// every page's text in memory before anyone had typed anything), and kept for as long as the
// document object lives: the reducer makes a new one on a rename or new pages, which drops it.
const haystacks = new WeakMap<LibraryDocument, string>();

function haystackOf(doc: LibraryDocument): string {
  let haystack = haystacks.get(doc);
  if (haystack === undefined) {
    haystack = [doc.name, ...doc.pages.map((p) => p.ocr?.text ?? '')].join(' ').toLowerCase();
    haystacks.set(doc, haystack);
  }
  return haystack;
}

// The Library's filter while the full-text query (dbService.searchDocumentsByText) is on its
// way, and when it fails.
export function searchDocuments(documents: LibraryDocument[], query: string): LibraryDocument[] {
  const q = query.trim().toLowerCase();
  if (!q) return documents;
  return documents.filter((doc) => haystackOf(doc).includes(q));
}

// Returns a short snippet of OCR text around the first match, but only when the match is
// NOT already visible in the filename (the row already shows the name, so repeating it adds nothing).
export function getMatchSnippet(doc: LibraryDocument, query: string): string | undefined {
  const q = query.trim().toLowerCase();
  if (!q || doc.name.toLowerCase().includes(q)) return undefined;

  for (const page of doc.pages) {
    const text = page.ocr?.text;
    if (!text) continue;
    const index = text.toLowerCase().indexOf(q);
    if (index === -1) continue;
    const start = Math.max(0, index - SNIPPET_RADIUS);
    const end = Math.min(text.length, index + q.length + SNIPPET_RADIUS);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }
  return undefined;
}
