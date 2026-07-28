import type { LibraryDocument } from '../../types/models';

const SNIPPET_RADIUS = 24;

export function searchDocuments(documents: LibraryDocument[], query: string): LibraryDocument[] {
  const q = query.trim().toLowerCase();
  if (!q) return documents;
  return documents.filter((doc) => doc.searchHaystack.includes(q));
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
