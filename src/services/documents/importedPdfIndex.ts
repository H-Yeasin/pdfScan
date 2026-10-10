import { File } from 'expo-file-system';
import { MASTER_JPEG_Q, MASTER_MAX_DIM, THUMB_JPEG_Q, THUMB_MAX_DIM } from '../capture/imageSpec';
import { processSequentially, type BatchProgress } from '../capture/processSequentially';
import { runOcr } from '../ocr/ocrService';
import { cleanTemporaryCache, getDocumentDir } from '../persistence/libraryFiles';
import {
  PdfEncryptedError,
  getPageCount,
  getPageText,
  renderPage,
  type PdfPageText,
} from '../pdf/pdfNative';
import type { IndexState, LibraryDocument, LibraryPage, OcrBlock, OcrLine, OcrScript, OcrWord, PageOcr } from '../../types/models';
import { createId } from '../../utils/id';

// §7 R1: an imported PDF's pages become real page rows - a thumbnail and the page's text each -
// so the library shows them and search finds words inside them. Pages map 1:1 to the PDF's
// pages. Masters are NOT stored (a lecture PDF is already sharp, and 2400 px JPEGs of every page
// would multiply its size); whatever needs pixels renders the page on demand.

// A very long PDF (a whole textbook) is indexed only this far, so one import can't keep the phone
// busy for an hour; the library says "Search covers the first 300 pages".
export const INDEX_MAX_PAGES = 300;

// How often (in pages) a long run hands its progress to onCommit, so an interrupted run resumes
// where it stopped instead of starting over. §16 G7: a commit costs its ten rows and no more -
// the library sync writes only the pages that changed (libraryRepo.changedPages).
const COMMIT_EVERY = 10;

// §16 G7: how often, at most, a run's progress reaches the screen. A PDF with a text layer is
// read at many pages a second, and each report re-renders whatever shows the count.
export const PROGRESS_EVERY_MS = 500;

// `send`, held to one call per `everyMs`. The first report and the last one (done === total)
// always go through, so the count never stops short of the end.
export function throttleProgress(
  send: (progress: BatchProgress) => void,
  everyMs = PROGRESS_EVERY_MS,
  now: () => number = Date.now
): (progress: BatchProgress) => void {
  let sentAt: number | null = null;
  return (progress) => {
    const at = now();
    if (sentAt !== null && progress.done < progress.total && at - sentAt < everyMs) return;
    sentAt = at;
    send(progress);
  };
}

export function needsIndexing(doc: LibraryDocument): boolean {
  return doc.sourceKind === 'imported_pdf' && doc.format === 'PDF' && !!doc.pdfUri && doc.indexedAt === undefined;
}

// A page is indexed once it has its thumbnail, which is written last.
function isIndexed(page: LibraryPage | undefined): boolean {
  return !!page?.thumbUri;
}

function stubPage(): LibraryPage {
  return { id: createId('page'), fileUri: '', width: 850, height: 1100 };
}

// The pixel size of the page rendered as a master (MASTER_MAX_DIM on the long side). Word boxes
// and width/height are stored in this space, like a scan's OCR boxes, so everything that reads
// page.ocr works the same for both.
export function masterSizeFor(points: { width: number; height: number }): { width: number; height: number; scale: number } {
  const scale = MASTER_MAX_DIM / Math.max(points.width, points.height, 1);
  return { width: Math.max(1, Math.round(points.width * scale)), height: Math.max(1, Math.round(points.height * scale)), scale };
}

// The PDF's words (points) as OCR data (master pixels): words are grouped into lines (a word that
// doesn't overlap the line vertically, or jumps back to the left, starts a new one) and lines into
// blocks (a gap of more than a line's height starts a new block). The text is the PDF's own.
export function pdfTextToOcr(page: PdfPageText): PageOcr {
  const { scale } = masterSizeFor(page);
  const words: OcrWord[] = page.words
    .filter((w) => w.text.trim() && w.width >= 0 && w.height >= 0)
    .map((w) => ({
      text: w.text,
      bounding: { left: w.left * scale, top: w.top * scale, width: w.width * scale, height: w.height * scale },
    }));

  const lines: OcrLine[] = [];
  let current: OcrWord[] = [];
  const flushLine = () => {
    if (current.length) lines.push({ text: current.map((w) => w.text).join(' '), bounding: union(current.map((w) => w.bounding)), words: current });
    current = [];
  };
  for (const word of words) {
    const last = current[current.length - 1];
    if (last) {
      const lineBox = union(current.map((w) => w.bounding));
      const mid = word.bounding.top + word.bounding.height / 2;
      const sameRow = mid >= lineBox.top && mid <= lineBox.top + lineBox.height;
      const forward = word.bounding.left >= last.bounding.left;
      if (!sameRow || !forward) flushLine();
    }
    current.push(word);
  }
  flushLine();

  const blocks: OcrBlock[] = [];
  let blockLines: OcrLine[] = [];
  const flushBlock = () => {
    if (blockLines.length) {
      blocks.push({ text: blockLines.map((l) => l.text).join('\n'), lines: blockLines, bounding: union(blockLines.map((l) => l.bounding)) });
    }
    blockLines = [];
  };
  for (const line of lines) {
    const prev = blockLines[blockLines.length - 1];
    if (prev) {
      const gap = line.bounding.top - (prev.bounding.top + prev.bounding.height);
      if (gap > Math.max(prev.bounding.height, line.bounding.height) || gap < -prev.bounding.height) flushBlock();
    }
    blockLines.push(line);
  }
  flushBlock();

  const text = page.text.trim() ? page.text.trim() : blocks.map((b) => b.text).join('\n\n');
  return { text, blocks };
}

function union(boxes: OcrWord['bounding'][]): OcrWord['bounding'] {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

// Moves a rendered JPEG from the cache into the document's folder (replacing a leftover from an
// interrupted run).
function keep(renderedUri: string, dest: File): string {
  if (dest.exists) dest.delete();
  new File(renderedUri).moveSync(dest);
  return dest.uri;
}

export type IndexOptions = {
  // The script a page without a text layer is recognised with (the document's course, else the
  // app setting: scripts/registry.resolveOcrScript).
  script: OcrScript;
  // Checked between pages; a cancelled run keeps its finished pages (see onCommit).
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
  // Called with the whole page list every COMMIT_EVERY pages, for the caller to save.
  onCommit?: (pages: LibraryPage[]) => void;
};

export type IndexResult =
  // Every page it was going to read is read (or the file can't be read at all).
  | { finished: true; patch: Pick<LibraryDocument, 'pages' | 'indexedAt' | 'indexState' | 'pdfLayout'> }
  // Cancelled: `pages` holds what was done; the rest is picked up next time.
  | { finished: false; pages: LibraryPage[] };

// Indexes an imported PDF, one page at a time, skipping pages a previous (interrupted) run
// already did. Page ids are kept by position, so bookmarks on them survive. Throws only when the
// native module isn't in this build (PdfNativeUnavailableError): the caller tries again in a
// build that has it.
export async function indexImportedPdf(doc: LibraryDocument, options: IndexOptions): Promise<IndexResult> {
  const uri = doc.pdfUri;
  const done = (indexState: IndexState, pages: LibraryPage[]): IndexResult => ({
    finished: true,
    patch: { pages, indexedAt: Date.now(), indexState, pdfLayout: 'standard' },
  });
  if (!uri) return done('failed', doc.pages);

  let count: number;
  try {
    count = await getPageCount(uri);
  } catch (error) {
    if (error instanceof PdfEncryptedError) return done('encrypted', doc.pages);
    if (isUnavailable(error)) throw error;
    console.warn('Imported PDF: page count failed', error);
    return done('failed', doc.pages);
  }

  const pages = Array.from({ length: Math.max(1, count) }, (_, i) => doc.pages[i] ?? stubPage());
  const limit = Math.min(count, INDEX_MAX_PAGES);
  const todo = Array.from({ length: limit }, (_, i) => i).filter((i) => !isIndexed(pages[i]));
  const dir = getDocumentDir(doc.id);

  let sinceCommit = 0;
  const result = await processSequentially(
    todo,
    async (i) => {
      pages[i] = await readPage(uri, i, pages[i], options.script, dir);
      if (++sinceCommit >= COMMIT_EVERY) {
        sinceCommit = 0;
        options.onCommit?.([...pages]);
      }
    },
    { signal: options.signal, onProgress: options.onProgress }
  );

  if (result.error instanceof PdfEncryptedError) return done('encrypted', pages);
  if (result.error !== undefined) {
    if (isUnavailable(result.error)) throw result.error;
    console.warn('Imported PDF: indexing failed', result.error);
    return done('failed', pages);
  }
  if (result.cancelled) return { finished: false, pages };
  return done(count > limit ? 'partial' : 'done', pages);
}

function isUnavailable(error: unknown): boolean {
  return (error as Error | null)?.name === 'PdfNativeUnavailableError';
}

// One page: its text (the PDF's own, or OCR of a rendered master when the page has none - a
// scanned handout), then its thumbnail. Both are measured as the page is shown now, so a turn
// recorded for it earlier (R3, already in the PDF's /Rotate) is reset. Best-effort like OCR
// everywhere: a page that can't be read keeps what it got; only a password (or a build without
// the module) stops the run.
async function readPage(
  uri: string,
  index: number,
  page: LibraryPage,
  script: OcrScript,
  dir: ReturnType<typeof getDocumentDir>
): Promise<LibraryPage> {
  let text: PdfPageText | undefined;
  try {
    text = await getPageText(uri, index);
  } catch (error) {
    if (error instanceof PdfEncryptedError || isUnavailable(error)) throw error;
    console.warn(`Imported PDF: no text for page ${index + 1}`, error);
  }

  let next: LibraryPage = page;
  try {
    if (text && text.text.trim()) {
      const size = masterSizeFor(text);
      next = { ...page, fileUri: '', width: size.width, height: size.height, ocr: pdfTextToOcr(text), ocrFailed: undefined, textSource: 'pdf', rotation: undefined };
    } else {
      // No text layer: a scanned page. Render a master just for OCR, then drop it.
      const master = await renderPage(uri, index, { maxDim: MASTER_MAX_DIM, quality: MASTER_JPEG_Q });
      try {
        const ocr = await runOcr(master.uri, script);
        next = { ...page, fileUri: '', width: master.width, height: master.height, ocr, ocrFailed: ocr ? undefined : true, textSource: 'ocr', rotation: undefined };
      } finally {
        cleanTemporaryCache([master.uri]);
      }
    }
    const thumb = await renderPage(uri, index, { maxDim: THUMB_MAX_DIM, quality: THUMB_JPEG_Q });
    // Named by page id, not position: pages move (R3), and a later run must not overwrite another
    // page's thumbnail.
    return { ...next, thumbUri: keep(thumb.uri, new File(dir, `thumb_${page.id}.jpg`)) };
  } catch (error) {
    if (error instanceof PdfEncryptedError || isUnavailable(error)) throw error;
    // One damaged page doesn't stop the rest; it keeps whatever it got (no thumbnail).
    console.warn(`Imported PDF: page ${index + 1} could not be rendered`, error);
    return next;
  }
}
