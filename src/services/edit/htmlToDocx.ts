import type { DocxBlock, DocxHeading, DocxImage, DocxImageType, DocxParagraph, DocxRun, DocxTableCell, DocxTableRow } from '../convert/docxWriter';

// §12 D9: the Word editor's HTML (a contenteditable body that started as mammoth's HTML) back into
// docxWriter's blocks. React Native has no DOM, so this is a small HTML reader of its own. It only
// has to read what a browser's innerHTML serializer and mammoth write - tags closed or void,
// attributes quoted, text escaped - but it never throws on anything else: an unknown tag is read
// for its text, an unmatched end tag is skipped, a stray `<` is text.
//
// What it keeps: paragraphs, headings (h1-h2 as they are, h3-h6 as heading 3), line breaks,
// bold/italic/underline/strikethrough/super- and subscript, bulleted and numbered lists (nested),
// simple tables (header rows, column spans; a row span is read as a plain cell, a table inside a
// cell as its paragraphs) and data: URI pictures. Links keep their text. Everything else
// (colours, fonts, alignment) is dropped; the editor says so before saving.

type Element = { tag: string; attrs: Record<string, string>; children: Node[] };
type Node = Element | string;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Whose content is never document text.
const SKIP = new Set(['script', 'style', 'template', 'head', 'title', 'noscript', 'button', 'select', 'textarea']);

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

// The HTML as a tree under a root element. Comments and doctypes are dropped.
export function parseHtml(html: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [] };
  const stack: Element[] = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) top().children.push(decodeEntities(html.slice(last, m.index)));
    last = re.lastIndex;
    if (m[1]) {
      // An end tag closes the nearest open element with its name, and whatever is still open
      // inside it; one with no open match is skipped.
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const el: Element = { tag: m[2].toLowerCase(), attrs: parseAttrs(m[3] ?? ''), children: [] };
      top().children.push(el);
      if (!VOID.has(el.tag) && !m[4]) stack.push(el);
    }
  }
  if (last < html.length) top().children.push(decodeEntities(html.slice(last)));
  return root;
}

// --- Pictures ---

const DATA_URI = /^data:image\/(png|jpe?g|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// A picture's pixel size from its header (PNG IHDR, GIF screen descriptor, JPEG SOFn marker), or
// 0×0 when it can't be read: docxWriter then picks one.
export function imageSize(bytes: Uint8Array, type: DocxImageType): { width: number; height: number } {
  const u16be = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32be = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  if (type === 'png' && bytes.length >= 24) return { width: u32be(16), height: u32be(20) };
  if (type === 'gif' && bytes.length >= 10) return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  if (type === 'jpeg') {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(i + 7), height: u16be(i + 5) };
      }
      i += 2 + u16be(i + 2);
    }
  }
  return { width: 0, height: 0 };
}

// A data: URI as a picture, or null (another scheme, another format, broken base64).
export function imageFromDataUri(src: string, alt?: string): DocxImage | null {
  const m = DATA_URI.exec(src.trim());
  if (!m) return null;
  const type: DocxImageType = m[1].toLowerCase() === 'png' ? 'png' : m[1].toLowerCase() === 'gif' ? 'gif' : 'jpeg';
  try {
    const bytes = decodeBase64(m[2]);
    if (!bytes.length) return null;
    return { bytes, type, ...imageSize(bytes, type), ...(alt ? { alt } : {}) };
  } catch {
    return null;
  }
}

// --- Blocks ---

type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; script?: 'sup' | 'sub'; pre?: boolean };

const MARK_TAGS: Record<string, Marks> = {
  b: { bold: true },
  strong: { bold: true },
  i: { italic: true },
  em: { italic: true },
  u: { underline: true },
  ins: { underline: true },
  s: { strike: true },
  strike: { strike: true },
  del: { strike: true },
  sup: { script: 'sup' },
  sub: { script: 'sub' },
};

const HEADINGS: Record<string, DocxHeading> = { h1: 1, h2: 2, h3: 3, h4: 3, h5: 3, h6: 3 };
const BLOCKS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'section', 'article', 'header', 'footer',
  'main', 'nav', 'aside', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'hr', 'li', 'ul', 'ol', 'table', 'body', 'html',
]);

// `images`: pictures the editor sent back by id (`data-img`) rather than as data again.
export type HtmlImages = { byId: (id: string) => string | undefined };

type ListContext = { ordered: boolean; level: number; instance: number };

class BlockBuilder {
  readonly blocks: DocxBlock[] = [];
  private runs: DocxRun[] = [];
  // The paragraph being filled: its heading and list item, and whether an element asked for it
  // (a <p> is kept even when empty - a blank line the student typed - loose text only if not).
  private para: { heading?: DocxHeading; list?: ListContext; explicit: boolean } = { explicit: false };
  private nextInstance = 1;

  constructor(private readonly images: HtmlImages) {}

  private flush(): void {
    const runs = tidyRuns(this.runs);
    const { heading, list, explicit } = this.para;
    if (runs.length || explicit) {
      const p: DocxParagraph = { type: 'paragraph', runs };
      if (heading) p.heading = heading;
      if (list) p.list = { ordered: list.ordered, level: list.level, instance: list.instance };
      this.blocks.push(p);
    }
    this.runs = [];
    this.para = { explicit: false };
  }

  private start(opts: { heading?: DocxHeading; list?: ListContext }): void {
    // A paragraph opened with nothing in it yet (<li><p>…, <div><p>…) gives way to the inner one.
    if (tidyRuns(this.runs).length) this.flush();
    this.runs = [];
    this.para = { ...opts, explicit: true };
  }

  private text(raw: string, marks: Marks): void {
    // HTML whitespace: runs of spaces, tabs and line breaks show as one space (tidyRuns trims a
    // paragraph's ends), except in <pre>. A no-break space is what the editor writes for a second
    // typed space, so it counts as a space only after the collapse.
    const text = (marks.pre ? raw : raw.replace(/[ \t\n\r\f]+/g, ' ')).replace(/\u00a0/g, ' ');
    if (!text) return;
    const { pre: _pre, ...style } = marks;
    this.runs.push({ type: 'text', text, ...style });
  }

  walk(nodes: readonly Node[], marks: Marks, list: ListContext | null): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.text(node, marks);
        continue;
      }
      const { tag } = node;
      if (SKIP.has(tag)) continue;
      if (tag === 'br') {
        this.runs.push({ type: 'text', text: '\n', ...marks });
      } else if (tag === 'img') {
        const src = node.attrs['data-img'] ? this.images.byId(node.attrs['data-img']) : node.attrs.src;
        const image = src ? imageFromDataUri(src, node.attrs.alt) : null;
        if (image) this.runs.push({ type: 'image', image });
      } else if (MARK_TAGS[tag]) {
        this.walk(node.children, { ...marks, ...MARK_TAGS[tag] }, list);
      } else if (tag === 'ul' || tag === 'ol') {
        this.flush();
        // A list inside an item is one level deeper and, when numbered, part of the same count;
        // a list on its own starts a new one.
        const nested: ListContext = list
          ? { ordered: tag === 'ol', level: list.level + 1, instance: list.ordered === (tag === 'ol') ? list.instance : this.nextInstance++ }
          : { ordered: tag === 'ol', level: 0, instance: this.nextInstance++ };
        this.walk(node.children, marks, nested);
        this.flush();
      } else if (tag === 'li') {
        this.start({ list: list ?? undefined });
        this.walk(node.children, marks, list);
        this.flush();
      } else if (tag === 'table') {
        this.flush();
        this.blocks.push({ type: 'table', rows: this.table(node, marks) });
      } else if (HEADINGS[tag]) {
        this.start({ heading: HEADINGS[tag] });
        this.walk(node.children, marks, null);
        this.flush();
      } else if (tag === 'hr') {
        this.flush();
      } else if (BLOCKS.has(tag)) {
        // A block inside a list item continues that item's text in a paragraph of its own.
        const inItem = this.para.list;
        if (tag === 'p' || tag === 'div' || tag === 'pre' || tag === 'dt' || tag === 'dd') this.start({ list: inItem });
        else this.flush();
        this.walk(node.children, tag === 'pre' ? { ...marks, pre: true } : marks, list);
        this.flush();
      } else {
        // a, span, font, and anything unknown: just its content.
        this.walk(node.children, marks, list);
      }
    }
  }

  private table(table: Element, marks: Marks): DocxTableRow[] {
    const rows: DocxTableRow[] = [];
    const visit = (el: Element, header: boolean) => {
      for (const child of el.children) {
        if (typeof child === 'string') continue;
        if (child.tag === 'thead') visit(child, true);
        else if (child.tag === 'tbody' || child.tag === 'tfoot') visit(child, header);
        else if (child.tag === 'tr') rows.push(this.row(child, header, marks));
      }
    };
    visit(table, false);
    return rows;
  }

  private row(tr: Element, inHead: boolean, marks: Marks): DocxTableRow {
    const cells: DocxTableCell[] = [];
    let allTh = true;
    for (const td of tr.children) {
      if (typeof td === 'string' || (td.tag !== 'td' && td.tag !== 'th')) continue;
      if (td.tag !== 'th') allTh = false;
      // A cell is read with a builder of its own; a table inside it comes out as its paragraphs.
      const inner = new BlockBuilder(this.images);
      inner.walk(td.children, marks, null);
      const paragraphs = inner.finish().flatMap((b): DocxParagraph[] =>
        b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flatMap((r) => r.cells.flatMap((c) => c.paragraphs)) : []
      );
      const span = parseInt(td.attrs.colspan ?? '1', 10);
      cells.push(span > 1 ? { paragraphs, span: Math.min(span, 63) } : { paragraphs });
    }
    return { header: inHead || (allTh && cells.length > 0) || undefined, cells };
  }

  finish(): DocxBlock[] {
    this.flush();
    return this.blocks;
  }
}

// Merges neighbouring text runs with the same marks, trims a paragraph's leading and trailing
// spaces (and a space after a space, which HTML wouldn't show), and drops the line break a
// browser leaves at the end of a block (`<p>text<br></p>`, `<p><br></p>` for an empty line).
function tidyRuns(runs: readonly DocxRun[]): DocxRun[] {
  const out: DocxRun[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (r.type === 'text') {
      let text = r.text;
      const prevText = prev?.type === 'text' ? prev.text : '';
      if (text.startsWith(' ') && (prev === undefined || prevText.endsWith(' ') || prevText.endsWith('\n'))) text = text.replace(/^ +/, '');
      if (!text) continue;
      if (prev?.type === 'text' && sameMarks(prev, r)) {
        out[out.length - 1] = { ...prev, text: prev.text + text };
        continue;
      }
      out.push({ ...r, text });
    } else {
      out.push(r);
    }
  }
  const last = out[out.length - 1];
  if (last?.type === 'text') {
    const text = last.text.replace(/ *\n? *$/, '');
    if (text) out[out.length - 1] = { ...last, text };
    else out.pop();
  }
  return out;
}

function sameMarks(a: DocxRun & { type: 'text' }, b: DocxRun & { type: 'text' }): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.strike === !!b.strike && a.script === b.script;
}

export function htmlToDocxBlocks(html: string, images: HtmlImages = { byId: () => undefined }): DocxBlock[] {
  const builder = new BlockBuilder(images);
  builder.walk(parseHtml(html).children, {}, null);
  return builder.finish();
}

// The blocks' text, a paragraph per line and a table row's cells tab-separated: what the copy is
// searched by (the same text mammoth would read back).
export function docxBlocksText(blocks: readonly DocxBlock[]): string {
  const paragraphText = (p: DocxParagraph) => (p.runs ? p.runs.map((r) => (r.type === 'text' ? r.text : '')).join('') : (p.text ?? ''));
  return blocks
    .map((b) =>
      b.type === 'paragraph'
        ? paragraphText(b)
        : b.type === 'table'
          ? b.rows.map((r) => r.cells.map((c) => c.paragraphs.map(paragraphText).join(' ')).join('\t')).join('\n')
          : ''
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
