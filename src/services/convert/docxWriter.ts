import type { File } from 'expo-file-system';
import { createZip } from '../backup/zip';
import { encodeUtf8 } from '../backup/zip/utf8';

// §12 D6: writes a minimal Word file - the five parts Word, LibreOffice, Google Docs and mammoth
// need (content types, the package and document relationships, the body, the styles) - into a
// store-only zip, which is a valid DOCX. Nothing else: no fonts, pictures, numbering or settings,
// because what we write is the text of a page and its order, not its layout.
//
// §12 D9 (the Word editor) adds what an edited document has: runs with bold, italic, underline,
// strikethrough and super/subscript; bulleted and numbered lists (a numbering part, written only
// when a list is there); simple tables (bordered, with header rows and column spans); and inline
// pictures (word/media/, one relationship each). Still no fonts, colours or page layout beyond A4.
//
// The text comes from OCR or from a PDF someone else made, so all of it is XML-escaped, and the
// characters XML 1.0 forbids (control characters, lone surrogates) are dropped: one of them would
// make Word refuse the whole file.

export type DocxHeading = 1 | 2 | 3;

export type DocxImageType = 'png' | 'jpeg' | 'gif';

// `width`/`height` in CSS pixels (96 per inch); a wider picture is scaled to the text width.
export type DocxImage = { bytes: Uint8Array; type: DocxImageType; width: number; height: number; alt?: string };

export type DocxRun =
  // `text` may hold '\n' (a line break) and '\t'.
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; script?: 'sup' | 'sub' }
  | { type: 'image'; image: DocxImage };

// `instance`: which list the item belongs to. A numbered list restarts at 1 for each instance;
// `level` is the nesting depth (0-8).
export type DocxList = { ordered: boolean; level: number; instance: number };

export type DocxParagraph = {
  type: 'paragraph';
  // Plain text (D6), may hold '\n': a line break inside the paragraph. `runs` (D9) win when given.
  text?: string;
  runs?: DocxRun[];
  heading?: DocxHeading;
  list?: DocxList;
};

export type DocxTableCell = { paragraphs: DocxParagraph[]; span?: number };
export type DocxTableRow = { header?: boolean; cells: DocxTableCell[] };

export type DocxBlock = DocxParagraph | { type: 'table'; rows: DocxTableRow[] } | { type: 'pageBreak' };

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

// A4 with 2.54 cm margins: the text is 9026 twentieths of a point wide, 5731510 EMU.
const TEXT_WIDTH_TWIPS = 11906 - 2 * 1440;
const TEXT_WIDTH_EMU = TEXT_WIDTH_TWIPS * 635;
const EMU_PER_PX = 9525;

// Everything outside XML 1.0's Char production: C0 controls except tab, newline and carriage
// return, U+FFFE/U+FFFF, and (with the u flag) surrogates that aren't part of a pair.
const FORBIDDEN_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function xmlText(text: string): string {
  return text
    .replace(FORBIDDEN_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textXml(text: string): string {
  // Tabs and line breaks are their own elements in WordprocessingML; inside <w:t> they'd be
  // read as plain spaces.
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .split('\t')
        .map((piece) => (piece ? `<w:t xml:space="preserve">${xmlText(piece)}</w:t>` : ''))
        .join('<w:tab/>')
    )
    .join('<w:br/>');
}

function run(text: string): string {
  return `<w:r>${textXml(text)}</w:r>`;
}

// What one document needs written beside its body: the pictures (word/media/) and their
// relationship ids, and the lists (one <w:num> per list instance).
class PackageParts {
  readonly images: { path: string; rId: string; bytes: Uint8Array }[] = [];
  readonly lists = new Map<number, { numId: number; ordered: boolean }>();

  // rId1 is the styles part, rId2 the numbering part.
  imageRel(image: DocxImage): string {
    const n = this.images.length + 1;
    const rId = `rId${n + 2}`;
    this.images.push({ path: `media/image${n}.${image.type === 'jpeg' ? 'jpeg' : image.type}`, rId, bytes: image.bytes });
    return rId;
  }

  numId(list: DocxList): number {
    let entry = this.lists.get(list.instance);
    if (!entry) {
      entry = { numId: this.lists.size + 1, ordered: list.ordered };
      this.lists.set(list.instance, entry);
    }
    return entry.numId;
  }
}

function imageXml(image: DocxImage, parts: PackageParts): string {
  const rId = parts.imageRel(image);
  const id = parts.images.length;
  // Unknown size: 4:3 at the text width's half, rather than a picture with no extent.
  const w = image.width > 0 ? image.width : 320;
  const h = image.width > 0 && image.height > 0 ? image.height : 240;
  let cx = Math.round(w * EMU_PER_PX);
  let cy = Math.round(h * EMU_PER_PX);
  if (cx > TEXT_WIDTH_EMU) {
    cy = Math.round((cy * TEXT_WIDTH_EMU) / cx);
    cx = TEXT_WIDTH_EMU;
  }
  const name = `Picture ${id}`;
  const descr = image.alt ? ` descr="${xmlText(image.alt)}"` : '';
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="${name}"${descr}/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="${PIC_NS}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"${descr}/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

function runXml(r: DocxRun, parts: PackageParts): string {
  if (r.type === 'image') return imageXml(r.image, parts);
  // In the schema's order: b, i, strike, u, vertAlign.
  const props =
    (r.bold ? '<w:b/>' : '') +
    (r.italic ? '<w:i/>' : '') +
    (r.strike ? '<w:strike/>' : '') +
    (r.underline ? '<w:u w:val="single"/>' : '') +
    (r.script ? `<w:vertAlign w:val="${r.script === 'sup' ? 'superscript' : 'subscript'}"/>` : '');
  const body = textXml(r.text);
  if (!body) return '';
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`;
}

function paragraphXml(p: DocxParagraph, parts: PackageParts): string {
  // In the schema's order: pStyle, then numPr.
  const style = p.heading ? `<w:pStyle w:val="Heading${p.heading}"/>` : '';
  const level = p.list ? Math.min(Math.max(Math.floor(p.list.level), 0), 8) : 0;
  const numbering = p.list ? `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${parts.numId(p.list)}"/></w:numPr>` : '';
  const props = style || numbering ? `<w:pPr>${style}${numbering}</w:pPr>` : '';
  const body = p.runs ? p.runs.map((r) => runXml(r, parts)).join('') : p.text ? run(p.text) : '';
  return `<w:p>${props}${body}</w:p>`;
}

function tableXml(rows: readonly DocxTableRow[], parts: PackageParts): string {
  const span = (cell: DocxTableCell) => Math.max(1, Math.floor(cell.span ?? 1));
  const columns = Math.max(1, ...rows.map((row) => row.cells.reduce((n, cell) => n + span(cell), 0)));
  const colWidth = Math.floor(TEXT_WIDTH_TWIPS / columns);
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
  const props =
    '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>';
  const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`;
  const rowXml = (row: DocxTableRow) => {
    // Rows shorter than the table get empty cells at the end: Word wants every row to fill the grid.
    const used = row.cells.reduce((n, cell) => n + span(cell), 0);
    const cells: DocxTableCell[] = [...row.cells, ...Array.from({ length: columns - used }, () => ({ paragraphs: [] }))];
    const tcs = cells
      .map((cell) => {
        const n = span(cell);
        const tcPr = `<w:tcPr><w:tcW w:w="${colWidth * n}" w:type="dxa"/>${n > 1 ? `<w:gridSpan w:val="${n}"/>` : ''}</w:tcPr>`;
        // A cell needs at least one paragraph, or Word calls the file damaged.
        const body = cell.paragraphs.length ? cell.paragraphs.map((p) => paragraphXml(p, parts)).join('') : '<w:p/>';
        return `<w:tc>${tcPr}${body}</w:tc>`;
      })
      .join('');
    return `<w:tr>${row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${tcs}</w:tr>`;
  };
  return `<w:tbl>${props}${grid}${rows.map(rowXml).join('')}</w:tbl>`;
}

function blockXml(block: DocxBlock, parts: PackageParts): string {
  if (block.type === 'pageBreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (block.type === 'table') return block.rows.length ? tableXml(block.rows, parts) : '';
  return paragraphXml(block, parts);
}

function bodyXml(blocks: readonly DocxBlock[], parts: PackageParts): string {
  // A4 portrait with 2.54 cm margins, in twentieths of a point.
  const section =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const body = blocks.map((b) => blockXml(b, parts)).join('');
  // Word wants a paragraph after a table that ends the body.
  const tail = blocks[blocks.length - 1]?.type === 'table' ? '<w:p/>' : '';
  return (
    `${XML_HEAD}<w:document xmlns:w="${W_NS}" xmlns:r="${DOC_REL}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">` +
    `<w:body>${body}${tail}${section}</w:body></w:document>`
  );
}

export function documentXml(blocks: readonly DocxBlock[]): string {
  return bodyXml(blocks, new PackageParts());
}

// Two abstract lists, 9 levels each: bullets (•, ◦, ▪ in turn) and numbers (1., a., i. in turn).
// Each list instance is its own <w:num>; a numbered one restarts at 1. mammoth reads a level's
// format to tell <ul> from <ol>.
export function numberingXml(lists: ReadonlyMap<number, { numId: number; ordered: boolean }>): string {
  const level = (ilvl: number, ordered: boolean) => {
    const fmt = ordered ? ['decimal', 'lowerLetter', 'lowerRoman'][ilvl % 3] : 'bullet';
    const text = ordered ? `%${ilvl + 1}.` : ['•', '◦', '▪'][ilvl % 3];
    return (
      `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${720 * (ilvl + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
    );
  };
  const abstract = (id: number, ordered: boolean) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => level(i, ordered)).join('')}</w:abstractNum>`;
  const nums = [...lists.values()]
    .map(
      ({ numId, ordered }) =>
        `<w:num w:numId="${numId}"><w:abstractNumId w:val="${ordered ? 1 : 0}"/>` +
        (ordered ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>' : '') +
        '</w:num>'
    )
    .join('');
  return `${XML_HEAD}<w:numbering xmlns:w="${W_NS}">${abstract(0, false)}${abstract(1, true)}${nums}</w:numbering>`;
}

// Normal text and three heading levels. The style names ("heading 1") are what Word's navigation
// pane and mammoth's <h1>/<h2> go by; the ids are what the paragraphs point at.
export function stylesXml(): string {
  const heading = (level: DocxHeading, halfPoints: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${halfPoints}"/></w:rPr></w:style>`;
  return (
    `${XML_HEAD}<w:styles xmlns:w="${W_NS}">` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading(1, 32) +
    heading(2, 26) +
    heading(3, 24) +
    '</w:styles>'
  );
}

function contentTypesXml(parts: PackageParts): string {
  const imageTypes = [...new Set(parts.images.map((i) => i.path.split('.').pop() as string))];
  return (
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    imageTypes.map((ext) => `<Default Extension="${ext}" ContentType="image/${ext}"/>`).join('') +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    (parts.lists.size
      ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
      : '') +
    '</Types>'
  );
}

const PACKAGE_RELS =
  `${XML_HEAD}<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="word/document.xml"/>` +
  '</Relationships>';

function documentRelsXml(parts: PackageParts): string {
  return (
    `${XML_HEAD}<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${DOC_REL}/styles" Target="styles.xml"/>` +
    (parts.lists.size ? `<Relationship Id="rId2" Type="${DOC_REL}/numbering" Target="numbering.xml"/>` : '') +
    parts.images.map((i) => `<Relationship Id="${i.rId}" Type="${DOC_REL}/image" Target="${i.path}"/>`).join('') +
    '</Relationships>'
  );
}

// Writes the package to `dest` (replaced if it exists). On a failure the partial file is deleted.
export function writeDocx(dest: File, blocks: readonly DocxBlock[]): void {
  // The body first: writing it collects the pictures and lists the other parts list.
  const parts = new PackageParts();
  const body = bodyXml(blocks, parts);
  const zip = createZip(dest);
  try {
    // [Content_Types].xml first: some readers expect it there.
    zip.addBytes('[Content_Types].xml', encodeUtf8(contentTypesXml(parts)));
    zip.addBytes('_rels/.rels', encodeUtf8(PACKAGE_RELS));
    zip.addBytes('word/document.xml', encodeUtf8(body));
    zip.addBytes('word/styles.xml', encodeUtf8(stylesXml()));
    zip.addBytes('word/_rels/document.xml.rels', encodeUtf8(documentRelsXml(parts)));
    if (parts.lists.size) zip.addBytes('word/numbering.xml', encodeUtf8(numberingXml(parts.lists)));
    for (const image of parts.images) zip.addBytes(`word/${image.path}`, image.bytes);
    zip.finish();
  } catch (e) {
    zip.abort();
    if (dest.exists) dest.delete();
    throw e;
  }
}
