import type { PageOcr } from '../../types/models';
import { getDb, withWriteLock } from '../persistence/dbService';
import { hasDeferredBlocks, loadPageOcr } from '../persistence/libraryRepo';

// §16 G4: a page's word boxes, loaded when something needs them. The library load reads each
// page's text only (PageOcr.blocksRow marks the boxes left in the database); what places text on
// a page asks for the boxes first:
//  - the PDF builders (pdfService.buildPdfFromPages, rasterPdf.buildRasterPdf) and Convert to
//    Word load them for the pages they were given, so a merge, split, compress, sign, submit or
//    exam pack needs no call of its own;
//  - the Reader (Select text, Mark mode's snap-to-word) loads its document's and puts them in the
//    state with library/SET_PAGE_OCR (components/reader/usePageOcr.ts).
// Anything else that reads `ocr.blocks` of a library page must do one or the other.

export { hasDeferredBlocks };

// `pages` with their word boxes; the same array when none are waiting. Takes its turn with
// library writes (withWriteLock): the sync replaces a document's page rows inside a transaction on
// the same connection, and a read in the middle of one would find the rows gone.
export async function withPageBlocks<T extends { id?: string; ocr?: PageOcr } | undefined>(pages: readonly T[]): Promise<readonly T[]> {
  if (!hasDeferredBlocks(pages)) return pages;
  return withWriteLock(async () => loadPageOcr(await getDb(), pages));
}
