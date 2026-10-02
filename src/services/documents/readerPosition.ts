// §7 R4: where the Reader opens a document, and the "go to page" box. Pages are PDF pages,
// 1-based, as the viewer counts them.

// The page to open at once the PDF has loaded: where the student left off, unless a search hit
// or a bookmark (§5 T2/T5) is being opened - that wins - or the document was read to the first
// page anyway. A saved page past the end (pages deleted since, §7 R3) opens at the last page.
// null: stay on page 1.
export function resumePage(lastPage: number | undefined, pageCount: number, hasTarget: boolean): number | null {
  if (hasTarget || !lastPage || pageCount <= 0) return null;
  const page = Math.min(Math.max(1, Math.round(lastPage)), pageCount);
  return page > 1 ? page : null;
}

// A typed page number: whole digits only (spaces around them are fine), between 1 and the page
// count. null for anything else, so the box can say "no such page" instead of jumping somewhere
// unexpected.
export function parseJumpInput(text: string, pageCount: number): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  const page = Number(trimmed);
  return page >= 1 && page <= pageCount ? page : null;
}

// What the viewer's load error means. Both pdf-jsi platforms report a missing or wrong password
// as "Password required or incorrect password." (android PdfView.onError, ios RNPDFPdfView);
// anything else (a damaged file, "Load pdf failed") can't be fixed with a password.
// 'unknown': no message to go by - the prompt is offered, as before R4.
export type PdfLoadProblem = 'password' | 'damaged' | 'unknown';

export function classifyPdfError(message: string | undefined): PdfLoadProblem {
  const text = (message ?? '').trim();
  if (!text || text === '{}') return 'unknown';
  return /password/i.test(text) ? 'password' : 'damaged';
}
