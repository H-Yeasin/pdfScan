import { canMarkPage, isPageRasterFormat, isPdfLevel } from '../documents/formatCapabilities';
import type { ReaderSubject } from '../documents/readerTools';
import { imagePlacement } from '../pdf/pdfService';
import { turnedSize } from '../pdf/rotation';
import type { LibraryPage, PageRotation } from '../../types/models';
import { pixelSpace, pointsSpace, type PageSpace } from './pageSpace';

// §18 W8: what the page surface shows, one entry per page, whatever the document is. A scan reads
// from its page images, everything PDF-level from an open pdfium session (services/pdf/pdfSession);
// the surface itself only sees a `SurfacePage`.

export type PageSource =
  // A scan's master, or its stamped display copy. Shown turned by `imageTurn`: the file never is.
  | { kind: 'image'; uri: string; pixelW: number; pixelH: number; imageTurn: PageRotation }
  // A page of the session's document (0-based), rendered as shown: its size in points, turned.
  | { kind: 'pdf'; page: number; pointsW: number; pointsH: number };

export type SurfacePage = {
  // The library page's id, or `ext:<n>` where there is no library page.
  id: string;
  // The library index. A 2-in-1 scan reads as single pages here, never as sheets.
  index: number;
  // The page's shape as displayed (turn applied). Only the ratio matters to the layout.
  shownW: number;
  shownH: number;
  source: PageSource;
  // Shown at once while the page renders (scans; indexed imported pages).
  thumbUri?: string;
  // How marks, OCR and word boxes map onto the shown page.
  space: PageSpace;
  // Where the page's words are: stored with the page (`page.ocr`, in `space`), read from the
  // session when needed (shown points), or nowhere.
  words: 'ocr' | 'live' | 'none';
  canMark: boolean;
};

// An open session's page sizes: points, as shown (PdfSession.pages).
export type SessionPages = { pages: readonly { width: number; height: number }[] };

function scanPage(page: LibraryPage, index: number): SurfacePage {
  const shown = turnedSize(page.width, page.height, page.rotation);
  return {
    id: page.id,
    index,
    shownW: shown.width,
    shownH: shown.height,
    source: { kind: 'image', uri: page.displayUri ?? page.fileUri, pixelW: page.width, pixelH: page.height, imageTurn: page.rotation ?? 0 },
    thumbUri: page.thumbUri,
    space: pixelSpace('master', page),
    words: 'ocr',
    canMark: canMarkPage(page),
  };
}

// A scan's page merged into a PDF: the builder placed its master inside the page's margins
// (standard layout), and a turn is the page's /Rotate, which page.rotation mirrors. So the
// unturned page is the shown one turned back, and the master covers `imagePlacement`'s box in it
// - the same maths as pdfAnnotations' pdfLevelMapper, top-left instead of bottom-left.
function mergedScanSpace(page: LibraryPage, shown: { width: number; height: number }): PageSpace {
  const unturned = turnedSize(shown.width, shown.height, page.rotation);
  const fit = imagePlacement(page.width, page.height, 'full', unturned, page.layout);
  return {
    ...pixelSpace('master', page),
    placement: {
      x: fit.origin.x / unturned.width,
      y: (unturned.height - fit.origin.y - fit.height) / unturned.height,
      width: fit.width / unturned.width,
      height: fit.height / unturned.height,
    },
  };
}

function pdfPage(page: LibraryPage | undefined, index: number, shown: { width: number; height: number }): SurfacePage {
  const base = {
    index,
    shownW: shown.width,
    shownH: shown.height,
    source: { kind: 'pdf', page: index, pointsW: shown.width, pointsH: shown.height } as const,
  };
  // An outside file, or a page the library has no row for.
  if (!page) return { ...base, id: `ext:${index}`, space: pointsSpace(shown), words: 'live', canMark: false };
  if (page.fileUri) return { ...base, id: page.id, thumbUri: page.thumbUri, space: mergedScanSpace(page, shown), words: 'ocr', canMark: true };
  // An imported page. Indexed (R1): its size and words are pixels of the page as shown then, and
  // page.rotation is the turn added since - the render already has it, only the overlays turn.
  // Not indexed (past the first 300 pages, a password file, or indexing still running): its row
  // is a stub with no real size, so it reads like an outside page until it is.
  if (canMarkPage(page)) return { ...base, id: page.id, thumbUri: page.thumbUri, space: pixelSpace('indexed', page), words: 'ocr', canMark: true };
  return { ...base, id: page.id, space: pointsSpace(shown), words: 'live', canMark: false };
}

// The pages of what the Reader has open. PDF-level and outside documents take their sizes from
// the session, never from stub rows, so they have no pages until it is open (the surface paints
// only paper until then). Formats with their own viewer have none.
export function surfacePagesFor(subject: ReaderSubject, session?: SessionPages): SurfacePage[] {
  const doc = subject.doc;
  if (!doc) {
    if (subject.external.format !== 'PDF' || !session) return [];
    return session.pages.map((shown, index) => pdfPage(undefined, index, shown));
  }
  if (!isPageRasterFormat(doc.format)) return [];
  if (!isPdfLevel(doc)) return doc.pages.map(scanPage);
  if (!session) return [];
  return session.pages.map((shown, index) => pdfPage(doc.pages[index], index, shown));
}
