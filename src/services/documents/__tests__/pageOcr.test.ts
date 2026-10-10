import { File, Paths } from 'expo-file-system';
import { resetStorage } from '../../../test/db';
import { makeDoc, makePage } from '../../../test/fixtures';
import { makeJpeg } from '../../../test/jpeg';
import { pdfPageTexts } from '../../../test/pdfs';
import { paragraphsFromOcr, readPagesText } from '../../convert/toDocx';
import { buildPdfFromPages, toSourcePage } from '../../pdf/pdfService';
import { getDb } from '../../persistence/dbService';
import { loadAll, syncLibrary, type LoadedLibrary } from '../../persistence/libraryRepo';
import type { LibraryDocument, PageOcr } from '../../../types/models';
import { hasDeferredBlocks, withPageBlocks } from '../pageOcr';

beforeEach(resetStorage);

const empty: LoadedLibrary = { documents: [], courses: [], semesters: [], timetable: [] };

function line(text: string, top: number): PageOcr['blocks'][number] {
  const bounding = { left: 60, top, width: 400, height: 30 };
  return { text, bounding, lines: [{ text, bounding, words: text.split(' ').map((word, i) => ({ text: word, bounding: { ...bounding, left: 60 + i * 120, width: 100 } })) }] };
}

// A scan saved with word boxes, then loaded the way the app starts: text only.
async function loadedScan(): Promise<LibraryDocument> {
  const master = new File(Paths.document, 'library', 'd1', 'page_1.jpg');
  master.write(makeJpeg(600, 800));
  const ocr: PageOcr = { text: 'Osmosis notes\nWater moves', blocks: [line('Osmosis notes', 80), line('Water moves', 200)] };
  const doc = makeDoc({ id: 'd1', pages: [makePage({ id: 'p1', fileUri: master.uri, width: 600, height: 800, ocr })] });
  await syncLibrary(await getDb(), empty, { ...empty, documents: [doc] });
  return (await loadAll(await getDb())).documents[0];
}

describe('word boxes on demand (§16 G4)', () => {
  it('withPageBlocks loads what the library load left out, once', async () => {
    const doc = await loadedScan();
    expect(doc.pages[0].ocr?.blocks).toEqual([]);
    expect(hasDeferredBlocks(doc.pages)).toBe(true);

    const pages = await withPageBlocks(doc.pages);
    expect(pages[0].ocr?.blocks.map((b) => b.text)).toEqual(['Osmosis notes', 'Water moves']);
    expect(await withPageBlocks(pages)).toBe(pages);
  });

  it('a PDF built from a just-loaded document still has its text layer', async () => {
    const doc = await loadedScan();
    const dest = new File(Paths.cache, 'pageOcr', 'out.pdf');
    const built = await buildPdfFromPages(doc.id, doc.pages.map(toSourcePage), 'as-is', undefined, 'standard', 'A4', { dest });
    expect((await pdfPageTexts(built.uri))[0]).toContain('Osmosis notes');
  });

  it('Convert to Word reads the lines of a just-loaded document', async () => {
    const doc = await loadedScan();
    const [page] = await readPagesText({ kind: 'library', doc, script: 'latin' });
    expect(page?.blocks).toHaveLength(2);
    expect(paragraphsFromOcr(page).length).toBeGreaterThan(0);
  });
});
