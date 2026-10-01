import { inspectPdf } from '../pdf/pdfService';
import type { LibraryDocument } from '../../types/models';
import { isPageRasterFormat } from './formatCapabilities';

// §5 T1, run once after the library loads: documents built before T1 don't record how their
// document.pdf was laid out. Each one's PDF is opened (one at a time) and read: a landscape sheet
// means 2-in-1 (standard pages are always portrait), and the short side gives the paper. Imported
// PDFs and documents without a PDF are left alone; a PDF that can't be read is skipped and tried
// again next launch.
export async function backfillPdfInfo(
  docs: readonly LibraryDocument[],
  inspect: typeof inspectPdf = inspectPdf
): Promise<{ id: string; patch: Pick<LibraryDocument, 'pdfLayout' | 'pdfPageSize'> }[]> {
  const out: { id: string; patch: Pick<LibraryDocument, 'pdfLayout' | 'pdfPageSize'> }[] = [];
  for (const doc of docs) {
    if (doc.pdfLayout || !doc.pdfUri || doc.sourceKind === 'imported_pdf' || !isPageRasterFormat(doc.format)) continue;
    const info = await inspect(doc.pdfUri);
    if (!info) continue;
    out.push({ id: doc.id, patch: { pdfLayout: info.landscape ? '2_in_1' : 'standard', pdfPageSize: info.pageSize } });
  }
  return out;
}
