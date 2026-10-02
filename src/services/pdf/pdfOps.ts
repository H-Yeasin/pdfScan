import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues (see pdfService.ts)
import { File } from 'expo-file-system';
import { PDFDocument, degrees, type PDFPage } from 'pdf-lib';
import { PdfEncryptedError } from './pdfErrors';

// §7 R2: page-level tools on an existing PDF, with pdf-lib. Pages are copied (copyPages) or
// turned (/Rotate), never redrawn, so a teacher's PDF keeps its vector text, its links and its
// quality. Pages are 0-based, as in pdfNative.ts. Every function reads its sources before writing
// `dest`, so `dest` may be one of the sources (an in-place edit).

export type PdfFile = { uri: string; sizeBytes: number; pageCount: number };
// mergePdfs also says how many pages each source gave, to line page rows up with them.
export type MergedPdf = PdfFile & { pagesPerSource: number[] };

// Loads a PDF for editing. An encrypted file - even one that opens without a password, with
// only "owner" restrictions - throws PdfEncryptedError: pdf-lib can't decrypt, and copying its
// still-encrypted streams into a new file would give unreadable pages.
export async function loadPdf(uri: string): Promise<PDFDocument> {
  const bytes = await new File(uri).bytes();
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    // pdf-lib's EncryptedPDFError doesn't survive `instanceof` (an ES5 Error subclass), so the
    // file is asked directly: loaded without the check, does it say it's encrypted?
    const unchecked = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true }).catch(() => null);
    if (unchecked?.isEncrypted) throw new PdfEncryptedError();
    throw error;
  }
}

export async function savePdf(pdfDoc: PDFDocument, dest: File): Promise<PdfFile> {
  const bytes = await pdfDoc.save();
  if (dest.exists) dest.delete();
  dest.write(bytes);
  return { uri: dest.uri, sizeBytes: dest.size ?? 0, pageCount: pdfDoc.getPageCount() };
}

function checkPages(pdfDoc: PDFDocument, pages: readonly number[]): void {
  const count = pdfDoc.getPageCount();
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 0 || page >= count) throw new RangeError(`Page ${page} is out of range (0..${count - 1})`);
  }
}

// The given pages of each source (all of them when `pages` is left out), in order, as one PDF.
// Sources are loaded one at a time, so only one source file is in memory besides the output.
export async function mergePdfs(sources: readonly { uri: string; pages?: readonly number[] }[], dest: File): Promise<MergedPdf> {
  const out = await PDFDocument.create();
  const pagesPerSource: number[] = [];
  for (const source of sources) {
    const src = await loadPdf(source.uri);
    const pages = source.pages ?? src.getPageIndices();
    checkPages(src, pages);
    const copied = await out.copyPages(src, [...pages]);
    copied.forEach((page) => out.addPage(page));
    pagesPerSource.push(pages.length);
  }
  return { ...(await savePdf(out, dest)), pagesPerSource };
}

// One single-page PDF per page, loading the source once (Split on a long PDF).
export async function splitPdf(uri: string, destFor: (page: number) => File): Promise<PdfFile[]> {
  const src = await loadPdf(uri);
  const out: PdfFile[] = [];
  for (const i of src.getPageIndices()) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(src, [i]);
    single.addPage(page);
    out.push(await savePdf(single, destFor(i)));
  }
  return out;
}

// A new PDF of the given pages, in the given order.
export async function extractPages(uri: string, pages: readonly number[], dest: File): Promise<PdfFile> {
  return mergePdfs([{ uri, pages }], dest);
}

export async function deletePages(uri: string, pages: readonly number[], dest: File): Promise<PdfFile> {
  const src = await loadPdf(uri);
  checkPages(src, pages);
  const drop = new Set(pages);
  const keep = src.getPageIndices().filter((i) => !drop.has(i));
  if (keep.length === 0) throw new RangeError('A PDF needs at least one page');
  return extractPages(uri, keep, dest);
}

// `order` lists every page exactly once: order[i] is the page that becomes page i.
export async function reorderPages(uri: string, order: readonly number[], dest: File): Promise<PdfFile> {
  const src = await loadPdf(uri);
  checkPages(src, order);
  const isPermutation = order.length === src.getPageCount() && new Set(order).size === order.length;
  if (!isPermutation) throw new RangeError('reorderPages: the order must list every page once');
  return extractPages(uri, order, dest);
}

// Sets one page's /Rotate (clockwise, a multiple of 90): lossless, nothing is redrawn.
export async function setRotation(uri: string, page: number, angle: number, dest: File): Promise<PdfFile> {
  if (angle % 90 !== 0) throw new RangeError(`setRotation: ${angle} is not a multiple of 90`);
  const pdfDoc = await loadPdf(uri);
  checkPages(pdfDoc, [page]);
  pdfDoc.getPage(page).setRotation(degrees(((angle % 360) + 360) % 360));
  return savePdf(pdfDoc, dest);
}

// A rectangle on a page as it is shown (its /Rotate applied), as fractions of the shown width and
// height, origin top-left - the same whatever size the page was rendered at for placing it.
export type ShownRect = { x: number; y: number; width: number; height: number };

// Where `rect` lands in the page's own (unrotated) space, in points, origin bottom-left - what
// pdf-lib draws in. Handles /Rotate and a media box that doesn't start at 0,0.
export function shownRectToPage(page: PDFPage, rect: ShownRect): { x: number; y: number; width: number; height: number; rotate: number } {
  const box = page.getMediaBox();
  const rotate = ((page.getRotation().angle % 360) + 360) % 360;
  const w = box.width;
  const h = box.height;
  // Shown size: swapped for a page turned on its side.
  const sideways = rotate === 90 || rotate === 270;
  const sw = sideways ? h : w;
  const sh = sideways ? w : h;
  // The shown rectangle in shown points, top-left origin.
  const left = rect.x * sw;
  const top = rect.y * sh;
  const right = left + rect.width * sw;
  const bottom = top + rect.height * sh;
  // Inverse of the clockwise rotation (see modules/pdf-native's toDisplay): shown → page space,
  // with page y pointing up.
  let x0: number, x1: number, y0: number, y1: number;
  switch (rotate) {
    case 90:
      [x0, x1, y0, y1] = [top, bottom, left, right];
      break;
    case 180:
      [x0, x1, y0, y1] = [w - right, w - left, top, bottom];
      break;
    case 270:
      [x0, x1, y0, y1] = [w - bottom, w - top, h - right, h - left];
      break;
    default:
      [x0, x1, y0, y1] = [left, right, h - bottom, h - top];
  }
  return { x: box.x + x0, y: box.y + y0, width: x1 - x0, height: y1 - y0, rotate };
}

// Draws a PNG (a signature) onto one page, upright as the page is shown. Only that page's content
// gains an image; every other page and the text stay as they were.
export async function stampImage(uri: string, page: number, pngUri: string, rect: ShownRect, dest: File): Promise<PdfFile> {
  const pdfDoc = await loadPdf(uri);
  checkPages(pdfDoc, [page]);
  const pdfPage = pdfDoc.getPage(page);
  const image = await pdfDoc.embedPng(await new File(pngUri).bytes());
  const target = shownRectToPage(pdfPage, rect);
  // pdf-lib rotates an image counter-clockwise about its x/y corner; to look upright on a page
  // shown turned clockwise by `rotate`, it is drawn turned the same amount the other way, from
  // the corner that ends up bottom-left once shown.
  const { x, y, width, height, rotate } = target;
  const drawn = rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height };
  const corner =
    rotate === 90 ? { x: x + width, y } : rotate === 180 ? { x: x + width, y: y + height } : rotate === 270 ? { x, y: y + height } : { x, y };
  pdfPage.drawImage(image, { ...corner, ...drawn, rotate: degrees(rotate) });
  return savePdf(pdfDoc, dest);
}
