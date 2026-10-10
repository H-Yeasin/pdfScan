import type { OcrScript, SessionPage } from '../../types/models';

// §16 G7: what a page's recognised text depends on, apart from its filter - the image itself (a
// crop, a split or a signature writes a new file), its size, how it is turned, and the script it
// was read with. OCR stores the key it was run for (SessionPage.ocrGeometry); while the page
// still has that key, its word boxes line up with the page as it will be saved, and Deliver keeps
// them instead of reading the page a second time.
export function geometryKey(page: Pick<SessionPage, 'uri' | 'width' | 'height' | 'rotation'>, script: OcrScript): string {
  return `${page.uri}|${Math.round(page.width)}x${Math.round(page.height)}|${page.rotation}|${script}`;
}

// The key of an image read as it lies in its file. OCR in a scan session always runs on the
// unturned master, so a page turned afterwards no longer matches and is read again when saved.
export function masterGeometryKey(master: { uri: string; width: number; height: number }, script: OcrScript): string {
  return geometryKey({ ...master, rotation: 0 }, script);
}

// True when `page.ocr` was read from the page as it is now, in `script`.
export function ocrFitsPage(page: SessionPage, script: OcrScript): boolean {
  return page.ocr !== undefined && page.ocrGeometry === geometryKey(page, script);
}
