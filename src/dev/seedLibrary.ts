import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import type { Dispatch } from 'react';
import type { AppAction } from '../store/appReducer';
import type { Bookmark, LibraryDocument, LibraryPage, OcrBlock, OcrLine, OcrWord, PageOcr, Submission } from '../types/models';
import { getDocumentDir } from '../services/persistence/libraryFiles';
import { createId } from '../utils/id';

// §9 O5, dev only: a library big enough to measure (500 documents across 8 courses, with
// thumbnails, OCR text, bookmarks and submissions) - see docs/qa/performance.md. Every document
// gets a real one-page PDF and a real thumbnail in its own folder, so the integrity check (§8 B1)
// leaves them alone and the Reader opens them. Goes through the normal actions, so the documents
// are persisted like any other; delete them from the Library (select all) when done.

export const SEED_DOCUMENTS = 500;
export const SEED_COURSES = 8;

const COURSE_NAMES = ['Calculus II', 'Organic Chemistry', 'Physics I', 'Data Structures', 'Microeconomics', 'World History', 'Linear Algebra', 'Biology'];
const WORDS = 'integral derivative molecule reaction velocity momentum array tree graph supply demand empire treaty matrix vector cell enzyme theorem proof lecture notes assignment lab quiz'.split(' ');

// §16 G9: a page of notes is about 250 words (G4's Node measurement used the same), so search and
// the word-box load see real sizes, not a token amount.
const WORDS_PER_PAGE = 250;

export function ocrText(i: number): string {
  return Array.from({ length: WORDS_PER_PAGE }, (_, k) => WORDS[(i * 7 + k * 3) % WORDS.length]).join(' ');
}

// §16 G4/G9: the same text as OCR stores it, for the "boot doesn't grow with OCR size" check
// (docs/qa/performance.md): seed once without and once with, and compare the cold start. Laid out
// like ML Kit's output for a page of notes: paragraphs (blocks) of a few lines, a box per line and per
// word, each word as wide as its letters, all in the page's pixels (595 x 842) and inside it. The
// JSON comes to about 25 KB a page, what G4's Node measurement stored per page (52.6 MB for 2,000).
const PARAGRAPH_WORDS = 45;
const LINE_WIDTH = 515;
const MARGIN = 40;
const LINE_HEIGHT = 20;
const LINE_GAP = 4;
const PARAGRAPH_GAP = 14;
const CHAR_WIDTH = 6.4;
const SPACE = 5;

export function ocrWithBoxes(text: string): PageOcr {
  const words = text.split(' ');
  const blocks: OcrBlock[] = [];
  let top = 50;
  for (let start = 0; start < words.length; start += PARAGRAPH_WORDS) {
    const lines: OcrLine[] = [];
    let row: OcrWord[] = [];
    let left = MARGIN;
    const closeLine = () => {
      if (row.length === 0) return;
      const last = row[row.length - 1].bounding;
      lines.push({ text: row.map((w) => w.text).join(' '), bounding: { left: MARGIN, top, width: last.left + last.width - MARGIN, height: LINE_HEIGHT }, words: row });
      top += LINE_HEIGHT + LINE_GAP;
      row = [];
      left = MARGIN;
    };
    for (const word of words.slice(start, start + PARAGRAPH_WORDS)) {
      const width = Math.round(word.length * CHAR_WIDTH);
      if (left + width > MARGIN + LINE_WIDTH) closeLine();
      row.push({ text: word, bounding: { left, top, width, height: LINE_HEIGHT } });
      left += width + SPACE;
    }
    closeLine();
    const first = lines[0].bounding;
    blocks.push({
      text: lines.map((l) => l.text).join('\n'),
      lines,
      bounding: { left: MARGIN, top: first.top, width: Math.max(...lines.map((l) => l.bounding.width)), height: top - LINE_GAP - first.top },
    });
    top += PARAGRAPH_GAP;
  }
  return { text, blocks };
}

async function onePagePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return pdf.save();
}

export async function seedLibrary(
  dispatch: Dispatch<AppAction>,
  onProgress?: (done: number) => void,
  options: { wordBoxes?: boolean } = {}
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asset = await Asset.fromModule(require('../../assets/splash-icon.png')).downloadAsync();
  const image = new File(asset.localUri ?? asset.uri);
  const pdfBytes = await onePagePdf();

  const courseIds = COURSE_NAMES.slice(0, SEED_COURSES).map((name, i) => {
    const id = createId('course');
    dispatch({ type: 'library/CREATE_COURSE', id, name, fields: { code: `SEED${101 + i}` } });
    return id;
  });

  const now = Date.now();
  // One at a time, like the app's own pipelines: 500 file copies in parallel would thrash storage.
  for (let i = 0; i < SEED_DOCUMENTS; i++) {
    const id = createId('doc');
    const dir = getDocumentDir(id);
    if (!dir.exists) dir.create({ intermediates: true });
    const thumb = new File(dir, 'thumb_1.png');
    image.copy(thumb);
    const pdf = new File(dir, 'document.pdf');
    pdf.write(pdfBytes);

    const text = ocrText(i);
    const page: LibraryPage = {
      id: createId('page'),
      fileUri: thumb.uri,
      thumbUri: thumb.uri,
      width: 595,
      height: 842,
      ocr: options.wordBoxes ? ocrWithBoxes(text) : { text, blocks: [] },
    };
    // Every 9th document is Unsorted.
    const courseId = i % 9 === 8 ? undefined : courseIds[i % courseIds.length];
    const doc: LibraryDocument = {
      id,
      name: `Seed ${String(i + 1).padStart(3, '0')} ${WORDS[i % WORDS.length]}`,
      format: 'PDF',
      mode: 'doc',
      pages: [page],
      pdfUri: pdf.uri,
      sizeBytes: pdfBytes.length,
      createdAt: now - i * 3_600_000,
      star: i % 11 === 0,
      locked: false,
      courseId,
    };
    dispatch({ type: 'library/ADD_FILE', file: doc });

    if (i % 5 === 0) {
      const bookmark: Bookmark = { id: createId('bookmark'), documentId: id, pageId: page.id, createdAt: now };
      dispatch({ type: 'library/ADD_BOOKMARK', bookmark });
    }
    if (i % 7 === 0) {
      const submission: Submission = {
        id: createId('submission'),
        documentId: id,
        courseId,
        fileName: `${doc.name}.pdf`,
        sizeBytes: pdfBytes.length,
        sizeLimitBytes: null,
        pageCount: 1,
        createdAt: now,
      };
      dispatch({ type: 'library/ADD_SUBMISSION', submission });
    }
    if (i % 25 === 0) {
      onProgress?.(i);
      // Lets the UI (and the persistence sync) breathe between batches.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.(SEED_DOCUMENTS);
}
