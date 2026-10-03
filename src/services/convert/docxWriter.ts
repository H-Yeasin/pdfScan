import type { File } from 'expo-file-system';
import { createZip } from '../backup/zip';
import { encodeUtf8 } from '../backup/zip/utf8';

// §12 D6: writes a minimal Word file - the five parts Word, LibreOffice, Google Docs and mammoth
// need (content types, the package and document relationships, the body, the styles) - into a
// store-only zip, which is a valid DOCX. Nothing else: no fonts, pictures, numbering or settings,
// because what we write is the text of a page and its order, not its layout.
//
// The text comes from OCR or from a PDF someone else made, so all of it is XML-escaped, and the
// characters XML 1.0 forbids (control characters, lone surrogates) are dropped: one of them would
// make Word refuse the whole file.

export type DocxHeading = 1 | 2;

export type DocxBlock =
  // `text` may hold '\n': a line break inside the paragraph.
  | { type: 'paragraph'; text: string; heading?: DocxHeading }
  | { type: 'pageBreak' };

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

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

function run(text: string): string {
  // Tabs and line breaks are their own elements in WordprocessingML; inside <w:t> they'd be
  // read as plain spaces.
  const parts = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .split('\t')
        .map((piece) => (piece ? `<w:t xml:space="preserve">${xmlText(piece)}</w:t>` : ''))
        .join('<w:tab/>')
    );
  return `<w:r>${parts.join('<w:br/>')}</w:r>`;
}

function blockXml(block: DocxBlock): string {
  if (block.type === 'pageBreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const style = block.heading ? `<w:pPr><w:pStyle w:val="Heading${block.heading}"/></w:pPr>` : '';
  return `<w:p>${style}${run(block.text)}</w:p>`;
}

export function documentXml(blocks: readonly DocxBlock[]): string {
  // A4 portrait with 2.54 cm margins, in twentieths of a point.
  const section =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  return `${XML_HEAD}<w:document xmlns:w="${W_NS}"><w:body>${blocks.map(blockXml).join('')}${section}</w:body></w:document>`;
}

// Normal text and two heading levels. The style names ("heading 1") are what Word's navigation
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
    '</w:styles>'
  );
}

const CONTENT_TYPES =
  `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const PACKAGE_RELS =
  `${XML_HEAD}<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="word/document.xml"/>` +
  '</Relationships>';

const DOCUMENT_RELS =
  `${XML_HEAD}<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${DOC_REL}/styles" Target="styles.xml"/>` +
  '</Relationships>';

// Writes the package to `dest` (replaced if it exists). On a failure the partial file is deleted.
export function writeDocx(dest: File, blocks: readonly DocxBlock[]): void {
  const zip = createZip(dest);
  try {
    // [Content_Types].xml first: some readers expect it there.
    zip.addBytes('[Content_Types].xml', encodeUtf8(CONTENT_TYPES));
    zip.addBytes('_rels/.rels', encodeUtf8(PACKAGE_RELS));
    zip.addBytes('word/document.xml', encodeUtf8(documentXml(blocks)));
    zip.addBytes('word/styles.xml', encodeUtf8(stylesXml()));
    zip.addBytes('word/_rels/document.xml.rels', encodeUtf8(DOCUMENT_RELS));
    zip.finish();
  } catch (e) {
    zip.abort();
    if (dest.exists) dest.delete();
    throw e;
  }
}
