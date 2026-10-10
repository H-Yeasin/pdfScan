import { File } from 'expo-file-system';
import { THUMB_JPEG_Q, THUMB_MAX_DIM, fitWithin } from '../capture/imageSpec';
import { getDocumentDir } from '../persistence/libraryFiles';
import { isReaderHeld } from '../reader/readerHold';
import type { LibraryDocument, LibraryPage } from '../../types/models';

// §16 G6: a list never shows a page's master. A row, a grid tile or a strip asks `thumbFor` for
// the 400 px thumbnail; when the page has none (a document saved before thumbnails, a restore
// that lost them, a page past the indexer's limit) it shows the placeholder and calls
// `requestThumb`, which builds the missing one here: one at a time, the newest request first (the
// rows on screen now, not the ones a fling went past), each page at most once. The result is
// saved through the host (`library/SET_PAGE_THUMB`), and the row shows it on its next render.
//
// On the boot path (BootEffects sets the host): expo-image-manipulator and pdf-native load inside
// the build, never at import.

export type ThumbnailHost = {
  // The document as the library has it now, or undefined once it's gone.
  find: (documentId: string) => LibraryDocument | undefined;
  save: (documentId: string, pageId: string, thumbUri: string) => void;
};

type Job = { documentId: string; pageId: string };

let host: ThumbnailHost | null = null;
const queue: Job[] = [];
// Queued or building, by page id.
const pending = new Set<string>();
// Pages whose build failed this session (a missing master, a damaged PDF page): not tried again
// until the next launch, so a row that keeps asking can't spin the queue.
const failed = new Set<string>();
let running: Promise<void> | null = null;

export function setThumbnailHost(next: ThumbnailHost | null): void {
  host = next;
  if (next) pump();
}

// What a list shows for a page: its thumbnail, or undefined (the placeholder). Never the master.
export function thumbFor(page: Pick<LibraryPage, 'thumbUri'> | undefined): string | undefined {
  return page?.thumbUri || undefined;
}

// Whether a missing thumbnail can be made here. A scan has its master. An imported PDF's page is
// rendered from the PDF, but only once the indexer is done with the document (until then the
// thumbnail is the indexer's to write, and a file it can't read stays without), and only for a
// page that hasn't been turned since: the PDF already carries that turn, the row's `rotation`
// would apply it a second time.
export function canBuildThumb(doc: LibraryDocument, page: LibraryPage): boolean {
  if (page.thumbUri) return false;
  if (page.fileUri) return true;
  return (
    doc.sourceKind === 'imported_pdf' &&
    !!doc.pdfUri &&
    (doc.indexState === 'done' || doc.indexState === 'partial') &&
    !page.rotation
  );
}

export function requestThumb(documentId: string, pageId: string): void {
  if (pending.has(pageId) || failed.has(pageId)) return;
  pending.add(pageId);
  queue.push({ documentId, pageId });
  pump();
}

// Resolves when nothing is queued or building (tests).
export function thumbnailsIdle(): Promise<void> {
  return running ?? Promise.resolve();
}

export function resetThumbnails(): void {
  queue.length = 0;
  pending.clear();
  failed.clear();
  host = null;
}

function pump(): void {
  if (running || !host || queue.length === 0) return;
  running = drain().finally(() => {
    running = null;
    // A request that arrived as the loop was ending.
    pump();
  });
}

async function drain(): Promise<void> {
  while (host && queue.length > 0) {
    const job = queue.pop()!;
    try {
      await build(job, host);
    } catch (error) {
      console.warn('thumbnails: build failed', error);
      failed.add(job.pageId);
    } finally {
      pending.delete(job.pageId);
    }
  }
}

function locate(job: Job, from: ThumbnailHost): { doc: LibraryDocument; page: LibraryPage; index: number } | null {
  const doc = from.find(job.documentId);
  const index = doc ? doc.pages.findIndex((p) => p.id === job.pageId) : -1;
  return doc && index !== -1 ? { doc, page: doc.pages[index], index } : null;
}

// 'skipped': nothing to do now (the page has one, or it's gone, or it's the indexer's to make, or
// the Reader has the pdfium thread); the row may ask again. A build that throws isn't retried.
async function build(job: Job, from: ThumbnailHost): Promise<'saved' | 'skipped'> {
  const found = locate(job, from);
  if (!found || found.page.thumbUri) return 'skipped';
  const { doc, page, index } = found;
  if (!canBuildThumb(doc, page)) return 'skipped';

  let rendered: string;
  if (page.fileUri) {
    // The page's size is known, so the master is decoded once, by the resize itself.
    const { manipulateAsync, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const size = fitWithin(page.width, page.height, THUMB_MAX_DIM);
    const result = await manipulateAsync(page.fileUri, size.scale < 1 ? [{ resize: { width: size.width, height: size.height } }] : [], {
      compress: THUMB_JPEG_Q,
      format: SaveFormat.JPEG,
    });
    rendered = result.uri;
  } else {
    // §18 W10: a page being read never waits behind a thumbnail.
    if (isReaderHeld()) return 'skipped';
    const { renderPage } = require('../pdf/pdfNative') as typeof import('../pdf/pdfNative');
    rendered = (await renderPage(doc.pdfUri!, index, { maxDim: THUMB_MAX_DIM, quality: THUMB_JPEG_Q })).uri;
  }

  // The library moved on while it was built: a deleted document's folder must not come back, and
  // a thumbnail written meanwhile (the indexer's, a rebuild's) wins.
  const now = locate(job, from);
  if (!now || now.page.thumbUri) {
    discard(rendered);
    return 'skipped';
  }
  // Named by page id, like the indexer's: pages move, and N would collide with thumb_N.jpg.
  const dest = new File(getDocumentDir(job.documentId), `thumb_${job.pageId}.jpg`);
  if (dest.exists) dest.delete();
  new File(rendered).moveSync(dest);
  from.save(job.documentId, job.pageId, dest.uri);
  return 'saved';
}

function discard(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A stray cache file; the system clears it.
  }
}
