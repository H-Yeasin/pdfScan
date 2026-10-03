import { File } from 'expo-file-system';
import type { LibraryDocument } from '../../types/models';
import { writeDocx } from '../convert/docxWriter';
import { docxToHtml } from '../documents/docxService';
import { PreviewTooLargeError } from '../documents/sheetService';
import { htmlToDocxBlocks } from './htmlToDocx';
import { saveEditCopy } from './sheetEdit';
import type { EditTarget } from './textEdit';

// §12 D9: editing a Word file's text (Pro, `editFiles`, D7's session rule). mammoth's HTML goes
// into a contenteditable page (components/reader/DocxEditor), and what the student leaves there
// comes back as HTML, which htmlToDocx turns into docxWriter's blocks. Styles, fonts, colours,
// headers, footers and page layout don't survive that trip, so the edit is always a new library
// document ("<name> (edited)") and the editor says so before saving; the original is never
// written.

// Lower than the viewer's 20 MB: the page holds the whole document, pictures inlined, as one
// string handed to the WebView.
export const DOCX_EDIT_MAX_BYTES = 10 * 1024 * 1024;

// The document as the editor gets it: mammoth's HTML with each picture tagged `data-img="N"`, and
// the pictures by N. The editor sends a picture the student kept back as its tag only, so a
// document full of photos doesn't cross the bridge twice as base64.
export type DocxForEdit = { html: string; images: string[] };

export function tagImages(html: string): DocxForEdit {
  const images: string[] = [];
  // mammoth writes every picture as <img src="data:…" …/> (docxService's convertImage).
  const tagged = html.replace(/<img\b([^>]*?)\ssrc="(data:[^"]*)"/g, (_whole, before: string, src: string) => {
    images.push(src);
    return `<img${before} data-img="${images.length - 1}" src="${src}"`;
  });
  return { html: tagged, images };
}

export async function loadDocxForEdit(uri: string): Promise<DocxForEdit> {
  const size = new File(uri).size ?? 0;
  if (size > DOCX_EDIT_MAX_BYTES) throw new PreviewTooLargeError(`${size} bytes`);
  return tagImages(await docxToHtml(uri));
}

// What the editor sends back, as the blocks of the new file. A picture tagged by the load comes
// back as its id; one with a data: URI of its own (none today: pasting is plain text) is read as is.
export function docxBlocksFromEditor(html: string, images: readonly string[]) {
  return htmlToDocxBlocks(html, { byId: (id) => images[Number(id)] });
}

export async function saveEditedDocx(target: EditTarget, html: string, images: readonly string[]): Promise<LibraryDocument> {
  const blocks = docxBlocksFromEditor(html, images);
  // The new file's text goes into its synthetic page through promoteExternalToLibrary's DOCX
  // branch (mammoth reads it back), so search finds the edited text.
  return saveEditCopy(target, 'DOCX', (temp) => writeDocx(temp, blocks));
}

// --- The editor page ---

// The commands the toolbar sends (DocxEditor). Anything else is ignored by the page.
export const DOCX_COMMANDS = ['bold', 'italic', 'h1', 'h2', 'ul', 'ol', 'undo'] as const;
export type DocxCommand = (typeof DOCX_COMMANDS)[number];

// What the page posts back (validated by parseEditorMessage).
export type DocxEditorMessage =
  | { type: 'ready' }
  | { type: 'dirty' }
  | { type: 'state'; bold: boolean; italic: boolean; block: string; ul: boolean; ol: boolean }
  | { type: 'html'; html: string };

export function parseEditorMessage(data: string): DocxEditorMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case 'ready':
    case 'dirty':
      return { type: o.type };
    case 'state':
      return { type: 'state', bold: o.bold === true, italic: o.italic === true, block: typeof o.block === 'string' ? o.block : '', ul: o.ul === true, ol: o.ol === true };
    case 'html':
      return typeof o.html === 'string' ? { type: 'html', html: o.html } : null;
    default:
      return null;
  }
}

// The JavaScript the toolbar injects for a command. Only known commands get through, as a JSON
// string, so nothing from outside ends up in the script.
export function commandScript(command: DocxCommand): string {
  if (!DOCX_COMMANDS.includes(command)) return 'true;';
  return `window.__pdfscan && window.__pdfscan.run(${JSON.stringify(command)}); true;`;
}

export const REQUEST_HTML_SCRIPT = 'window.__pdfscan && window.__pdfscan.html(); true;';

// The page's own script. It runs only in the editor's WebView (DocxView stays JavaScript-free).
// - Enter makes a <p> (Chrome's default is a <div>), so paragraphs stay paragraphs.
// - Tapping the native toolbar may take the selection from the page, so the last selection inside
//   the editor is kept and put back before a command runs.
// - Paste is plain text: pasted HTML could carry pictures from the web (blocked by the CSP anyway)
//   and styles htmlToDocx would drop. Dropping files in is refused.
// - Export clones the body and strips the src of the pictures that have an id (see tagImages).
const EDITOR_SCRIPT = `(function () {
  var ed = document.getElementById('ed');
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var saved = null;
  var dirty = false;
  document.execCommand('defaultParagraphSeparator', false, 'p');
  function inside(node) { return !!node && (node === ed || ed.contains(node)); }
  function block() { return String(document.queryCommandValue('formatBlock') || '').toLowerCase(); }
  function report() {
    post({ type: 'state', bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), block: block(),
      ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList') });
  }
  function changed() { if (!dirty) { dirty = true; post({ type: 'dirty' }); } }
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (sel && sel.rangeCount && inside(sel.anchorNode)) { saved = sel.getRangeAt(0).cloneRange(); report(); }
  });
  ed.addEventListener('input', function () { changed(); report(); });
  ed.addEventListener('paste', function (e) {
    e.preventDefault();
    var text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    document.execCommand('insertText', false, text);
  });
  ed.addEventListener('drop', function (e) { e.preventDefault(); });
  ed.addEventListener('dragover', function (e) { e.preventDefault(); });
  function restore() {
    ed.focus();
    if (saved) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(saved); }
  }
  var LISTS = { ul: 'insertUnorderedList', ol: 'insertOrderedList' };
  window.__pdfscan = {
    run: function (cmd) {
      restore();
      if (cmd === 'h1' || cmd === 'h2') document.execCommand('formatBlock', false, block() === cmd ? '<p>' : '<' + cmd + '>');
      else if (LISTS[cmd]) document.execCommand(LISTS[cmd], false, null);
      else if (cmd === 'bold' || cmd === 'italic' || cmd === 'undo') document.execCommand(cmd, false, null);
      else return;
      if (cmd !== 'undo') changed();
      report();
    },
    html: function () {
      var copy = ed.cloneNode(true);
      var imgs = copy.querySelectorAll('img[data-img]');
      for (var i = 0; i < imgs.length; i++) imgs[i].removeAttribute('src');
      post({ type: 'html', html: copy.innerHTML });
    }
  };
  post({ type: 'ready' });
})();`;

// A complete editor page around tagImages' HTML. JavaScript is on here only for our own script:
// the CSP allows exactly the inline script carrying `nonce` (a fresh one per page), no other
// script, no network, pictures only as data: URIs; the WebView refuses every navigation too.
export function docxEditorHtml(body: string, colors: { bg: string; ink: string; muted: string; edge: string; accent: string }, nonce: string, placeholder: string): string {
  const safeNonce = nonce.replace(/[^A-Za-z0-9]/g, '');
  const safePlaceholder = placeholder.replace(/[\\"]/g, '\\$&').replace(/[<>\n\r]/g, ' ');
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${safeNonce}'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; background: ${colors.bg}; }
  #ed { color: ${colors.ink}; font: 16px/1.55 -apple-system, Roboto, sans-serif; min-height: 100vh; box-sizing: border-box; padding: 20px 18px 120px; outline: none; overflow-wrap: break-word; caret-color: ${colors.accent}; }
  #ed:empty::before { content: "${safePlaceholder}"; color: ${colors.muted}; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.5em; }
  p { margin: 0 0 0.8em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 0 0 1em; }
  td, th { border: 1px solid ${colors.edge}; padding: 4px 8px; vertical-align: top; min-width: 2em; }
  a { color: ${colors.accent}; }
</style>
</head><body><div id="ed" contenteditable="true" spellcheck="true">${body}</div>
<script nonce="${safeNonce}">${EDITOR_SCRIPT}</script>
</body></html>`;
}
