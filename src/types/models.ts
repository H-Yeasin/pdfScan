export type EnhanceMode = 'auto' | 'color' | 'gray' | 'bw' | 'document_scan';
export type CaptureMode = 'doc' | 'id' | 'book';
export type DocFormat = 'PDF' | 'JPG';

// Mirrors rn-mlkit-ocr's OcrResult shape (block -> line), kept close to the native
// return value rather than flattened, so bounding-box data survives for a future
// in-image "Find" highlight feature.
export type OcrScript = 'latin' | 'chinese' | 'devanagari' | 'japanese' | 'korean';
export type OcrBounding = { left: number; top: number; width: number; height: number };
export type OcrLine = { text: string; bounding: OcrBounding };
export type OcrBlock = { text: string; lines: OcrLine[]; bounding: OcrBounding };
export type PageOcr = { text: string; blocks: OcrBlock[] };

export type SessionPage = {
  id: string;
  uri: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  cropRect?: { originX: number; originY: number; width: number; height: number };
  enhance: EnhanceMode;
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
