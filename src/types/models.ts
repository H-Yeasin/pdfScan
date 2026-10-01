// Session-only filter IDs (the library stores baked pixels, so these can change freely). Each one
// has exactly one FilterSpec in services/enhance/filters/registry.ts. 'bw' is the Sauvola
// photocopy threshold (it was called 'document_scan' before E1; the old contrast-boost 'bw' is gone).
export type EnhanceMode = 'original' | 'auto' | 'color' | 'gray' | 'ink' | 'board' | 'bw';
// See services/capture/captureModes.ts for what each mode does. Documents saved before Notes and
// Board existed only ever have 'doc' / 'id' / 'book', which are still valid.
export type CaptureMode = 'notes' | 'doc' | 'board' | 'book' | 'id';
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
  // Corrected-page luma: median (paper/board), 2nd percentile (ink, for the Ink knees) and 98th
  // percentile (chalk, for the dark-board stretch).
  tone?: { paper: number; ink: number; bright: number };
};

// Per-page options for the Ink (E4) and Board (E5) filters. Ignored by every other filter.
export type FilterOptions = {
  keepInkColor?: boolean;
  fadeLines?: boolean;
  boardStyle?: 'auto' | 'light' | 'dark';
  // Board filter, dark boards only: keep the board dark instead of inverting to chalk-on-white.
  keepDarkBoard?: boolean;
};

export type SessionPage = {
  id: string;
  // The page's master image. Rotation is NOT baked into it - see `rotation`.
  uri: string;
  // Small preview of `uri` for strips and grids; undefined falls back to `uri`.
  thumbUri?: string;
  width: number;
  height: number;
  // Clockwise rotation applied at render time (preview and export), so rotating never re-encodes.
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
  // Set on both halves of a Book-mode spread split (C3): the original spread's master, so Review
  // can "Undo split" without re-encoding anything. Halves of one spread share `groupId`.
  splitFrom?: { groupId: string; uri: string; thumbUri?: string; width: number; height: number };
  // ID card mode (C4): the scanned card images this page was composed from, kept so Review can
  // swap front/back or retake the back and recompose from the originals.
  idCard?: { front: SourceImage; back?: SourceImage };
  // See PageLayout.
  layout?: PageLayout;
  // Gallery import (C5) couldn't crop this page confidently; Review's "Check crops" goes through
  // these. cropSuggestion is a doubtful detected outline to start the crop from, in this page's
  // natural pixels (topLeft, topRight, bottomRight, bottomLeft).
  needsCropReview?: boolean;
  cropSuggestion?: [CropPoint, CropPoint, CropPoint, CropPoint];
};

export type CropPoint = { x: number; y: number };

export type SourceImage = { uri: string; width: number; height: number };

// How a page image goes onto its PDF page. undefined = fit inside the standard margin (every
// normal page). 'fullPage' = edge to edge on A4 at 100 % - for images that are already a
// true-size A4 canvas (ID card mode), so they print at real size.
export type PageLayout = 'fullPage';

export type LibraryPage = {
  id: string;
  // The clean master image: rotation/enhance already applied, never academic-stamped, never
  // recompressed by Compress. Every rebuild (merge, split, compress, sign) starts from this.
  fileUri: string;
  // Optional stamped copy (academic border/header/footer) shown in the in-app viewer instead of
  // the master. Undefined means "show the master".
  displayUri?: string;
  // Small preview for lists/strips, so they don't decode full-resolution masters.
  thumbUri?: string;
  width: number;
  height: number;
  ocr?: PageOcr;
  // See PageLayout; must survive rebuilds (merge, split, compress) or an ID card would shrink.
  layout?: PageLayout;
  // True when OCR ran at save time and failed (as opposed to finding no text), so the reader can
  // offer "Retry OCR" later.
  ocrFailed?: boolean;
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
  // Derived from name + OCR text when the library loads (and when a document is created); never
  // persisted.
  searchHaystack: string;
  // The Course this document is filed under. Undefined means "Unsorted". Purely logical: a
  // document's files always live in library/<id>/ regardless of course, so moving a document
  // between courses never touches the filesystem. Unrelated to AcademicConfig.coverPage.courseCode
  // (which only prints on the PDF cover page).
  courseId?: string;
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

// One organizing unit for the library (replaces both the old logical folders and the free-text
// "courseFolder" routing). code/color/semester are optional until the full Course UI lands (§3).
export type Course = {
  id: string;
  name: string;
  code?: string;
  color?: string;
  semester?: string;
  archived: boolean;
  createdAt: number;
};
