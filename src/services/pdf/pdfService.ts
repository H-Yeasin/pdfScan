import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import { getDocumentDir } from '../persistence/libraryFiles';

const PAGE_WIDTH_PX = 612; // US Letter @ 72ppi, matches expo-print's own default
const PAGE_HEIGHT_PX = 792;

export type PdfSourcePage = { uri: string; width: number; height: number };

function buildPageHtml(pages: { base64: string; width: number; height: number }[]): string {
  const pageDivs = pages
    .map((page) => {
      const landscape = page.width > page.height;
      return `<div class="page"><img src="data:image/jpeg;base64,${page.base64}" style="${
        landscape ? 'width:100%;height:auto;' : 'height:100%;width:auto;'
      }" /></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .page { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    img { display: block; }
  </style></head><body>${pageDivs}</body></html>`;
}

export async function buildPdfFromPages(
  documentId: string,
  pages: PdfSourcePage[]
): Promise<{ uri: string; sizeBytes: number }> {
  const encoded = await Promise.all(
    pages.map(async (page) => ({
      base64: await new File(page.uri).base64(),
      width: page.width,
      height: page.height,
    }))
  );

  const html = buildPageHtml(encoded);
  const result = await Print.printToFileAsync({ html, width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX });

  const dir = getDocumentDir(documentId);
  const dest = new File(dir, 'document.pdf');
  if (dest.exists) dest.delete();
  new File(result.uri).move(dest);

  return { uri: dest.uri, sizeBytes: dest.size ?? 0 };
}

export function estimateSizeBytes(pages: PdfSourcePage[], quality: number): number {
  const rawBytes = pages.reduce((sum, page) => sum + (new File(page.uri).size ?? 0), 0);
  const qualityMultiplier = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0
  return Math.round(rawBytes * qualityMultiplier);
}
