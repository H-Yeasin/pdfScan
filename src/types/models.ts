import type { OcrScript } from '../services/scripts/registry';
import type { SubmitPreset } from '../services/submit/preset';

// Session-only filter IDs (the library stores baked pixels, so these can change freely). Each one
// has exactly one FilterSpec in services/enhance/filters/registry.ts. 'bw' is the Sauvola
// photocopy threshold (it was called 'document_scan' before E1; the old contrast-boost 'bw' is gone).
export type EnhanceMode = 'original' | 'auto' | 'color' | 'gray' | 'ink' | 'board' | 'bw';
// See services/capture/captureModes.ts for what each mode does. Documents saved before Notes and
// Board existed only ever have 'doc' / 'id' / 'book', which are still valid.
export type CaptureMode = 'notes' | 'doc' | 'board' | 'book' | 'id';
// 'DOC' (old binary Word) is legacy: no new file gets it since §7 R5 (an incoming .doc is refused);
// it only survives on documents added before, which the Reader explains it can't show.
export type DocFormat = 'PDF' | 'JPG' | 'DOCX' | 'DOC' | 'XLSX' | 'XLS' | 'CSV' | 'TXT';

// Mirrors rn-mlkit-ocr's OcrResult shape (block -> line), kept close to the native
// return value rather than flattened, so bounding-box data survives for a future
// in-image "Find" highlight feature.
// Derived from the script registry (§6 L1); re-exported here so existing imports keep working.
export type { OcrScript } from '../services/scripts/registry';
export type OcrBounding = { left: number; top: number; width: number; height: number };
// One recognised word (ML Kit "element"), in master pixels. §5 T1: kept for word-level
// selection and highlights; pages OCR'd before T1 have none (features fall back to the line).
export type OcrWord = { text: string; bounding: OcrBounding };
export type OcrLine = { text: string; bounding: OcrBounding; words?: OcrWord[] };
export type OcrBlock = { text: string; lines: OcrLine[]; bounding: OcrBounding };
// §16 G4: `blocksRow` is set while the blocks are still in the database. The library load reads a
// page's text but not its word boxes (pages.ocr_json: most of the load, and no list needs them);
// `blocks` is [] until something that needs them loads them for its document
// (services/documents/pageOcr.ts). It names the pages row that holds them: the page's own id at
// load, and still the original's on a copy made under a new id (copyPageInto), whose own row is
// written from it. Saving such a page keeps the stored boxes (libraryRepo). Never set on OCR that
// was just recognised, and never stored.
export type PageOcr = { text: string; blocks: OcrBlock[]; blocksRow?: string };

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
  // §16 G7: what `ocr` was read from (capture/geometryKey.ts): the image, its size and turn, the
  // script. Deliver reads a page again only when this no longer describes it.
  ocrGeometry?: string;
  // §16 G7: the page is in Review already and its text is still being read (ingestBatch).
  ocrPending?: boolean;
  // Set on both halves of a Book-mode spread split (C3): the original spread's master, so Review
  // can "Undo split" without re-encoding anything. Halves of one spread share `groupId`.
  splitFrom?: { groupId: string; uri: string; thumbUri?: string; width: number; height: number };
  // ID card mode (C4): the scanned card images this page was composed from, kept so Review can
  // swap front/back or retake the back and recompose from the originals. `size` is the layout
  // (undefined = 'real'), kept so a swap or retake recomposes at the size the user picked.
  idCard?: { front: SourceImage; back?: SourceImage; size?: IdCardSize };
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

// ID card page layout: 'real' draws each card at its ISO size so it prints at 100 %; 'large'
// enlarges both sides to fill the page, for reading on screen or a bigger printout.
export type IdCardSize = 'real' | 'large';

// How a page image goes onto its PDF page. undefined = fit inside the standard margin (every
// normal page). 'fullPage' = edge to edge on A4 at 100 % - for images that are already a
// true-size A4 canvas (ID card mode), so they print at real size.
export type PageLayout = 'fullPage';

export type PageRotation = 0 | 90 | 180 | 270;

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
  // §7 R3: clockwise turn applied when the page is shown and built (PDF /Rotate), on top of the
  // page as stored - never baked into the master. width/height and ocr stay in the unturned
  // space; documents/pageMap applies the turn. For an imported PDF it's the turn added since the
  // page was indexed (its document.pdf already carries it). Undefined = 0.
  rotation?: PageRotation;
  // §7 R1: where `ocr` came from. 'pdf': the text layer of an imported PDF (exact, nothing was
  // recognised); 'ocr': recognised from pixels. Undefined: a scan (always OCR) or no text yet.
  textSource?: 'ocr' | 'pdf';
};

// §7 R1: how far an imported PDF's pages were read for thumbnails and search.
// 'done': every page. 'partial': only the first INDEX_MAX_PAGES (a very long file). 'encrypted':
// none - it needs a password (it still opens in the Reader). 'failed': none - the file couldn't
// be read.
export type IndexState = 'done' | 'partial' | 'encrypted' | 'failed';

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
  // The Course this document is filed under. Undefined means "Unsorted". Purely logical: a
  // document's files always live in library/<id>/ regardless of course, so moving a document
  // between courses never touches the filesystem. Unrelated to AcademicConfig.coverPage.courseCode
  // (which only prints on the PDF cover page).
  courseId?: string;
  // Undefined means 'other' (and every document saved before K1).
  docType?: DocType;
  // Mirrors the AcademicConfig.coverPage.mode this document's page 0 was built with, if any.
  // undefined means "no cover page" OR "saved before this field existed" - both are treated
  // identically (page 0 is an image fit inside the margins) by the page map, since a missing cover
  // is far more common than a pre-migration template cover. See documents/pageMap.ts's pdfRectFor
  // for why this distinction matters (a template cover has no placed image and isn't fit into
  // CONTENT_MARGIN_PT, unlike every other page).
  coverKind?: 'template' | 'imported_image';
  // undefined ≡ 'scanned' (every document saved before this field existed, or made via the
  // capture pipeline). 'imported_pdf' marks a document promoted from an externally-opened PDF
  // (see promoteExternalToLibrary in libraryOperations.ts). Its pages map 1:1 to the PDF's pages,
  // but have no master image (fileUri ''): §7 R1 gives them a thumbnail and the page's text, and
  // masters are rendered on demand. Sign/Submit/etc. must branch on this.
  sourceKind?: 'scanned' | 'imported_pdf';
  // §5 T1: how document.pdf was laid out, written by every build, so a library page can be
  // mapped to its PDF page and rectangle (documents/pageMap.ts). Undefined: not known yet (built
  // before T1; filled in by the backfill), read as standard A4.
  pdfLayout?: 'standard' | '2_in_1';
  pdfPageSize?: 'A4' | 'Letter';
  // §16 G4: the backfill (documents/pdfInfoBackfill.ts) couldn't read this document's PDF (it is
  // missing or damaged), so it isn't opened again on every launch. Only means something while
  // pdfLayout is unknown. Undefined: not tried, or read.
  pdfInfoFailed?: boolean;
  // §3 K6: put away. Hidden from lists (behind "Show archived") but still found by search; it
  // stays in its course. Undefined = not archived.
  archived?: boolean;
  // §7 R1, imported PDFs only: when indexing finished (whatever the outcome) and how it went.
  // Undefined: not indexed yet - the background indexer (store/useImportedPdfIndexing) picks it
  // up, resuming after the pages that already have a thumbnail.
  indexedAt?: number;
  indexState?: IndexState;
  // §7 R4: the PDF page (1-based) the Reader was last on, so reopening resumes there. Undefined:
  // never read (opens at page 1).
  lastPage?: number;
  // §18 W19: where exactly reading stopped, for every format (ReaderPosition). It wins over
  // `lastPage` when it still fits the document; undefined: never read since W19.
  lastPosition?: ReaderPosition;
  // §8 B1: the start-up integrity check (storage/integrity.ts) found its PDF, source file or a
  // page master missing (deleted by hand, or a partial Android restore). The library says so and
  // the Reader shows a message instead of failing. Cleared when the files are back. Undefined:
  // everything was there.
  missingFiles?: boolean;
};

// A file opened from outside the library (OS "Open with", share-to-app, or the in-app picker) —
// never persisted to AsyncStorage/SQLite. `uri` is always a stable local copy under
// Paths.document/external-open/<id>/, never the original incoming URI (see externalFileService.ts
// for why: content:// / security-scoped grants from the source app aren't reliably durable).
// §18 W19 (A12, A15): where reading stopped in a document.
// - 'page': the page surface (PDFs and scans). `pageId` is the library page at the top of the
//   visible band, which survives a reorder, a deleted page and an added cover; `index` (0-based,
//   as the surface counts) stands in when there is no such page (an outside file, an imported PDF
//   not indexed yet, a page since deleted). `fy`: how far down that page, 0..1.
// - 'txt': the chunk at the top of the list and how far down it.
// - 'sheet': the tab, and the cell at the top-left of the grid.
// - 'docx': how far down the document, 0..1 of its scroll range.
export type PagePosition = { kind: 'page'; pageId?: string; index: number; fy: number };
export type ViewerPosition =
  | { kind: 'txt'; chunk: number; fy: number }
  | { kind: 'sheet'; sheet: number; row: number; col: number }
  | { kind: 'docx'; fraction: number };
export type ReaderPosition = PagePosition | ViewerPosition;

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
// "courseFolder" routing).
export type Course = {
  id: string;
  name: string;
  code?: string;
  // A palette id (services/courses/palette.ts), resolved to a light/dark colour by the theme.
  color: CourseColor;
  emoji?: string;
  teacher?: string;
  // Undefined: not in any semester.
  semesterId?: string;
  archived: boolean;
  // Position in course lists; 0 first. Rewritten as a whole by library/REORDER_COURSES.
  sortOrder: number;
  createdAt: number;
  // How work for this course is submitted (§4 S6); set by the first submit. Undefined: the app
  // default (submit/preset.defaultSubmitPreset).
  submitPreset?: SubmitPreset;
  // §6 L1: the script this course's pages are recognised with (a Bangla literature course and an
  // English physics course need different models). Undefined: the app setting. Always read
  // through scripts/registry.resolveOcrScript.
  ocrScript?: OcrScript;
};

export type CourseColor =
  | 'teal'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'slate';

// A term that courses belong to. Its own entity (not a string on the course) so a whole semester
// archives in one step and the current one can be found by date. Dates are local calendar days,
// 'YYYY-MM-DD'.
export type Semester = {
  id: string;
  name: string;
  startsOn: string;
  // Undefined: open-ended (the student didn't say when it ends).
  endsOn?: string;
  archived: boolean;
  createdAt: number;
};

// One weekly class time of a course (the optional timetable, §3 K5). Minutes since local midnight;
// weekday 0 = Sunday, as Date.getDay().
export type TimetableSlot = {
  id: string;
  courseId: string;
  weekday: number;
  startMin: number;
  endMin: number;
};

// What kind of document it is, for filtering and §4's `{type}` naming field. A document without
// one is treated as 'other'.
export type DocType = 'assignment' | 'notes' | 'handout' | 'exam' | 'lab' | 'other';

// The student's details, typed once in Settings and used by §4 for file names (`{name}`,
// `{roll}`), cover pages and footers. Stored only on the phone (AsyncStorage settings); empty
// strings mean "not given".
export type StudentProfile = { name: string; roll: string; section: string; institution: string };

// One file handed in (§4 S7): a Submit of a library document. The file itself is
// library/<documentId>/submissions/<fileName>; it goes with the document.
export type Submission = {
  id: string;
  documentId: string;
  // The document's course when it was submitted; undefined = Unsorted (or the course was deleted).
  courseId?: string;
  // With `.pdf`.
  fileName: string;
  sizeBytes: number;
  sizeLimitBytes: number | null;
  // Content pages, not counting a cover.
  pageCount: number;
  createdAt: number;
  // What it was built with, so "Share again" can rebuild it the same way if the file is gone.
  preset?: SubmitPreset;
  typeNumber?: number;
};

// A due date for a course (§4 S8), with local reminders 24 h and 2 h before it.
export type Deadline = {
  id: string;
  courseId: string;
  title: string;
  dueAt: number;
  // Only a submission of this type marks it done; undefined = any type.
  docType?: DocType;
  // The scheduled notifications (expo-notifications identifiers), to cancel on edit or done.
  reminderIds: string[];
  // The submission that settled it; undefined = still open.
  doneSubmissionId?: string;
  createdAt: number;
};

// §5 T4: a mark on a library page, stored as data in master pixels (like OCR boxes) and written
// into document.pdf as a real PDF annotation by every build (annotations/pdfAnnotations.ts).
// §12 D3 added underline and strike: the same word rects as a highlight, drawn as a line.
// §12 D10: 'text', a typed text box (Pro).
// §18 W16: 'signature', the student's signature placed on a page. A row like any mark: drawn live
// by the Reader, written into the copies that leave the app, never into the page's master.
export type AnnotationKind = 'highlight' | 'underline' | 'strike' | 'ink' | 'note' | 'text' | 'signature';
export type AnnotationData =
  // Highlighter, underline, strike: one rect per line it covers, snapped to word boxes (or one
  // free rect).
  | { rects: OcrBounding[] }
  // Pen: strokes of [x, y] points, and the pen width in master pixels.
  | { strokes: [number, number][][]; width: number }
  // Note: where its icon sits.
  | { x: number; y: number }
  // §12 D10 text box: its box (the text's top-left corner and how far it reaches) and the font
  // size, both in master pixels. The text is `text`, one line per '\n'. §18 W15: `turn` as for a
  // signature below (a box typed on a page shown turned reads upright there).
  | { box: OcrBounding; size: number; turn?: PageRotation }
  // §18 W16 signature: its box, and the name of its PNG in the document's folder
  // (`sig_<id>.png`, a copy of the signature as it was when placed: services/signature/signatureRows.ts).
  // `turn`: how far the image is turned inside the box (clockwise), so that a signature placed on
  // a page shown turned reads upright there; the box is the turned image's (marks.turnedQuad).
  | { box: OcrBounding; file: string; turn?: PageRotation };
export type Annotation = {
  id: string;
  documentId: string;
  pageId: string;
  kind: AnnotationKind;
  // A key of annotations/palette.ts.
  color: string;
  data: AnnotationData;
  // Highlight, underline, strike: the words it covers. Note: the note itself. Text box: its text.
  text?: string;
  createdAt: number;
  updatedAt: number;
};

// §5 T5: a bookmarked library page, optionally labelled.
export type Bookmark = {
  id: string;
  documentId: string;
  pageId: string;
  label?: string;
  createdAt: number;
};
