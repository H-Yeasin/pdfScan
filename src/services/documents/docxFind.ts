// §12 D11: Find in a DOCX (DocxView). The matches are found in mammoth's HTML here, in the app,
// and wrapped in <mark id="pdfscan-find-N"> before the page is built; the WebView only gets the
// marked page and one fixed line of script that scrolls to an anchor (findScrollScript). Nothing
// is read back from the page, so the count shown in the top bar is the number of marks.

export const FIND_MARK_ID_PREFIX = 'pdfscan-find-';

export type DocxFindResult = { html: string; count: number };

// mammoth escapes `<` and `>` in text and in attribute values (lib/writers/html-writer.js), so
// every `<…>` in its output is a tag and everything between tags is text.
const TAG_SPLIT = /(<[^>]*>)/;
// One unit of text as it is written: an entity or a single UTF-16 code unit.
const TEXT_UNIT = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);|[\s\S]/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeUnit(raw: string): string {
  if (raw.length === 1 || raw[0] !== '&') return raw;
  const name = raw.slice(1, -1);
  if (name[0] === '#') {
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return raw;
    }
  }
  return NAMED_ENTITIES[name.toLowerCase()] ?? raw;
}

// Marks every match of `query` (trimmed, case-insensitive, like TxtView's Find) in one text run.
// A match is found on the decoded text, so "a&b" finds `a&amp;b`, and never cuts an entity in two.
function markText(text: string, needle: string, startId: number): { html: string; count: number } {
  const units = text.match(TEXT_UNIT) ?? [];
  // The lower-cased text, and for each of its characters the unit it came from (a few characters
  // lower-case to more than one).
  let lower = '';
  const unitAt: number[] = [];
  units.forEach((unit, i) => {
    const l = decodeUnit(unit).toLowerCase();
    lower += l;
    for (let k = 0; k < l.length; k++) unitAt.push(i);
  });

  const ranges: [number, number][] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) break;
    ranges.push([unitAt[at], unitAt[at + needle.length - 1] + 1]);
    from = at + needle.length;
  }
  if (ranges.length === 0) return { html: text, count: 0 };

  let out = '';
  let next = 0;
  let count = 0;
  for (const [start, end] of ranges) {
    // Two matches can share a unit only when one character lower-cases to several; skip the overlap.
    if (start < next) continue;
    const id = startId + count;
    out += units.slice(next, start).join('');
    out += `<mark id="${FIND_MARK_ID_PREFIX}${id}" class="pdfscan-find${id === 0 ? ' pdfscan-current' : ''}">`;
    out += units.slice(start, end).join('');
    out += '</mark>';
    next = end;
    count += 1;
  }
  out += units.slice(next).join('');
  return { html: out, count };
}

// The body with each match wrapped. Matches inside a tag (an attribute, a picture's data: URI) are
// never touched; a match split by formatting ("bo<strong>ld</strong>") isn't found.
export function markDocxMatches(html: string, query: string): DocxFindResult {
  const needle = query.trim().toLowerCase();
  if (!needle) return { html, count: 0 };
  let count = 0;
  const parts = html.split(TAG_SPLIT).map((part, i) => {
    // split with a capturing group: odd indexes are the tags.
    if (i % 2 === 1 || !part) return part;
    const marked = markText(part, needle, count);
    count += marked.count;
    return marked.html;
  });
  return { html: parts.join(''), count };
}

// The only script DocxView sends: scroll mark N into view. `index` is a number the app computed,
// never text from the document or the query.
export function findScrollScript(index: number): string {
  const n = Math.max(0, Math.floor(index));
  return `(function(){var m=document.getElementById('${FIND_MARK_ID_PREFIX}${n}');if(m)m.scrollIntoView({block:'center'});})();true;`;
}
