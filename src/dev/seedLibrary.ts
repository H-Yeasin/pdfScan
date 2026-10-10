import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import type { Dispatch } from 'react';
import type { AppAction } from '../store/appReducer';
import type { Bookmark, LibraryDocument, LibraryPage, Submission } from '../types/models';
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

function ocrText(i: number): string {
  return Array.from({ length: 60 }, (_, k) => WORDS[(i * 7 + k * 3) % WORDS.length]).join(' ');
}

async function onePagePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return pdf.save();
}

export async function seedLibrary(dispatch: Dispatch<AppAction>, onProgress?: (done: number) => void): Promise<void> {
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
      ocr: { text, blocks: [] },
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
