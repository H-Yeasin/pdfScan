import { requireOptionalNativeModule } from 'expo';

// The raw native API (android/…/PdfNativeModule.kt, ios/PdfNativeModule.swift). App code uses
// src/services/pdf/pdfNative.ts, which wraps this with typed errors.
// Pages are 0-based. Sizes and word boxes are PDF points with the page's /Rotate applied, origin
// top-left (as the page is shown). A password-protected PDF rejects with code 'ENCRYPTED'.

export type PdfPageSize = { width: number; height: number };
export type PdfRenderOptions = { maxDim: number; quality: number };
export type PdfRenderedPage = { uri: string; width: number; height: number };
export type PdfWord = { text: string; left: number; top: number; width: number; height: number };
export type PdfPageText = PdfPageSize & { text: string; words: PdfWord[] };

// §18 W7 (version 2): sessions. A document stays open in native code between calls and is named by
// `id`. Native code may close a session on its own (a third open document, 60 s without a call,
// low memory): calls then reject with 'SESSION_CLOSED' and the caller opens again.
// Other codes: 'ENCRYPTED' (no password given), 'PASSWORD_WRONG', 'READ_FAILED', 'OUT_OF_RANGE'.

// Shown points → pixels of the output image: x' = a·x + c·y + e, y' = b·x + d·y + f. Only scale and
// translation are supported (b and c must be 0).
export type PdfMatrix = [a: number, b: number, c: number, d: number, e: number, f: number];
// 4×5, row-major (R, G, B, A rows; the fifth column is an offset in 0..255).
export type PdfColorMatrix = number[];
export type PdfOpenedDocument = { id: string; pageCount: number; pages: PdfPageSize[]; hasOutline: boolean };
export type PdfPageImageOptions = {
  width: number;
  height: number;
  // Without one, the whole page is fitted to width × height.
  matrix?: PdfMatrix;
  colorMatrix?: PdfColorMatrix;
  // Draw the PDF's own annotations and form values.
  annotations: boolean;
  quality: number;
  // A file uri inside the cache directory. Written whole or not at all; an existing file is replaced.
  out: string;
};
export type PdfDecodeOptions = {
  width: number;
  height: number;
  // In the source image's pixels; without one, the whole image.
  region?: { x: number; y: number; width: number; height: number };
  colorMatrix?: PdfColorMatrix;
  quality: number;
  out: string;
};
// A link annotation: `uri`, `page` (0-based, in this document), or both.
export type PdfLink = { left: number; top: number; width: number; height: number; uri?: string; page?: number };
// `page` is missing when the entry points nowhere in this document.
export type PdfOutlineItem = { title: string; page?: number; children: PdfOutlineItem[] };

export type PdfNativeModule = {
  getPageCount(uri: string): Promise<number>;
  getPageSize(uri: string, page: number): Promise<PdfPageSize>;
  // A JPEG in the cache directory, `maxDim` px on its long side; the caller moves or deletes it.
  renderPage(uri: string, page: number, options: PdfRenderOptions): Promise<PdfRenderedPage>;
  getPageText(uri: string, page: number): Promise<PdfPageText>;

  // Missing in a build made before W7: check it before calling anything below.
  nativeVersion?(): number;
  openDocument(uri: string, password?: string | null): Promise<PdfOpenedDocument>;
  closeDocument(id: string): Promise<void>;
  renderPageImage(id: string, page: number, options: PdfPageImageOptions): Promise<PdfRenderedPage>;
  // A scan's image (not a PDF) scaled, or a region of it, through the same output path.
  decodeImage(uri: string, options: PdfDecodeOptions): Promise<PdfRenderedPage>;
  getSessionPageText(id: string, page: number): Promise<PdfPageText>;
  getPageLinks(id: string, page: number): Promise<PdfLink[]>;
  getOutline(id: string): Promise<PdfOutlineItem[]>;
};

// null in a build made before this module existed (or in Expo Go): callers treat that as
// "can't index PDFs yet" instead of crashing.
export default requireOptionalNativeModule<PdfNativeModule>('PdfNative');
