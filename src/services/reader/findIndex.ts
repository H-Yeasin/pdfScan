import type { OcrBounding } from '../../types/models';

// §18 W12 (A7): Find on the page surface reads the words the app already has (a scan's OCR, an
// imported page's indexed words, a PDF page's own text read from the open session) instead of
// asking a PDF engine to search the file again for every query. A page's words become one
// normalised string with a map back to the words, so a match is found with `indexOf` and still
// knows which boxes it covers. Pure: no React, no files.

// What a page's words are given as (study/textSelection's TextToken has these).
export type FindToken = { text: string; bounding: OcrBounding; block: number; line: number };

// One word's place in the page's text.
type Span = { start: number; length: number; bounding: OcrBounding; line: number };

export type PageIndex = {
  // Every word, normalised, with one space between two words (a line break is a space too).
  text: string;
  // In the order of `text`; a word with nothing left after normalising has none.
  spans: Span[];
};

// A match: where it starts in the page's text, and what it covers, one box per line it runs over,
// in the tokens' own coordinates.
export type FindMatch = { start: number; rects: OcrBounding[] };

// What makes two spellings the same to Find: compatibility forms (the "ﬁ" ligature is "fi", a
// full-width letter its plain one), case, soft hyphens (a PDF keeps the ones its line breaks
// used), and any run of white space, line breaks included.
export function normalizeFindText(text: string): string {
  return text.normalize('NFKC').replace(/­/g, '').toLowerCase().replace(/\s+/g, ' ');
}

// The query as it is looked for: '' when there is nothing to find.
export function normalizeQuery(query: string): string {
  return normalizeFindText(query).trim();
}

export function buildPageIndex(tokens: readonly FindToken[]): PageIndex {
  let text = '';
  const spans: Span[] = [];
  // Lines are numbered per block; here every line of the page gets its own number.
  let line = -1;
  let last: FindToken | undefined;
  for (const token of tokens) {
    const word = normalizeFindText(token.text).trim();
    if (!word) continue;
    if (!last || last.block !== token.block || last.line !== token.line) line += 1;
    last = token;
    if (text) text += ' ';
    spans.push({ start: text.length, length: word.length, bounding: token.bounding, line });
    text += word;
  }
  return { text, spans };
}

function union(a: OcrBounding, b: OcrBounding): OcrBounding {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

// The first span that ends after `at` (the spans are in order): a binary search, since a common
// word matches hundreds of times on a page.
function spanFrom(spans: readonly Span[], at: number): number {
  let lo = 0;
  let hi = spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid].start + spans[mid].length > at) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// Every place the query stands on the page, in reading order; matches don't overlap. A match
// inside a word covers its share of the word's box (the letters are taken as equally wide: close
// enough for a highlight, and the boxes say nothing finer).
export function findInPage(index: PageIndex, query: string): FindMatch[] {
  const q = normalizeQuery(query);
  const matches: FindMatch[] = [];
  if (!q) return matches;
  let at = index.text.indexOf(q);
  while (at >= 0) {
    const end = at + q.length;
    const rects: OcrBounding[] = [];
    let line = -1;
    for (let i = spanFrom(index.spans, at); i < index.spans.length && index.spans[i].start < end; i += 1) {
      const span = index.spans[i];
      const from = Math.max(at, span.start);
      const to = Math.min(end, span.start + span.length);
      if (to <= from) continue;
      const b = span.bounding;
      const part: OcrBounding = {
        left: b.left + (b.width * (from - span.start)) / span.length,
        top: b.top,
        width: (b.width * (to - from)) / span.length,
        height: b.height,
      };
      if (span.line === line) rects[rects.length - 1] = union(rects[rects.length - 1], part);
      else rects.push(part);
      line = span.line;
    }
    if (rects.length) matches.push({ start: at, rects });
    at = index.text.indexOf(q, end);
  }
  return matches;
}
