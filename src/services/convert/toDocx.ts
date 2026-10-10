import { Directory, File, Paths } from 'expo-file-system';
import { tDoc } from '../../i18n';
import { MASTER_JPEG_Q, MASTER_MAX_DIM } from '../capture/imageSpec';
import { pdfTextToOcr } from '../documents/importedPdfIndex';
import { isPdfLevel } from '../documents/formatCapabilities';
import { withPageBlocks } from '../documents/pageOcr';
import { runOcr } from '../ocr/ocrService';
import { PdfEncryptedError, PdfNativeUnavailableError, getPageCount, getPageText, renderPage } from '../pdf/pdfNative';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import { promoteExternalToLibrary } from '../persistence/libraryOperations';
import type { LibraryDocument, LibraryPage, OcrBounding, OcrLine, OcrScript, PageOcr } from '../../types/models';
import { createId } from '../../utils/id';
import { writeDocx, type DocxBlock, type DocxHeading } from './docxWriter';

// §12 D6: scan/PDF → Word. Each page's text (a scan's OCR, an imported PDF's own text layer, or
// OCR of a page that has none) becomes paragraphs and headings in a new DOCX, one page after the
// other with a page break between. It keeps the text and its order, not the layout: no columns,
// tables, pictures or fonts. The original document is never touched; the DOCX joins the library
// through promoteExternalToLibrary's DOCX branch, so search finds it.
//
// Pages are read one at a time (a rendered page for OCR is deleted before the next one).

// What is converted: a library scan or imported PDF, or a PDF opened from outside (its app-owned
// copy, not in the library).
export type WordSource =
  | { kind: 'library'; doc: LibraryDocument; script: OcrScript }
  | { kind: 'pdfFile'; uri: string; name: string; script: OcrScript };

export type WordProgress = { done: number; total: number };

// --- Text → paragraphs (pure) --------------------------------------------------------------------

// A line clearly taller than the page's usual line is a heading; much taller, a top-level one.
export const HEADING_RATIO = 1.35;
export const HEADING1_RATIO = 1.8;
// Headings are short; a long tall line is more likely a big-print paragraph.
const HEADING_MAX_CHARS = 120;
// A gap between lines wider than this (× the usual line height) starts a new paragraph.
export const PARAGRAPH_GAP_RATIO = 0.8;

type Line = { text: string; box: OcrBounding; block: number };

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function unionBox(a: OcrBounding, b: OcrBounding): OcrBounding {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

// The words of one line, in order. ML Kit's line text is already that; a line rebuilt from words
// (an imported PDF's, in pdfTextToOcr) too. Words are the fallback when a line has no text.
function lineText(line: OcrLine): string {
  const text = line.text.trim() || (line.words ?? []).map((w) => w.text).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

// Lines in reading order, as the blocks give them (a column at a time). Consecutive lines on the
// same baseline are one visual line that OCR split ("Name:" and "Rahim" read as two blocks), so
// they're joined back: they overlap vertically by more than half the smaller one's height, and the
// second starts to the right of the first.
export function readingLines(ocr: PageOcr): Line[] {
  const lines: Line[] = [];
  ocr.blocks.forEach((block, b) => {
    for (const line of block.lines) {
      const text = lineText(line);
      if (!text) continue;
      const prev = lines[lines.length - 1];
      if (prev && sameRow(prev.box, line.bounding) && line.bounding.left >= prev.box.left + prev.box.width - prev.box.height / 2) {
        prev.text = `${prev.text} ${text}`;
        prev.box = unionBox(prev.box, line.bounding);
        continue;
      }
      lines.push({ text, box: { ...line.bounding }, block: b });
    }
  });
  return lines;
}

function sameRow(a: OcrBounding, b: OcrBounding): boolean {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return overlap > 0.5 * Math.min(a.height, b.height);
}

// "infor-" + "mation" → "information": a hyphen at the end of a line followed by a lower-case
// letter was only there to break the word. Anything else is joined with a space.
function joinLines(a: string, b: string): string {
  if (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

function headingLevel(height: number, usual: number, text: string): DocxHeading | undefined {
  if (usual <= 0 || text.length > HEADING_MAX_CHARS) return undefined;
  if (height >= usual * HEADING1_RATIO) return 1;
  if (height >= usual * HEADING_RATIO) return 2;
  return undefined;
}

// One page's text as Word paragraphs. A new paragraph starts at a new OCR block, after a gap wider
// than PARAGRAPH_GAP_RATIO lines, when the text jumps back up the page (the next column), or where
// a heading starts or ends. Text without boxes (an old page) is split at its blank lines.
export function paragraphsFromOcr(ocr: PageOcr | undefined): DocxBlock[] {
  if (!ocr) return [];
  const lines = readingLines(ocr);
  if (!lines.length) {
    return ocr.text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph', text }));
  }

  const usual = median(lines.map((l) => l.box.height));
  // The page's median is the body text's line height only when there's enough body; one or two
  // lines can't tell a heading from text.
  const levels = lines.map((l) => (lines.length >= 3 ? headingLevel(l.box.height, usual, l.text) : undefined));

  const blocks: DocxBlock[] = [];
  let text = '';
  let level: DocxHeading | undefined;
  const flush = () => {
    if (text) blocks.push(level ? { type: 'paragraph', text, heading: level } : { type: 'paragraph', text });
    text = '';
  };
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    if (prev) {
      const gap = line.box.top - (prev.box.top + prev.box.height);
      const newParagraph =
        line.block !== prev.block ||
        levels[i] !== levels[i - 1] ||
        gap > PARAGRAPH_GAP_RATIO * Math.max(usual, Math.min(prev.box.height, line.box.height)) ||
        gap < -prev.box.height;
      if (newParagraph) flush();
    }
    level = levels[i];
    text = text ? joinLines(text, line.text) : line.text;
  });
  flush();
  return blocks;
}

// The whole document: each page's paragraphs, a page break between pages, and a short line for a
// page where no text was found (so the page numbers still line up with the original).
export function docxBlocksFromPages(pages: readonly (PageOcr | undefined)[]): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  pages.forEach((ocr, i) => {
    if (i > 0) blocks.push({ type: 'pageBreak' });
    const paragraphs = paragraphsFromOcr(ocr);
    blocks.push(...(paragraphs.length ? paragraphs : [{ type: 'paragraph' as const, text: tDoc('document.word.noText', { page: i + 1 }) }]));
  });
  return blocks;
}

// --- Reading the pages ---------------------------------------------------------------------------

const hasText = (ocr: PageOcr | undefined): ocr is PageOcr => !!ocr?.text.trim();

// A PDF page's text: its own text layer, else OCR of the page rendered as a master (a scanned
// handout). Best-effort like OCR everywhere: a page that can't be read gives undefined; only a
// password (or a build without the PDF module) stops the conversion.
async function pdfPageText(uri: string, index: number, script: OcrScript): Promise<PageOcr | undefined> {
  try {
    const text = await getPageText(uri, index);
    if (text.text.trim()) return pdfTextToOcr(text);
    const master = await renderPage(uri, index, { maxDim: MASTER_MAX_DIM, quality: MASTER_JPEG_Q });
    try {
      return await runOcr(master.uri, script);
    } finally {
      cleanTemporaryCache([master.uri]);
    }
  } catch (error) {
    if (error instanceof PdfEncryptedError || error instanceof PdfNativeUnavailableError) throw error;
    console.warn(`toDocx: no text for PDF page ${index + 1}`, error);
    return undefined;
  }
}

// A library page: the text it already has (a scan's OCR, or the text R1 read from an imported
// PDF), else OCR that can still run - on a scan's master, or on the imported page rendered now.
async function libraryPageText(doc: LibraryDocument, page: LibraryPage, index: number, script: OcrScript): Promise<PageOcr | undefined> {
  if (hasText(page.ocr)) return page.ocr;
  if (isPdfLevel(doc)) return doc.pdfUri ? pdfPageText(doc.pdfUri, index, script) : undefined;
  if (!page.fileUri) return undefined;
  try {
    return await runOcr(page.fileUri, script);
  } catch (error) {
    console.warn(`toDocx: OCR failed on page ${index + 1}`, error);
    return undefined;
  }
}

export async function readPagesText(source: WordSource, onProgress?: (p: WordProgress) => void): Promise<(PageOcr | undefined)[]> {
  const out: (PageOcr | undefined)[] = [];
  if (source.kind === 'library') {
    const { doc, script } = source;
    // §16 G4: paragraphs and headings are worked out from the lines' boxes, which the library
    // load leaves in the database.
    const pages = await withPageBlocks(doc.pages);
    for (let i = 0; i < pages.length; i += 1) {
      onProgress?.({ done: i, total: pages.length });
      out.push(await libraryPageText(doc, pages[i], i, script));
    }
    return out;
  }
  const total = await getPageCount(source.uri);
  for (let i = 0; i < total; i += 1) {
    onProgress?.({ done: i, total });
    out.push(await pdfPageText(source.uri, i, source.script));
  }
  return out;
}

function sourceName(source: WordSource): string {
  return source.kind === 'library' ? source.doc.name : source.name;
}

// The whole conversion: a new DOCX library document named like the source. The temporary file is
// deleted whatever happens; a failure (a password, a build without the PDF module) leaves nothing
// in library/ and passes through to the caller.
export async function convertToWord(source: WordSource, onProgress?: (p: WordProgress) => void): Promise<LibraryDocument> {
  const pages = await readPagesText(source, onProgress);
  const dir = new Directory(Paths.cache, 'convert');
  if (!dir.exists) dir.create({ intermediates: true });
  const temp = new File(dir, `${createId('tmp')}.docx`);
  try {
    writeDocx(temp, docxBlocksFromPages(pages));
    return await promoteExternalToLibrary({
      uri: temp.uri,
      name: sourceName(source),
      format: 'DOCX',
      sizeBytes: temp.size ?? 0,
      sourceUri: temp.uri,
      importedAt: Date.now(),
    });
  } finally {
    cleanTemporaryCache([temp.uri]);
  }
}
