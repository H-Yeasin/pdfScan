// Session-only filter IDs (the library stores baked pixels, so these can change freely). Each one
// has exactly one FilterSpec in services/enhance/filters/registry.ts. 'bw' is the Sauvola
// photocopy threshold (it was called 'document_scan' before E1; the old contrast-boost 'bw' is gone).
export type EnhanceMode = 'original' | 'auto' | 'color' | 'gray' | 'ink' | 'board' | 'bw';
export type CaptureMode = 'doc' | 'id' | 'book';
export type DocFormat = 'PDF' | 'JPG' | 'DOCX' | 'DOC' | 'XLSX' | 'XLS' | 'CSV' | 'TXT';

// Mirrors rn-mlkit-ocr's OcrResult shape (block -> line), kept close to the native
// return value rather than flattened, so bounding-box data survives for a future
// in-image "Find" highlight feature.
export type OcrScript = 'latin' | 'chinese' | 'devanagari' | 'japanese' | 'korean';
export type OcrBounding = { left: number; top: number; width: number; height: number };
export type OcrLine = { text: string; bounding: OcrBounding };
export type OcrBlock = { text: string; lines: OcrLine[]; bounding: OcrBounding };
export type PageOcr = { text: string; blocks: OcrBlock[] };

// Manual tone adjustments layered on top of `enhance`. Each field is -1..1, where 0 is a no-op;
// see services/enhance/filters/filterMath.ts's adjustMatrices for the actual color-matrix math.
export type AdjustValues = { brightness: number; contrast: number; saturation: number };

// Histogram endpoints (0..1) of a page, measured once by services/enhance/filters/stats.ts and
// cached on SessionPage.stats so switching filters never reads pixels again.
export type ChannelStats = { lo: number; hi: number };
// r/g/b/luma are measured AFTER light correction (see stats.ts); `light` is what the correction
// itself needs (whether the page is dark, the background's mean colour).
export type ImageStats = {
  r: ChannelStats;
  g: ChannelStats;
  b: ChannelStats;
  luma: ChannelStats;
  light?: { dark: boolean; bgMean: [number, number, number] };
};

// Per-page options for the Ink (E4) and Board (E5) filters. Ignored by every other filter.
export type FilterOptions = {
  keepInkColor?: boolean;
  fadeLines?: boolean;
  boardStyle?: 'auto' | 'light' | 'dark';
};

export type SessionPage = {
  id: string;
  uri: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  cropRect?: { originX: number; originY: number; width: number; height: number };
  enhance: EnhanceMode;
  adjust?: AdjustValues;
  filterOptions?: FilterOptions;
  // Measured from `uri`. The capture reducer drops it whenever `uri` changes (crop, rotate, sign),
  // and ReviewScreen measures it again for the selected page; undefined just means "measure on use".
  stats?: ImageStats;
  err?: boolean;
  ocr?: PageOcr;
};

export type LibraryPage = {
  id: string;
  fileUri: string;
  width: number;
  height: number;
  ocr?: PageOcr;
};

export type LibraryDocument = {
  id: string;
  name: string;
  format: DocFormat;
  mode: CaptureMode;
  pages: LibraryPage[];
  pdfUri?: string;
  // Durable local copy of the original file, real extension preserved (source.docx, source.xlsx,
  // source.txt, ...), for formats rendered by their own viewer rather than through the PDF engine.
  // Always undefined for 'PDF'/'JPG' (which use pdfUri/pages instead); always set for every other
  // format. See formatCapabilities.ts's isPageRasterFormat for the PDF/JPG vs. everything-else split.
  contentUri?: string;
  sizeBytes: number;
  createdAt: number;
  star: boolean;
  tag?: string;
  // UI-only signal: no real PDF encryption is implemented. Every surface that shows
  // this badge must also show the "not actually protected" disclosure.
  locked: boolean;
  searchHaystack: string;
  // Undefined means "unfiled" — every document saved before folders shipped has no
  // key here at all, so undefined and null must be treated identically everywhere.
  folderId?: string;
  // Additive "Courses" physical routing - separate from folderId's logical library-folder system,
  // and unrelated to AcademicConfig.coverPage.courseCode (which only prints on the PDF cover page).
  // Raw display name (e.g. "CS 101"); undefined/"" both mean "no course, flat layout." See
  // sanitizeFolderSegment (utils/sanitize.ts) for how this becomes a physical directory segment,
  // and libraryFiles.ts's getDocumentDir for where that segment is actually used.
  courseFolder?: string;
  // Mirrors the AcademicConfig.coverPage.mode this document's page 0 was built with, if any.
  // undefined means "no cover page" OR "saved before this field existed" - both are treated
  // identically (fitToMarginBox=true) by applySignatureToDocument, since a missing cover is far
  // more common than a pre-migration template cover. See pdfService.ts's applySignatureToPdf for
  // why this distinction matters (a template cover has no placed image and isn't fit into
  // CONTENT_MARGIN_PT, unlike every other page).
  coverKind?: 'template' | 'imported_image';
  // undefined ≡ 'scanned' (every document saved before this field existed, or made via the
  // capture pipeline). 'imported_pdf' marks a document promoted from an externally-opened PDF
  // (see promoteExternalToLibrary in libraryOperations.ts) — its `pages` array is a single
  // synthetic entry, not one real image per PDF page, so page-count/Sign/etc. must branch on this.
  sourceKind?: 'scanned' | 'imported_pdf';
};

// A file opened from outside the library (OS "Open with", share-to-app, or the in-app picker) —
// never persisted to AsyncStorage/SQLite. `uri` is always a stable local copy under
// Paths.document/external-open/<id>/, never the original incoming URI (see externalFileService.ts
// for why: content:// / security-scoped grants from the source app aren't reliably durable).
export type ExternalFileDocument = {
  uri: string;
  name: string;
  format: DocFormat;
  sizeBytes: number;
  sourceUri: string;
  importedAt: number;
  // Best-effort page count from a pdf-lib probe at import time (see externalFileService.ts).
  // PDF-only - always undefined for every other format. Undefined for a genuinely encrypted PDF
  // pdf-lib couldn't parse too - the PDF engine's own onLoadComplete is the real source of truth
  // once the reader actually mounts the file.
  pageCount?: number;
};

export type LibraryFolder = {
  id: string;
  name: string;
  createdAt: number;
};

export type LibraryIndexV1 = {
  version: 1;
  documents: LibraryDocument[];
};

export type LibraryIndexV2 = {
  version: 2;
  documents: LibraryDocument[];
  folders: LibraryFolder[];
};

export type LibraryIndex = LibraryIndexV1 | LibraryIndexV2;
