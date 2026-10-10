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

// The page's own padding, in CSS px; the Reader's bars add to it (docxBridge's setInsets uses the
// same numbers, so the padding it sets later agrees with what the page was built with).
export const DOCX_BODY_PAD = { top: 20, side: 18, bottom: 48 } as const;

export type DocxColors = { bg: string; ink: string; muted: string; edge: string; accent: string };
// Find's marks (services/documents/docxBridge): every match, and the one Find is on.
export type DocxFindColors = { fill: string; current: string; onCurrent: string };
export type DocxPad = { top?: number; bottom?: number; left?: number; right?: number };

// A number only, so nothing but a length can reach the style sheet.
function px(base: number, extra: unknown): number {
  return base + Math.max(0, Math.round(Number(extra) || 0));
}

// A complete page around docxToHtml's body. The CSP is the second lock after the WebView's own
// settings (navigation blocked, a bridge whose messages are checked against a strict schema): no
// scripts of the document's own (inline, linked or a javascript: link), no network, images only as
// data: URIs. The app's own injected script (docxBridge.DOCX_BRIDGE_SCRIPT) runs outside the CSP.
// `padTop` (§18 W4) / `pad` (§18 W22): room for the Reader's bars around the text, in CSS px -
// they lie over the page, and without it the document's first lines sat hidden under the top bar.
// `print`: for expo-print (D5), which renders it the same locked-down way. `find`: the colours of
// Find's marks. `night` (§18 W22): the second palette, as `body.night` rules, and whether the page
// starts in it - the viewer switches by setting the body's class, with no reload.
export function docxPageHtml(
  body: string,
  colors: DocxColors,
  opts: { print?: boolean; find?: DocxFindColors; padTop?: number; pad?: DocxPad; night?: { on: boolean; colors: DocxColors; find?: DocxFindColors } } = {}
): string {
  const findCss = opts.find
    ? `
  mark.pdfscan-find { background: ${opts.find.fill}; color: inherit; border-radius: 2px; }
  mark.pdfscan-current { background: ${opts.find.current}; color: ${opts.find.onCurrent}; }`
    : '';
  const night = opts.night;
  const nightCss = night
    ? `
  body.night { background: ${night.colors.bg}; color: ${night.colors.ink}; }
  body.night td, body.night th { border-color: ${night.colors.edge}; }
  body.night a { color: ${night.colors.accent}; }
  body.night blockquote { border-left-color: ${night.colors.edge}; color: ${night.colors.muted}; }${
    night.find
      ? `
  body.night mark.pdfscan-find { background: ${night.find.fill}; }
  body.night mark.pdfscan-current { background: ${night.find.current}; color: ${night.find.onCurrent}; }`
      : ''
  }`
    : '';
  const top = px(DOCX_BODY_PAD.top, opts.pad?.top ?? opts.padTop);
  const right = px(DOCX_BODY_PAD.side, opts.pad?.right);
  const bottom = px(DOCX_BODY_PAD.bottom, opts.pad?.bottom);
  const left = px(DOCX_BODY_PAD.side, opts.pad?.left);
  const padding = left === right ? `${top}px ${right}px ${bottom}px` : `${top}px ${right}px ${bottom}px ${left}px`;
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: ${colors.bg}; color: ${colors.ink}; font: 16px/1.55 -apple-system, Roboto, sans-serif; margin: 0; padding: ${padding}; overflow-wrap: break-word; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.5em; }
  p { margin: 0 0 0.8em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; display: block; overflow-x: auto; margin: 0 0 1em; }
  td, th { border: 1px solid ${colors.edge}; padding: 4px 8px; vertical-align: top; }
  a { color: ${colors.accent}; }
  blockquote { border-left: 3px solid ${colors.edge}; color: ${colors.muted}; margin: 0 0 1em; padding-left: 12px; }${opts.print ? PRINT_PAGE_CSS : ''}${findCss}${nightCss}
</style>
</head><body${night?.on ? ' class="night"' : ''}>${body}</body></html>`;
}
