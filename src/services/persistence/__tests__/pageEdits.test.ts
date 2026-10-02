import { File, Paths } from 'expo-file-system';
import { PDFDocument, degrees } from 'pdf-lib';
import { makePng } from '../../../test/png';
import { makeTextPdf, pdfPageTexts } from '../../../test/pdfs';
import { resetStorage } from '../../../test/db';
import { buildPdfFromPages, toSourcePage } from '../../pdf/pdfService';
import { rearrangePages } from '../../pdf/pdfOps';
import { getDocumentDir } from '../libraryFiles';
import { appendDocuments } from '../libraryOperations';
import {
  PagesNotReadyError,
  extractToNewDocument,
  isEdited,
  movePages,
  removePages,
  rotatePages,
  savePageEdit,
  startEdit,
} from '../pageEdits';
import { getDb } from '../dbService';
import { loadAll, syncLibrary } from '../libraryRepo';
import type { LibraryDocument, LibraryPage } from '../../../types/models';

const ocrOf = (text: string) => {
  const bounding = { left: 100, top: 100, width: 600, height: 40 };
  return { text, blocks: [{ text, bounding, lines: [{ text, bounding }] }] };
};

function write(dir: string, name: string, bytes: Uint8Array | string): string {
  const f = new File(getDocumentDir(dir), name);
  f.write(bytes);
  return f.uri;
}

async function scannedDoc(id: string, texts: string[]): Promise<LibraryDocument> {
  const pages: LibraryPage[] = texts.map((text, i) => ({
    id: `${id}_p${i}`,
    fileUri: write(id, `page_${i + 1}.png`, makePng(20, 28)),
    thumbUri: write(id, `thumb_${i + 1}.png`, makePng(4, 6)),
    width: 1000,
    height: 1400,
    ocr: ocrOf(text),
  }));
  const pdf = await buildPdfFromPages(id, pages.map(toSourcePage), 'as-is');
  return { id, name: id, format: 'PDF', mode: 'doc', pages, pdfUri: pdf.uri, sizeBytes: pdf.sizeBytes, createdAt: 1, star: false, locked: false, searchHaystack: '', pdfLayout: 'standard' };
}

async function importedDoc(id: string, texts: string[]): Promise<LibraryDocument> {
  const dest = new File(getDocumentDir(id), 'document.pdf');
  new File(await makeTextPdf(texts)).copySync(dest);
  const pages: LibraryPage[] = texts.map((text, i) => ({
    id: `${id}_p${i}`,
    fileUri: '',
    thumbUri: write(id, `thumb_${id}_p${i}.jpg`, 'thumb'),
    width: 1855,
    height: 2400,
    ocr: ocrOf(text),
    textSource: 'pdf',
  }));
  return { id, name: id, format: 'PDF', mode: 'doc', pages, pdfUri: dest.uri, sizeBytes: dest.size, createdAt: 1, star: false, locked: false, searchHaystack: '', sourceKind: 'imported_pdf', pdfLayout: 'standard', indexedAt: 1, indexState: 'done' };
}

async function rotations(uri: string): Promise<number[]> {
  const pdf = await PDFDocument.load(await new File(uri).bytes());
  return pdf.getPages().map((p) => p.getRotation().angle);
}

beforeEach(resetStorage);

describe('page edit drafts', () => {
  it('rotates, removes and moves pages by id', () => {
    const doc = { pages: ['a', 'b', 'c', 'd'].map((id) => ({ id, fileUri: '', width: 1, height: 1 })) } as LibraryDocument;
    let edit = startEdit(doc);
    expect(isEdited(doc, edit)).toBe(false);
    edit = rotatePages(edit, ['b'], 90);
    edit = rotatePages(edit, ['b'], 270);
    expect(edit.rotation).toEqual({});
    edit = rotatePages(edit, ['c'], -90);
    expect(edit.rotation).toEqual({ c: 270 });
    expect(movePages(edit, ['c', 'd'], -1).order).toEqual(['a', 'c', 'd', 'b']);
    expect(movePages(edit, ['a'], -1).order).toEqual(['a', 'b', 'c', 'd']);
    expect(movePages(edit, ['a', 'b'], 1).order).toEqual(['c', 'a', 'b', 'd']);
    expect(removePages(edit, ['b']).order).toEqual(['a', 'c', 'd']);
    expect(isEdited(doc, edit)).toBe(true);
  });
});

describe('savePageEdit', () => {
  it('rebuilds a scan with the new order, /Rotate and without the deleted page', async () => {
    const doc = await scannedDoc('scan', ['First', 'Second', 'Third']);
    const deletedFiles = [doc.pages[1].fileUri, doc.pages[1].thumbUri!];
    let edit = startEdit(doc);
    edit = removePages(edit, ['scan_p1']);
    edit = movePages(edit, ['scan_p2'], -1);
    edit = rotatePages(edit, ['scan_p2'], 90);

    const saved = await savePageEdit(doc, edit);
    expect(saved.id).toBe('scan');
    expect(saved.pages.map((p) => p.id)).toEqual(['scan_p2', 'scan_p0']);
    expect(saved.pages[0].rotation).toBe(90);
    expect(await rotations(saved.pdfUri!)).toEqual([90, 0]);
    expect((await pdfPageTexts(saved.pdfUri!)).map((t) => t.trim())).toEqual(['Third', 'First']);
    expect(deletedFiles.every((uri) => !new File(uri).exists)).toBe(true);
    // The masters themselves are untouched.
    expect(new File(saved.pages[0].fileUri).exists).toBe(true);
  });

  it('rearranges an imported PDF with pdf-lib, adding turns to the /Rotate it has', async () => {
    const doc = await importedDoc('imp', ['One', 'Two', 'Three']);
    // Page 3 came turned already.
    const turned = await PDFDocument.load(await new File(doc.pdfUri!).bytes());
    turned.getPage(2).setRotation(degrees(90));
    new File(doc.pdfUri!).write(await turned.save());

    let edit = rotatePages(startEdit(doc), ['imp_p2', 'imp_p0'], 90);
    edit = movePages(edit, ['imp_p2'], -1);
    const saved = await savePageEdit(doc, edit);
    expect(saved.pages.map((p) => p.id)).toEqual(['imp_p0', 'imp_p2', 'imp_p1']);
    expect(await rotations(saved.pdfUri!)).toEqual([90, 180, 0]);
    expect(await pdfPageTexts(saved.pdfUri!)).toEqual(['One', 'Three', 'Two']);

    // Saving again only adds what changed since.
    const again = await savePageEdit(saved, rotatePages(startEdit(saved), ['imp_p0'], 90));
    expect(await rotations(again.pdfUri!)).toEqual([180, 180, 0]);
  });

  it('waits for an imported PDF that is still being read', async () => {
    const doc = { ...(await importedDoc('wait', ['x'])), indexedAt: undefined, indexState: undefined };
    await expect(savePageEdit(doc, startEdit(doc))).rejects.toBeInstanceOf(PagesNotReadyError);
  });

  it('keeps the rotation through the database', async () => {
    const doc = await scannedDoc('db', ['A']);
    const saved = await savePageEdit(doc, rotatePages(startEdit(doc), ['db_p0'], 270));
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, { documents: [saved], courses: [], semesters: [], timetable: [] });
    expect((await loadAll(db)).documents[0].pages[0].rotation).toBe(270);
  });
});

describe('rearrangePages', () => {
  it('refuses a turn that is not a quarter turn, or no pages', async () => {
    const src = await makeTextPdf(['a']);
    const dest = new File(Paths.cache, 'r.pdf');
    await expect(rearrangePages(src, [0], [45], dest)).rejects.toThrow(RangeError);
    await expect(rearrangePages(src, [], [], dest)).rejects.toThrow(RangeError);
  });
});

describe('extractToNewDocument', () => {
  it('copies the chosen scan pages into a new document in the same course', async () => {
    const doc = { ...(await scannedDoc('ex', ['One', 'Two', 'Three'])), courseId: 'c1' };
    doc.pages[2] = { ...doc.pages[2], rotation: 90 };
    const extracted = await extractToNewDocument(doc, ['ex_p2', 'ex_p0']);
    expect(extracted.id).not.toBe('ex');
    expect(extracted.courseId).toBe('c1');
    expect(extracted.name).toBe('ex_p1_3');
    expect(extracted.pages.map((p) => p.ocr?.text)).toEqual(['One', 'Three']);
    expect(extracted.pages.every((p) => !p.id.startsWith('ex_'))).toBe(true);
    expect(await rotations(extracted.pdfUri!)).toEqual([0, 90]);
    // The source keeps its pages.
    expect(new File(doc.pages[0].fileUri).exists).toBe(true);
  });

  it('copies imported pages as PDF pages', async () => {
    const doc = await importedDoc('exi', ['Alpha', 'Beta', 'Gamma']);
    const extracted = await extractToNewDocument(doc, ['exi_p1']);
    expect(extracted.sourceKind).toBe('imported_pdf');
    expect(await pdfPageTexts(extracted.pdfUri!)).toEqual(['Beta']);
  });
});

describe('appendDocuments', () => {
  it('adds pages at the end, keeping the document and its page ids', async () => {
    const target = await scannedDoc('target', ['T1', 'T2']);
    // An earlier edit removed page 1, so the file names no longer follow the positions.
    const edited = await savePageEdit(target, removePages(startEdit(target), ['target_p0']));
    const extra = await scannedDoc('extra', ['E1', 'E2']);

    const appended = await appendDocuments(edited, [extra]);
    expect(appended.id).toBe('target');
    expect(appended.pages[0].id).toBe('target_p1');
    expect(appended.pages.slice(1).every((p) => !p.id.startsWith('extra'))).toBe(true);
    expect(appended.pages.map((p) => p.ocr?.text)).toEqual(['T2', 'E1', 'E2']);
    // Every page has its own master file; nothing was overwritten.
    expect(new Set(appended.pages.map((p) => p.fileUri)).size).toBe(3);
    expect(appended.pages.every((p) => new File(p.fileUri).exists)).toBe(true);
    expect((await pdfPageTexts(appended.pdfUri!)).map((t) => t.trim())).toEqual(['T2', 'E1', 'E2']);
    // The source document is left as it was.
    expect(extra.pages.every((p) => new File(p.fileUri).exists)).toBe(true);
  });

  it('appends a scan to an imported PDF at the PDF level', async () => {
    const target = await importedDoc('handout', ['Handout']);
    const answers = await scannedDoc('answers', ['My answer']);
    const appended = await appendDocuments(target, [answers]);
    expect(appended.id).toBe('handout');
    expect(appended.sourceKind).toBe('imported_pdf');
    const texts = await pdfPageTexts(appended.pdfUri!);
    expect(texts[0]).toBe('Handout');
    expect(texts[1]).toContain('My answer');
  });
});
