import { File } from 'expo-file-system';
import type MammothTypes from 'mammoth';
import { PreviewTooLargeError } from './sheetService';

// §7 R5: DOCX is preview-only - mammoth turns it into plain semantic HTML (headings, lists,
// tables, bold/italic) shown in a locked-down WebView (components/reader/DocxView), and its text
// goes into the page text so library search finds it. No editing; §12 D5 prints the same HTML to
// a PDF (services/convert/toPdf).

// §9 O5: loaded on first use - only the DOCX preview and its text extraction need mammoth.
let mammothModule: typeof MammothTypes | null = null;
function mammoth(): typeof MammothTypes {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mammothModule ??= (require('mammoth') as { default?: typeof MammothTypes }).default ?? (require('mammoth') as typeof MammothTypes);
  return mammothModule;
}

// Higher than the sheet cap: a DOCX is mostly its embedded photos, which are inlined, not parsed.
export const DOCX_MAX_BYTES = 20 * 1024 * 1024;

async function readDocx(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  if ((file.size ?? 0) > DOCX_MAX_BYTES) throw new PreviewTooLargeError(`${file.size} bytes`);
  return file.arrayBuffer();
}

// mammoth's browser build (what Metro bundles, via its package.json "browser" field) reads
// `arrayBuffer`; its Node build (Jest) reads `buffer`. Both hand the bytes to JSZip, which takes
// an ArrayBuffer either way (React Native has no Buffer).
function input(bytes: ArrayBuffer): { arrayBuffer: ArrayBuffer } {
  return { arrayBuffer: bytes, buffer: bytes } as { arrayBuffer: ArrayBuffer };
}

// The document body as HTML. Images become data: URIs (the WebView loads nothing from anywhere).
export async function docxToHtml(uri: string): Promise<string> {
  const bytes = await readDocx(uri);
  const result = await mammoth().convertToHtml(input(bytes), { convertImage: mammoth().images.dataUri });
  return result.value;
}

// The document's plain text, for search.
export async function extractDocxText(uri: string): Promise<string> {
  const bytes = await readDocx(uri);
  const result = await mammoth().extractRawText(input(bytes));
  return result.value.replace(/\n{3,}/g, '\n\n').trim();
}

// The page's own print rules (§12 D5, Office → PDF): the paper's margins instead of the screen
// padding, tables laid out in full (not scrolled), and a row or picture never cut across pages.
export const PRINT_PAGE_CSS = `
  @page { margin: 16mm 14mm; }
  body { padding: 0; font-size: 11pt; }
  table { display: table; width: auto; max-width: 100%; }
  tr, img { break-inside: avoid; page-break-inside: avoid; }`;

// A complete page around docxToHtml's body. The CSP is the second lock after the WebView's own
// settings (no bridge, navigation blocked): no scripts of the document's own (inline, linked or a
// javascript: link), no network, images only as data: URIs. The app's own injected script (§12
// D11's scroll to a find mark) runs outside the CSP.
// `print`: for expo-print (D5), which renders it the same locked-down way. `find`: the colours of
// §12 D11's find marks (services/documents/docxFind), the first match stronger than the rest.
export function docxPageHtml(
  body: string,
  colors: { bg: string; ink: string; muted: string; edge: string; accent: string },
  opts: { print?: boolean; find?: { fill: string; current: string; onCurrent: string } } = {}
): string {
  const findCss = opts.find
    ? `
  mark.pdfscan-find { background: ${opts.find.fill}; color: inherit; border-radius: 2px; }
  mark.pdfscan-current { background: ${opts.find.current}; color: ${opts.find.onCurrent}; }`
    : '';
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: ${colors.bg}; color: ${colors.ink}; font: 16px/1.55 -apple-system, Roboto, sans-serif; margin: 0; padding: 20px 18px 48px; overflow-wrap: break-word; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.5em; }
  p { margin: 0 0 0.8em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; display: block; overflow-x: auto; margin: 0 0 1em; }
  td, th { border: 1px solid ${colors.edge}; padding: 4px 8px; vertical-align: top; }
  a { color: ${colors.accent}; }
  blockquote { border-left: 3px solid ${colors.edge}; color: ${colors.muted}; margin: 0 0 1em; padding-left: 12px; }${opts.print ? PRINT_PAGE_CSS : ''}${findCss}
</style>
</head><body>${body}</body></html>`;
}
