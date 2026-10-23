// §19 X1: the J3 test file, made the same way every time: perf-fixtures/pdfscan-300p.pdf, a
// 300-page "textbook" with what a real one makes the Reader do: a page of text in a real font on
// every page (so it is indexed and Find has something to find: "photosynthesis" is on every page,
// "mitochondria" on every tenth), a photo-like image on every page (pdfium decodes it on each
// render), a contents page whose lines are links, and an outline of 30 chapters.
// A real textbook is a fair test too (18-reader.md's `[300p]`); write down which file a row used.
//
// Usage: node scripts/perf/make-fixtures.mjs        (needs `npm install`: it uses pdf-lib)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFHexString, PDFName, StandardFonts, rgb } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'perf-fixtures', 'pdfscan-300p.pdf');
const PAGES = 300;
const CHAPTERS = 30;
const PER_CHAPTER = PAGES / CHAPTERS;
const A4 = [595.28, 841.89];
const MARGIN = 56;

// --- A photo-like PNG: smooth light and colour with grain, which compresses like a photo -------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function photoPng(width, height, seed) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const light = 0.5 + 0.5 * Math.sin((x + seed * 40) / 90) * Math.cos((y - seed * 25) / 70);
      const grain = (random() - 0.5) * 60;
      const i = row + 1 + x * 3;
      raw[i] = Math.max(0, Math.min(255, 70 + 150 * light + grain));
      raw[i + 1] = Math.max(0, Math.min(255, 110 + 110 * light * ((seed % 3) / 2) + grain));
      raw[i + 2] = Math.max(0, Math.min(255, 60 + 120 * (1 - light) + grain));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Text -----------------------------------------------------------------------------------------

const VOCABULARY = (
  'cell membrane nucleus enzyme protein energy light chlorophyll glucose oxygen carbon dioxide ' +
  'water root leaf stem transport diffusion osmosis respiration equation reaction molecule atom ' +
  'electron gradient pressure temperature rate experiment result observation hypothesis theory'
).split(' ');

function paragraphLine(page, line) {
  const words = [];
  for (let w = 0; w < 11; w++) words.push(VOCABULARY[(page * 13 + line * 7 + w * 5) % VOCABULARY.length]);
  if (line === 3) words.splice(4, 0, 'photosynthesis');
  if (line === 9 && page % 10 === 0) words.splice(2, 0, 'mitochondria');
  return words.join(' ');
}

function chapterTitle(c) {
  return `Chapter ${c + 1}: Topic ${String.fromCharCode(65 + (c % 26))}${c >= 26 ? c - 25 : ''}`;
}

// --- The document ---------------------------------------------------------------------------------

const doc = await PDFDocument.create();
doc.setTitle('pdfscan-300p');
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const images = [];
for (let s = 1; s <= 3; s++) images.push(await doc.embedPng(photoPng(900, 560, s)));

const pages = [];
for (let p = 0; p < PAGES; p++) {
  const page = doc.addPage(A4);
  pages.push(page);
  const [width, height] = A4;
  let y = height - MARGIN;
  if (p === 0) {
    page.drawText('Contents', { x: MARGIN, y: y - 10, size: 22, font: bold });
    y -= 50;
    for (let c = 0; c < CHAPTERS; c++) {
      page.drawText(`${chapterTitle(c)} ......... ${c * PER_CHAPTER + 2}`, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.2, 0.6) });
      y -= 22;
    }
    continue;
  }
  const chapter = Math.floor((p - 1) / PER_CHAPTER);
  page.drawText(`${chapterTitle(chapter)}  ·  page ${p + 1}`, { x: MARGIN, y: y - 6, size: 13, font: bold });
  y -= 34;
  for (let line = 0; line < 14; line++) {
    page.drawText(paragraphLine(p, line), { x: MARGIN, y, size: 10.5, font });
    y -= 15;
  }
  const image = images[p % images.length];
  const imageWidth = width - 2 * MARGIN;
  const imageHeight = (imageWidth * 560) / 900;
  y -= imageHeight + 10;
  page.drawImage(image, { x: MARGIN, y, width: imageWidth, height: imageHeight });
  page.drawText(`Figure ${chapter + 1}.${((p - 1) % PER_CHAPTER) + 1}: an observation under the microscope`, {
    x: MARGIN,
    y: y - 14,
    size: 9,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 36;
  for (let line = 14; line < 26 && y > MARGIN + 20; line++) {
    page.drawText(paragraphLine(p, line), { x: MARGIN, y, size: 10.5, font });
    y -= 15;
  }
  page.drawText(String(p + 1), { x: width / 2 - 8, y: MARGIN / 2, size: 9, font });
}

// The contents lines link to their chapter's first page.
const { context } = doc;
const contentsLinks = [];
for (let c = 0; c < CHAPTERS; c++) {
  const top = A4[1] - MARGIN - 50 - c * 22;
  const target = pages[c * PER_CHAPTER + 1];
  contentsLinks.push(
    context.register(
      context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [MARGIN, top - 4, A4[0] - MARGIN, top + 13],
        Border: [0, 0, 0],
        Dest: [target.ref, PDFName.of('Fit')],
      })
    )
  );
}
pages[0].node.set(PDFName.of('Annots'), context.obj(contentsLinks));

// The outline: one entry per chapter (pdf-lib has no outline API, so the objects are made here).
const outlineRef = context.nextRef();
const itemRefs = Array.from({ length: CHAPTERS }, () => context.nextRef());
for (let c = 0; c < CHAPTERS; c++) {
  const item = {
    Title: PDFHexString.fromText(chapterTitle(c)),
    Parent: outlineRef,
    Dest: [pages[c * PER_CHAPTER + 1].ref, PDFName.of('Fit')],
  };
  if (c > 0) item.Prev = itemRefs[c - 1];
  if (c < CHAPTERS - 1) item.Next = itemRefs[c + 1];
  context.assign(itemRefs[c], context.obj(item));
}
context.assign(outlineRef, context.obj({ Type: 'Outlines', First: itemRefs[0], Last: itemRefs[CHAPTERS - 1], Count: CHAPTERS }));
doc.catalog.set(PDFName.of('Outlines'), outlineRef);

mkdirSync(dirname(OUT), { recursive: true });
const bytes = await doc.save();
writeFileSync(OUT, bytes);
console.log(`Wrote ${OUT}: ${PAGES} pages, ${(bytes.length / 1048576).toFixed(1)} MB.`);
