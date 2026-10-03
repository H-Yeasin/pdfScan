import * as Print from 'expo-print';
import { File } from 'expo-file-system';
import { docxPageHtml, docxToHtml, PRINT_PAGE_CSS } from '../documents/docxService';
import { loadSheets, PreviewTooLargeError, type Sheet, type SheetFormat } from '../documents/sheetService';
import { readTextWithEncodingFallback } from '../documents/txtService';
import { addPdfFileToLibrary } from '../persistence/libraryOperations';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import { tokens as themes } from '../../theme/tokens';
import type { DocFormat, LibraryDocument } from '../../types/models';

// §12 D5: Office → PDF. Each source format becomes one printable HTML page, which expo-print
// (the system WebView's print path, offline) turns into a PDF; the PDF then joins the library as
// an imported PDF, so R1 indexes it (thumbnails, search) and merge, sign and submit work on it.
// The original file is never touched.
//
// The files come from outside the app, so every cell and line is escaped, mammoth's HTML has no
// scripts, and each page carries DocxView's CSP (no scripts, no network, images only as data:).

export type ConvertSource = { uri: string; name: string; format: DocFormat };

// A4 at 72 points per inch (expo-print's unit), the paper students hand in here.
export const A4 = { width: 595, height: 842 } as const;

// A sheet wider than this is printed landscape: a 9th column on portrait A4 gets too narrow to read.
export const LANDSCAPE_AFTER_COLUMNS = 8;

// TXT has no reader cap (TxtView pages through it), but the print WebView holds it all at once.
export const TXT_PRINT_MAX_BYTES = 2 * 1024 * 1024;

// The paper is white whatever the app theme is; the ink is the light theme's.
const PAPER = { bg: '#ffffff', ink: themes.light.ink, muted: themes.light.muted, edge: '#b9b4ab', accent: themes.light.accentInk };

const CSP = `default-src 'none'; img-src data:; style-src 'unsafe-inline'`;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type PrintHtml = { html: string; landscape: boolean };

function printPage(body: string, css: string): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
  body { background: ${PAPER.bg}; color: ${PAPER.ink}; font: 11pt/1.45 -apple-system, Roboto, sans-serif; margin: 0; overflow-wrap: break-word; }${PRINT_PAGE_CSS}${css}
</style>
</head><body>${body}</body></html>`;
}

// DOCX: mammoth's HTML (headings, lists, tables, bold/italic, pictures) in the preview's page,
// on paper. Page setup, headers/footers and fonts aren't in mammoth's output, so they're lost.
export async function docxPrintHtml(uri: string): Promise<PrintHtml> {
  const body = await docxToHtml(uri);
  return { html: docxPageHtml(body, PAPER, { print: true }), landscape: false };
}

function columnCount(sheet: Sheet): number {
  return sheet.rows.reduce((n, row) => Math.max(n, row.length), 0);
}

function sheetTable(sheet: Sheet): string {
  const columns = columnCount(sheet);
  if (columns === 0) return '';
  const cells = (row: string[], tag: 'th' | 'td') =>
    Array.from({ length: columns }, (_, i) => `<${tag}>${escapeHtml(row[i] ?? '')}</${tag}>`).join('');
  const [header, ...body] = sheet.rows;
  // The first row is the header: in a <thead>, the print engine repeats it on every page.
  return `<table><thead><tr>${cells(header, 'th')}</tr></thead><tbody>${body.map((row) => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table>`;
}

// XLSX/XLS/CSV: loadSheets (with its size and cell caps), one table per sheet, each sheet from
// a new page under its name. A CSV's one sheet has no name of its own, so no heading. Values only:
// formulas, styles, merged cells and charts are lost.
export async function sheetPrintHtml(uri: string, format: SheetFormat): Promise<PrintHtml> {
  const sheets = await loadSheets(uri, format);
  const named = format !== 'CSV';
  const body = sheets
    .map((sheet, i) => {
      const heading = named ? `<h2>${escapeHtml(sheet.name)}</h2>` : '';
      return `<section class="sheet${i > 0 ? ' next' : ''}">${heading}${sheetTable(sheet)}</section>`;
    })
    .join('');
  const landscape = sheets.some((sheet) => columnCount(sheet) > LANDSCAPE_AFTER_COLUMNS);
  const css = `
  h2 { font-size: 13pt; margin: 0 0 8pt; }
  .next { page-break-before: always; break-before: page; }
  table { border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  th, td { border: 0.5pt solid ${PAPER.edge}; padding: 2pt 4pt; text-align: left; vertical-align: top; }
  th { background: #f1ede6; font-weight: 600; }`;
  return { html: printPage(body, css), landscape };
}

// TXT: the text as it is, lines and spacing kept, long lines wrapped.
export async function txtPrintHtml(uri: string): Promise<PrintHtml> {
  const size = new File(uri).size ?? 0;
  if (size > TXT_PRINT_MAX_BYTES) throw new PreviewTooLargeError(`${size} bytes`);
  const { text } = await readTextWithEncodingFallback(uri);
  const css = `
  pre { font: 10pt/1.45 ui-monospace, Menlo, 'Roboto Mono', monospace; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }`;
  return { html: printPage(`<pre>${escapeHtml(text)}</pre>`, css), landscape: false };
}

export async function printHtmlFor(source: Pick<ConvertSource, 'uri' | 'format'>): Promise<PrintHtml> {
  switch (source.format) {
    case 'DOCX':
      return docxPrintHtml(source.uri);
    case 'XLSX':
    case 'XLS':
    case 'CSV':
      return sheetPrintHtml(source.uri, source.format);
    case 'TXT':
      return txtPrintHtml(source.uri);
    default:
      throw new Error(`Can't convert ${source.format} to PDF`);
  }
}

// The whole conversion: a new library document named like the source, as a PDF. The temporary
// print file is deleted whatever happens; a failure (too large, unreadable) leaves nothing in
// library/ and passes through to the caller.
export async function convertToPdf(source: ConvertSource): Promise<LibraryDocument> {
  const { html, landscape } = await printHtmlFor(source);
  const page = landscape ? { width: A4.height, height: A4.width } : A4;
  const printed = await Print.printToFileAsync({ html, ...page });
  try {
    return addPdfFileToLibrary(printed.uri, source.name, printed.numberOfPages);
  } finally {
    cleanTemporaryCache([printed.uri]);
  }
}
