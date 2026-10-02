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

export type PdfNativeModule = {
  getPageCount(uri: string): Promise<number>;
  getPageSize(uri: string, page: number): Promise<PdfPageSize>;
  // A JPEG in the cache directory, `maxDim` px on its long side; the caller moves or deletes it.
  renderPage(uri: string, page: number, options: PdfRenderOptions): Promise<PdfRenderedPage>;
  getPageText(uri: string, page: number): Promise<PdfPageText>;
};

// null in a build made before this module existed (or in Expo Go): callers treat that as
// "can't index PDFs yet" instead of crashing.
export default requireOptionalNativeModule<PdfNativeModule>('PdfNative');
