import { File } from 'expo-file-system';
import { getPageCount, getPageSize, isPdfNativeAvailable } from '../pdf/pdfNative';
import type { LibraryDocument } from '../../types/models';
import { isPageRasterFormat } from './formatCapabilities';

type PdfInfo = { pageSize: NonNullable<LibraryDocument['pdfPageSize']>; landscape: boolean };
type ReadPdfInfo = (uri: string) => Promise<PdfInfo | null>;

export type PdfInfoPatch = Pick<LibraryDocument, 'pdfLayout' | 'pdfPageSize'> | Pick<LibraryDocument, 'pdfInfoFailed'>;

// US Letter's short side in PDF points (8.5 in); anything else is read as A4, as pdfService does.
const LETTER_SHORT_SIDE_PT = 612;

// §16 G4: pdfium reads the page count and the last page's size from the file's cross-reference
// table, without loading the file into JavaScript (pdf-lib parsed every object of every PDF).
// Sizes come with /Rotate applied; that's the sheet's own size here, because a document without
// pdfLayout was built before pages could be turned (§7 R3 rebuilds, and every build since T1
// records the layout).
async function readNative(uri: string): Promise<PdfInfo | null> {
  const count = await getPageCount(uri);
  if (count < 1) return null;
  // The last page, never the cover (which is first).
  const last = await getPageSize(uri, count - 1);
  const shortSide = Math.min(last.width, last.height);
  return { pageSize: Math.abs(shortSide - LETTER_SHORT_SIDE_PT) < 1 ? 'Letter' : 'A4', landscape: last.width > last.height };
}

// A build without modules/pdf-native (made before §7 R1): pdf-lib, loaded only then (§16 G3).
const readWithPdfLib: ReadPdfInfo = (uri) => (require('../pdf/pdfService') as typeof import('../pdf/pdfService')).inspectPdf(uri);

const readPdfInfo: ReadPdfInfo = (uri) => (isPdfNativeAvailable() ? readNative(uri) : readWithPdfLib(uri));

// §5 T1, run a moment after the first screen is up (§16 G4: store/usePdfInfoBackfill): documents
// built before T1 don't record how their document.pdf was laid out. Each one's PDF is opened (one
// at a time) and read: a landscape sheet means 2-in-1 (standard pages are always portrait), and
// the short side gives the paper. Imported PDFs and documents without a PDF are left alone. A PDF
// that is there but can't be read is marked (pdfInfoFailed) and not opened again on later
// launches; one whose file is missing is left for when the file is back (§8 B1's integrity check
// reports it meanwhile).
export async function backfillPdfInfo(
  docs: readonly LibraryDocument[],
  read: ReadPdfInfo = readPdfInfo
): Promise<{ id: string; patch: PdfInfoPatch }[]> {
  const out: { id: string; patch: PdfInfoPatch }[] = [];
  for (const doc of docs) {
    if (doc.pdfLayout || doc.pdfInfoFailed || !doc.pdfUri || doc.sourceKind === 'imported_pdf' || !isPageRasterFormat(doc.format)) continue;
    if (!new File(doc.pdfUri).exists) continue;
    const info = await read(doc.pdfUri).catch(() => null);
    out.push({
      id: doc.id,
      patch: info ? { pdfLayout: info.landscape ? '2_in_1' : 'standard', pdfPageSize: info.pageSize } : { pdfInfoFailed: true },
    });
  }
  return out;
}
