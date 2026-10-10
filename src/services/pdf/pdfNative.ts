import PdfNative, {
  type PdfColorMatrix,
  type PdfDecodeOptions,
  type PdfLink,
  type PdfMatrix,
  type PdfOpenedDocument,
  type PdfOutlineItem,
  type PdfPageImageOptions,
  type PdfPageSize,
  type PdfPageText,
  type PdfRenderedPage,
  type PdfWord,
} from '../../../modules/pdf-native';
import { PdfEncryptedError, PdfWrongPasswordError } from './pdfErrors';

export type {
  PdfColorMatrix,
  PdfDecodeOptions,
  PdfLink,
  PdfMatrix,
  PdfOpenedDocument,
  PdfOutlineItem,
  PdfPageImageOptions,
  PdfPageSize,
  PdfPageText,
  PdfRenderedPage,
  PdfWord,
};
export { PdfEncryptedError, PdfWrongPasswordError };

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

// §18 W7: native code closed the session by itself (a third open document, a minute without a
// call, low memory). services/pdf/pdfSession.ts opens it again; nothing else should see this.
export class PdfSessionClosedError extends Error {
  constructor() {
    super('The PDF session is closed');
    this.name = 'PdfSessionClosedError';
  }
}

// A page number or an image size the native side refuses: a bug in the caller, not a bad file.
export class PdfOutOfRangeError extends Error {
  constructor(message?: string) {
    super(message || 'Out of range');
    this.name = 'PdfOutOfRangeError';
  }
}

// What the build's module can do: 0 without the module, 1 before §18 W7, 2 with sessions (the
// functions below `renderPage`'s group). The page surface needs 2 and the old viewer stays for less.
export const PDF_NATIVE_SESSIONS = 2;

export function pdfNativeVersion(): number {
  if (!PdfNative) return 0;
  if (typeof PdfNative.nativeVersion !== 'function') return 1;
  try {
    return PdfNative.nativeVersion();
  } catch {
    return 1;
  }
}

export function hasPdfSessions(): boolean {
  return pdfNativeVersion() >= PDF_NATIVE_SESSIONS;
}

function typedError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  switch (e?.code) {
    case 'ENCRYPTED':
      return new PdfEncryptedError();
    case 'PASSWORD_WRONG':
      return new PdfWrongPasswordError();
    case 'SESSION_CLOSED':
      return new PdfSessionClosedError();
    case 'OUT_OF_RANGE':
      return new PdfOutOfRangeError(typeof e.message === 'string' ? e.message : undefined);
    default:
      return error;
  }
}

async function call<T>(run: (mod: NonNullable<typeof PdfNative>) => Promise<T>): Promise<T> {
  if (!PdfNative) throw new PdfNativeUnavailableError();
  try {
    return await run(PdfNative);
  } catch (error) {
    throw typedError(error);
  }
}

// The session functions, on a build that has them.
function callV2<T>(run: (mod: NonNullable<typeof PdfNative>) => Promise<T>): Promise<T> {
  return call((mod) => {
    if (!hasPdfSessions()) throw new PdfNativeUnavailableError();
    return run(mod);
  });
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

// §18 W7, sessions. App code goes through services/pdf/pdfSession.ts, which shares one open
// document between its users and reopens it when native code has closed it; these are the raw calls.

// Rejects with PdfEncryptedError (the PDF needs a password and none was given) or
// PdfWrongPasswordError. `pages` are the shown sizes in points.
export function openDocument(uri: string, password?: string): Promise<PdfOpenedDocument> {
  return callV2((mod) => mod.openDocument(uri, password || null));
}

export function closeDocument(id: string): Promise<void> {
  return callV2((mod) => mod.closeDocument(id));
}

// A page, or the part of it `matrix` maps onto the image, as a JPEG at `options.out`.
export function renderPageImage(id: string, page: number, options: PdfPageImageOptions): Promise<PdfRenderedPage> {
  return callV2((mod) => mod.renderPageImage(id, page, options));
}

// An image file (a scan's master), or a region of it, scaled to exactly width × height.
export function decodeImage(uri: string, options: PdfDecodeOptions): Promise<PdfRenderedPage> {
  return callV2((mod) => mod.decodeImage(uri, options));
}

export function getSessionPageText(id: string, page: number): Promise<PdfPageText> {
  return callV2((mod) => mod.getSessionPageText(id, page));
}

export function getPageLinks(id: string, page: number): Promise<PdfLink[]> {
  return callV2((mod) => mod.getPageLinks(id, page));
}

export function getOutline(id: string): Promise<PdfOutlineItem[]> {
  return callV2((mod) => mod.getOutline(id));
}
