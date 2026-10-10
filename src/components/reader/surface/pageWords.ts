import { masterSizeFor, pdfTextToOcr } from '../../../services/documents/importedPdfIndex';
import { hasDeferredBlocks, withPageBlocks } from '../../../services/documents/pageOcr';
import type { PdfSession } from '../../../services/pdf/pdfSession';
import { pixelSpace, type PageSpace } from '../../../services/reader/pageSpace';
import type { SurfacePage } from '../../../services/reader/surfacePages';
import { readingOrderTokens, type TextToken } from '../../../services/study/textSelection';
import type { LibraryPage } from '../../../types/models';

// A surface page's words in reading order, and the space their boxes are measured in.
export type PageWords = { tokens: TextToken[]; space: PageSpace };

export const NO_PAGE_WORDS: PageWords = { tokens: [], space: { unit: 'points', width: 1, height: 1, turn: 0 } };

// §18 W12 / W13: the words Find searches and a selection is made of. Stored words first (a scan's
// OCR, an indexed page's, in the page's own space: the one its marks are stored in); else the PDF
// page's own text, read from the open session. `own` is the library page behind `page`, if any.
export async function loadPageWords(page: SurfacePage | undefined, own: LibraryPage | undefined, session: PdfSession | null): Promise<PageWords> {
  if (!page) return NO_PAGE_WORDS;
  if (page.words === 'ocr') {
    let stored = own;
    // The Reader loads its document's word boxes when it opens (usePageOcr); whoever gets there
    // first reads this page's itself.
    if (stored && hasDeferredBlocks([stored])) stored = (await withPageBlocks([stored]))[0];
    const tokens = readingOrderTokens(stored?.ocr);
    if (tokens.length) return { tokens, space: page.space };
  }
  if (page.words === 'none' || !session || page.source.kind !== 'pdf') return NO_PAGE_WORDS;
  const text = await session.pageText(page.source.page);
  // pdfTextToOcr groups the words into lines, in the pixels a page is indexed in.
  return { tokens: readingOrderTokens(pdfTextToOcr(text)), space: pixelSpace('indexed', masterSizeFor(text)) };
}
