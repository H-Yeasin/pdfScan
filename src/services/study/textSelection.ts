import type { LibraryDocument, OcrBounding, PageOcr } from '../../types/models';

// §5 T3: selecting text on a scanned page. A page's OCR is flattened into tokens in reading order
// (block, then line, then word, as ML Kit returns them); a selection is the run of tokens between
// two of them. Pages OCR'd before T1 have no word boxes, so each line is one token.

export type TextToken = {
  text: string;
  bounding: OcrBounding;
  // Position in reading order, and where it came from (to rebuild line breaks).
  order: number;
  block: number;
  line: number;
};

export function readingOrderTokens(ocr: PageOcr | undefined): TextToken[] {
  const tokens: TextToken[] = [];
  ocr?.blocks.forEach((block, b) =>
    block.lines.forEach((line, l) => {
      const words = line.words?.length ? line.words : [{ text: line.text, bounding: line.bounding }];
      for (const word of words) tokens.push({ text: word.text, bounding: word.bounding, order: tokens.length, block: b, line: l });
    })
  );
  return tokens;
}

const contains = (box: OcrBounding, x: number, y: number) =>
  x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;

// The token under a point (master pixels); if none, the nearest one by distance to its box, so a
// drag that ends between words still lands somewhere sensible. null for a page without tokens.
export function tokenAt(tokens: readonly TextToken[], x: number, y: number): TextToken | null {
  let best: TextToken | null = null;
  let bestDistance = Infinity;
  for (const token of tokens) {
    if (contains(token.bounding, x, y)) return token;
    const b = token.bounding;
    const dx = Math.max(b.left - x, 0, x - (b.left + b.width));
    const dy = Math.max(b.top - y, 0, y - (b.top + b.height));
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = token;
    }
  }
  return best;
}

// Every token from one to the other in reading order, whichever comes first.
export function selectBetween(tokens: readonly TextToken[], a: TextToken, b: TextToken): TextToken[] {
  const [from, to] = a.order <= b.order ? [a.order, b.order] : [b.order, a.order];
  return tokens.filter((t) => t.order >= from && t.order <= to);
}

// Selected tokens as text: words joined by spaces, a new line where the OCR line changes.
export function selectionText(selected: readonly TextToken[]): string {
  let out = '';
  selected.forEach((token, i) => {
    const prev = selected[i - 1];
    if (prev) out += prev.block === token.block && prev.line === token.line ? ' ' : '\n';
    out += token.text;
  });
  return out;
}

// The whole document's OCR text for "Extract text": each page under a "--- Page n ---" line,
// pages with no text marked so the numbering still lines up with the PDF.
export function extractDocumentText(doc: Pick<LibraryDocument, 'pages'>): string {
  return doc.pages
    .map((page, i) => `--- Page ${i + 1} ---\n${page.ocr?.text.trim() || '(no text found)'}`)
    .join('\n\n')
    .concat('\n');
}
