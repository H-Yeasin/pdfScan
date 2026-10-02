import PdfNative, { type PdfPageSize, type PdfPageText, type PdfRenderedPage, type PdfWord } from '../../../modules/pdf-native';
import { PdfEncryptedError } from './pdfErrors';

export type { PdfPageSize, PdfPageText, PdfRenderedPage, PdfWord };
export { PdfEncryptedError };

// §7 R1: the app's only door to modules/pdf-native (page count and size, rendering a page to a
// JPEG, a page's text with word boxes). Pages are 0-based everywhere in this API - unlike the
// Reader and pageMap, which count PDF pages from 1. Sizes and word boxes are PDF points as the
// page is shown (its /Rotate applied), origin top-left.

export class PdfNativeUnavailableError extends Error {
  constructor() {
    super('modules/pdf-native is not in this build');
    this.name = 'PdfNativeUnavailableError';
  }
}

// False in a dev build made before the module existed (it needs a new native build).
export function isPdfNativeAvailable(): boolean {
  return PdfNative !== null;
}

async function call<T>(run: (mod: NonNullable<typeof PdfNative>) => Promise<T>): Promise<T> {
  if (!PdfNative) throw new PdfNativeUnavailableError();
  try {
    return await run(PdfNative);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'ENCRYPTED') throw new PdfEncryptedError();
    throw error;
  }
}

export function getPageCount(uri: string): Promise<number> {
  return call((mod) => mod.getPageCount(uri));
}

export function getPageSize(uri: string, page: number): Promise<PdfPageSize> {
  return call((mod) => mod.getPageSize(uri, page));
}

// A JPEG in the cache, `maxDim` px on the long side (it may upscale: PDF pages have no pixel size
// of their own). The caller moves it into the library or deletes it.
export function renderPage(uri: string, page: number, options: { maxDim: number; quality: number }): Promise<PdfRenderedPage> {
  return call((mod) => mod.renderPage(uri, page, options));
}

export function getPageText(uri: string, page: number): Promise<PdfPageText> {
  return call((mod) => mod.getPageText(uri, page));
}
