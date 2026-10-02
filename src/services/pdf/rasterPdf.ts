import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues (see pdfService.ts)
import { File } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import type { ExportPreset } from '../capture/imageSpec';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import type { LibraryPage } from '../../types/models';
import { getPageCount, getPageSize, renderPage } from './pdfNative';
import { savePdf, type PdfFile } from './pdfOps';
import { decoratePdf, type AcademicConfig, type PageSizeId } from './pdfService';
import { drawOcrTextLayer, embedGlyphlessFont } from './textLayer';

// §7 R2: the one path that turns an existing PDF's pages into images - only for jobs that need
// fewer bytes than the original has (Compress, a submission's size limit), and the caller says
// so. Each page keeps its own size and fills it edge to edge; the page's text (from the PDF's own
// text layer or OCR, R1) goes back on as the invisible glyphless layer, so it stays searchable.
// One page at a time: render, embed, delete.

export type RasterBuildOptions = {
  dest: File;
  // The preset's cover/border/header/footer, for a submission.
  academicConfig?: AcademicConfig;
  pageSize?: PageSizeId;
  onPage?: (done: number, total: number) => void;
};

// `pages` are the document's page rows, 1:1 with the PDF's pages; a page without a row (or without
// text) just gets no text layer. The PDF's own page count decides how many pages there are.
export async function buildRasterPdf(
  uri: string,
  pages: readonly (LibraryPage | undefined)[],
  spec: Pick<ExportPreset, 'maxDim' | 'q'>,
  options: RasterBuildOptions
): Promise<PdfFile> {
  const pdfDoc = await PDFDocument.create();
  const font = await embedGlyphlessFont(pdfDoc);
  const count = await getPageCount(uri);
  for (let i = 0; i < count; i++) {
    const size = await getPageSize(uri, i);
    const rendered = await renderPage(uri, i, { maxDim: spec.maxDim, quality: spec.q });
    try {
      const image = await pdfDoc.embedJpg(await new File(rendered.uri).bytes());
      const pdfPage = pdfDoc.addPage([size.width, size.height]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
      const page = pages[i];
      // page.ocr is in the page's master pixels (page.width wide), whatever size it was rendered at.
      if (page?.ocr && page.ocr.blocks.length > 0 && page.width > 0) {
        drawOcrTextLayer(pdfPage, font, page.ocr, { origin: { x: 0, y: 0 }, heightPt: size.height, scale: size.width / page.width });
      }
    } finally {
      cleanTemporaryCache([rendered.uri]);
    }
    options.onPage?.(i + 1, count);
  }
  if (options.academicConfig) await decoratePdf(pdfDoc, options.academicConfig, options.pageSize, font);
  return savePdf(pdfDoc, options.dest);
}

// Encoded bytes of one page rendered at `spec`, for predicting a raster build's size (the S3
// sampling, sizeTarget.findLevel).
export async function renderedPageBytes(uri: string, page: number, spec: Pick<ExportPreset, 'maxDim' | 'q'>): Promise<number> {
  const rendered = await renderPage(uri, page, { maxDim: spec.maxDim, quality: spec.q });
  try {
    return new File(rendered.uri).size ?? 0;
  } finally {
    cleanTemporaryCache([rendered.uri]);
  }
}
