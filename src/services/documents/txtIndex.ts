// §18 W20: a text file as TxtView reads it, and Find in it. The file is cut into list items once
// and lower-cased once (the old Find lower-cased every chunk again on each keystroke, and could
// only count: nothing was highlighted, and a match was never scrolled to exactly). A match is a
// range of the whole text, so one that crosses two chunks is still one match, drawn in both.

export const TXT_CHUNK_SIZE = 3000;
export const TXT_FIND_MAX = 10_000;

export type TxtIndex = {
  // The list's items: the text in pieces of about TXT_CHUNK_SIZE, each ending on a line break
  // where there is one (a multi-MB file as one Text node is a known way to crash).
  chunks: string[];
  // Where each chunk starts in the text; one more entry at the end, the text's length.
  offsets: number[];
  // The text lower-cased, character for character: lower[i] belongs to text[i].
  lower: string;
};

// Lower case that keeps every character's place. A few characters lower-case to more than one
// (İ → i̇); those stay as they are, so an offset in `lower` is an offset in the text.
export function lowerSameLength(text: string): string {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return lower;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const one = text[i].toLowerCase();
    out += one.length === 1 ? one : text[i];
  }
  return out;
}

export function buildTxtIndex(text: string, chunkSize: number = TXT_CHUNK_SIZE): TxtIndex {
  const chunks: string[] = [];
  const offsets: number[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end - 1);
      if (lastNewline >= start) end = lastNewline + 1;
      // Never between the two halves of a character outside the basic plane.
      else if (isHighSurrogate(text.charCodeAt(end - 1)) && end - 1 > start) end -= 1;
    }
    chunks.push(text.slice(start, end));
    offsets.push(start);
    start = end;
  }
  if (chunks.length === 0) {
    chunks.push('');
    offsets.push(0);
  }
  offsets.push(text.length);
  return { chunks, offsets, lower: lowerSameLength(text) };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

// A match: [start, end) in the text.
export type TxtMatch = { start: number; end: number };
export type TxtMatches = { matches: TxtMatch[]; partial: boolean };
export const NO_TXT_MATCHES: TxtMatches = { matches: [], partial: false };

// Every match of `query` (trimmed, any case), in reading order, none overlapping. `partial`: the
// cap was reached and there are more.
export function findAll(index: TxtIndex, query: string, cap: number = TXT_FIND_MAX): TxtMatches {
  const needle = lowerSameLength(query.trim());
  if (!needle) return NO_TXT_MATCHES;
  const matches: TxtMatch[] = [];
  let from = 0;
  for (;;) {
    const at = index.lower.indexOf(needle, from);
    if (at === -1) return { matches, partial: false };
    if (matches.length >= cap) return { matches, partial: true };
    matches.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
}

// The chunk that holds the character at `offset`.
export function chunkOf(index: TxtIndex, offset: number): number {
  let low = 0;
  let high = index.chunks.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (index.offsets[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

// The first match that ends after `offset` (matches are in order): where a chunk's own begin, and
// Find's first match from where reading is. matches.length when there is none.
export function firstMatchAfter(matches: readonly TxtMatch[], offset: number): number {
  let low = 0;
  let high = matches.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (matches[mid].end > offset) high = mid;
    else low = mid + 1;
  }
  return low;
}

export type TxtSegment = { text: string; hit: 'none' | 'match' | 'current' };

// A chunk as the pieces TxtView draws: plain text, a match, the match Find is on. A match that
// began in the chunk before or runs into the next is drawn as far as this chunk goes.
export function chunkSegments(index: TxtIndex, chunk: number, matches: readonly TxtMatch[], current: number): TxtSegment[] {
  const text = index.chunks[chunk] ?? '';
  const start = index.offsets[chunk] ?? 0;
  const end = start + text.length;
  const segments: TxtSegment[] = [];
  let at = start;
  for (let i = firstMatchAfter(matches, start); i < matches.length && matches[i].start < end; i += 1) {
    const from = Math.max(matches[i].start, start);
    const to = Math.min(matches[i].end, end);
    if (from > at) segments.push({ text: text.slice(at - start, from - start), hit: 'none' });
    segments.push({ text: text.slice(from - start, to - start), hit: i === current ? 'current' : 'match' });
    at = to;
  }
  if (at < end || segments.length === 0) segments.push({ text: text.slice(at - start), hit: 'none' });
  return segments;
}

// Whether any match touches the chunk: one without is drawn as a single plain Text.
export function chunkHasMatch(index: TxtIndex, chunk: number, matches: readonly TxtMatch[]): boolean {
  const start = index.offsets[chunk] ?? 0;
  const i = firstMatchAfter(matches, start);
  return i < matches.length && matches[i].start < (index.offsets[chunk + 1] ?? start);
}

// --- scrolling from measured heights ---
// The chunks have no fixed height (lines wrap), so the list can't say where chunk 400 is before
// it has drawn the 399 above it. TxtView notes each chunk's height as it is laid out; what isn't
// measured yet counts as the average of what is. A jump lands near, the chunk gets drawn and
// measured, and a second look puts it right.

export function averageHeight(heights: readonly (number | undefined)[], fallback: number): number {
  let sum = 0;
  let count = 0;
  for (const h of heights) {
    if (h !== undefined) {
      sum += h;
      count += 1;
    }
  }
  return count > 0 ? sum / count : fallback;
}

// The top of chunk `chunk` in the list's content (without any padding above the first chunk).
export function chunkTop(heights: readonly (number | undefined)[], chunk: number, fallback: number): number {
  const average = averageHeight(heights, fallback);
  let top = 0;
  for (let i = 0; i < chunk; i += 1) top += heights[i] ?? average;
  return top;
}

// The chunk at content offset `y`, and how far down it (0..1): the position TxtView saves.
export function chunkAt(heights: readonly (number | undefined)[], count: number, y: number, fallback: number): { chunk: number; fy: number } {
  const average = averageHeight(heights, fallback);
  let top = 0;
  for (let i = 0; i < count; i += 1) {
    const height = heights[i] ?? average;
    if (y < top + height || i === count - 1) return { chunk: i, fy: height > 0 ? Math.min(1, Math.max(0, (y - top) / height)) : 0 };
    top += height;
  }
  return { chunk: 0, fy: 0 };
}

// How far down its chunk a character is, 0..1, going by characters: lines wrap, so this is only
// about right, which is enough to bring a match on screen.
export function fractionInChunk(index: TxtIndex, chunk: number, offset: number): number {
  const length = index.chunks[chunk]?.length ?? 0;
  return length > 0 ? Math.min(1, Math.max(0, (offset - index.offsets[chunk]) / length)) : 0;
}
