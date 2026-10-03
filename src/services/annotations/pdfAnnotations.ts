import { File } from 'expo-file-system';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, type PDFPage } from 'pdf-lib';
import { pdfRectFor, type PdfRect } from '../documents/pageMap';
import { isPdfLevel } from '../documents/formatCapabilities';
import { imagePlacement } from '../pdf/pdfService';
import type { Annotation, LibraryDocument, OcrBounding } from '../../types/models';
import { isRectMark, markLine } from './marks';
import { annotationColor, rgb01 } from './palette';

// §5 T4: annotations are data (master pixels); every PDF of a document gets them as real PDF
// annotation objects - /Highlight, /Underline, /StrikeOut (§12 D3), /Ink, /Text - so other PDF apps show them, can hide or delete
// them, and they survive rebuilds (the builder writes them again). Each carries
// /NM (pdfscan:<id>) so ours can be found and replaced, and an appearance stream (/AP) so viewers
// that don't draw annotations themselves still show them.

export const NM_PREFIX = 'pdfscan:';

// `sourceKind`: an imported PDF (§7 R2) wasn't laid out by the builder; its pages map 1:1 to the
// file's pages and are measured there (pdfLevelMapper).
type MappedDoc = Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout' | 'pdfPageSize'> & Partial<Pick<LibraryDocument, 'sourceKind'>>;
// pdf-lib's literal dictionary type (not exported by name).
type Literal = NonNullable<Parameters<PDFDocument['context']['stream']>[1]>;
// A rect on a library page (master pixels) → where it lands in the PDF, or null.
type Mapper = (libraryIdx: number, rect: OcrBounding) => PdfRect | null;

const NOTE_SIZE_PT = 18;
const HIGHLIGHT_OPACITY = 0.4;

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const color = (key: string) => rgb01(annotationColor(key)).map(fmt).join(' ');

// Plain ASCII as a plain string (every reader decodes it); anything else as UTF-16 with a
// byte-order mark, as the PDF spec says. Hex either way, so brackets and backslashes need no escaping.
function textString(text: string): PDFHexString {
  if (/^[\x20-\x7e\n]*$/.test(text)) {
    return PDFHexString.of([...text].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  }
  return PDFHexString.fromText(text);
}

function boundsOf(rects: readonly { x: number; y: number; width: number; height: number }[]) {
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return [x1, y1, x2, y2] as const;
}

// §12 D3: an imported PDF's library page i is the file's page i. An imported page's width/height and word boxes
// are master pixels of the page as it was shown when indexed (R1), i.e. with the file's /Rotate
// minus any turn added since (page.rotation, R3). Annotations live in the page's unrotated user
// space (origin bottom-left of the crop box), so a point is turned back from the shown page.
export function pdfLevelMapper(pdfDoc: PDFDocument, doc: Pick<LibraryDocument, 'pages'>): Mapper {
  const pages = pdfDoc.getPages();
  return (idx, rect) => {
    const page = doc.pages[idx];
    const pdfPage = pages[idx];
    if (!page || !pdfPage) return null;
    const box = pdfPage.getCropBox();
    if (page.fileUri) {
      // A scan's page merged into an imported PDF: its master was placed by the builder (standard
      // layout), and a turn is the page's /Rotate, which leaves its space alone.
      const placement = imagePlacement(page.width, page.height, 'full', { width: box.width, height: box.height }, page.layout);
      return {
        page: idx + 1,
        x: box.x + placement.origin.x + rect.left * placement.scale,
        y: box.y + placement.origin.y + placement.height - (rect.top + rect.height) * placement.scale,
        width: rect.width * placement.scale,
        height: rect.height * placement.scale,
      };
    }
    const turn = (((pdfPage.getRotation().angle - (page.rotation ?? 0)) % 360) + 360) % 360;
    const shown = turn % 180 === 0 ? { width: box.width, height: box.height } : { width: box.height, height: box.width };
    const sx = shown.width / Math.max(1, page.width);
    const sy = shown.height / Math.max(1, page.height);
    const toUser = (x: number, y: number): [number, number] => {
      if (turn === 90) return [box.x + y, box.y + x];
      if (turn === 180) return [box.x + box.width - x, box.y + y];
      if (turn === 270) return [box.x + box.width - y, box.y + box.height - x];
      return [box.x + x, box.y + box.height - y];
    };
    const a = toUser(rect.left * sx, rect.top * sy);
    const b = toUser((rect.left + rect.width) * sx, (rect.top + rect.height) * sy);
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    return { page: idx + 1, x, y, width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
  };
}

function mapperFor(pdfDoc: PDFDocument, doc: MappedDoc): Mapper {
  return isPdfLevel({ sourceKind: doc.sourceKind }) ? pdfLevelMapper(pdfDoc, doc) : (idx, rect) => pdfRectFor(doc, idx, rect);
}

function addAnnot(
  pdfDoc: PDFDocument,
  page: PDFPage,
  a: Annotation,
  subtype: string,
  rect: readonly number[],
  appearance: string,
  extra: Literal,
  resources?: Literal
) {
  const ctx = pdfDoc.context;
  const ap = ctx.register(
    ctx.stream(appearance, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [...rect],
      ...(resources ? { Resources: resources } : {}),
    })
  );
  const dict = ctx.obj({
    Type: 'Annot',
    Subtype: subtype,
    Rect: [...rect],
    C: rgb01(annotationColor(a.color)),
    F: 4,
    P: page.ref,
    AP: { N: ap },
    ...extra,
  });
  dict.set(PDFName.of('NM'), PDFString.of(`${NM_PREFIX}${a.id}`));
  if (a.text) dict.set(PDFName.of('Contents'), textString(a.text));
  page.node.addAnnot(ctx.register(dict));
}

const RECT_SUBTYPE = { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut' } as const;

// Writes `annotations` into `pdfDoc`, which must have been laid out as `doc` says (pages, cover,
// pdfLayout, pdfPageSize), or be the document's own file for an imported PDF. Annotations on
// pages the document doesn't have are skipped. Returns how many were written.
export function writeAnnotations(pdfDoc: PDFDocument, doc: MappedDoc, annotations: readonly Annotation[]): number {
  const pages = pdfDoc.getPages();
  const toPdf = mapperFor(pdfDoc, doc);
  const point = (idx: number, x: number, y: number) => toPdf(idx, { left: x, top: y, width: 0, height: 0 });
  let written = 0;
  for (const a of annotations) {
    const idx = doc.pages.findIndex((p) => p.id === a.pageId);
    if (idx < 0) continue;
    if ('rects' in a.data && isRectMark(a.kind)) {
      const source = a.data.rects;
      const rects = source.map((r) => toPdf(idx, r)).filter((r): r is PdfRect => r !== null);
      const page = rects[0] && pages[rects[0].page - 1];
      if (!page) continue;
      const bounds = boundsOf(rects);
      // QuadPoints go upper-left, upper-right, lower-left, lower-right as the text reads, so each
      // corner is mapped on its own (a turned page or 2-in-1 column turns them).
      const quads = source.flatMap((r) =>
        [
          [r.left, r.top],
          [r.left + r.width, r.top],
          [r.left, r.top + r.height],
          [r.left + r.width, r.top + r.height],
        ].flatMap(([x, y]) => {
          const p = point(idx, x, y);
          return p ? [p.x, p.y] : [];
        })
      );
      if (a.kind === 'highlight') {
        const fill = rects.map((r) => `${fmt(r.x)} ${fmt(r.y)} ${fmt(r.width)} ${fmt(r.height)} re f`).join('\n');
        addAnnot(
          pdfDoc,
          page,
          a,
          'Highlight',
          bounds,
          `/GS0 gs ${color(a.color)} rg\n${fill}`,
          { QuadPoints: quads, CA: HIGHLIGHT_OPACITY },
          { ExtGState: { GS0: { Type: 'ExtGState', CA: HIGHLIGHT_OPACITY, ca: HIGHLIGHT_OPACITY, BM: 'Multiply' } } }
        );
      } else {
        // §12 D3: the line is filled as a thin rect, mapped like the word rect, so it lands under
        // (or through) the words whichever way the page is turned.
        const kind = a.kind;
        const lines = source.map((r) => toPdf(idx, markLine(kind, r))).filter((r): r is PdfRect => r !== null);
        const fill = lines.map((r) => `${fmt(r.x)} ${fmt(r.y)} ${fmt(r.width)} ${fmt(r.height)} re f`).join('\n');
        addAnnot(pdfDoc, page, a, RECT_SUBTYPE[kind], bounds, `${color(a.color)} rg\n${fill}`, { QuadPoints: quads });
      }
      written += 1;
    } else if ('strokes' in a.data && a.kind === 'ink') {
      const strokes = a.data.strokes
        .map((stroke) => stroke.map(([x, y]) => point(idx, x, y)).filter((p): p is PdfRect => p !== null))
        .filter((s) => s.length > 0);
      const page = strokes[0]?.[0] && pages[strokes[0][0].page - 1];
      if (!page) continue;
      const mappedWidth = toPdf(idx, { left: 0, top: 0, width: a.data.width, height: a.data.width });
      const width = mappedWidth ? Math.max(mappedWidth.width, mappedWidth.height) : 1;
      const all = strokes.flat();
      const [x1, y1, x2, y2] = boundsOf(all);
      const pad = width;
      const path = strokes
        .map((s) => s.map((p, i) => `${fmt(p.x)} ${fmt(p.y)} ${i === 0 ? 'm' : 'l'}`).join(' ') + (s.length === 1 ? ` ${fmt(s[0].x + 0.01)} ${fmt(s[0].y)} l` : '') + ' S')
        .join('\n');
      addAnnot(
        pdfDoc,
        page,
        a,
        'Ink',
        [x1 - pad, y1 - pad, x2 + pad, y2 + pad],
        `${color(a.color)} RG ${fmt(width)} w 1 J 1 j\n${path}`,
        { InkList: strokes.map((s) => s.flatMap((p) => [p.x, p.y])), BS: { W: width } }
      );
      written += 1;
    } else if ('x' in a.data && a.kind === 'note') {
      const p = point(idx, a.data.x, a.data.y);
      const page = p && pages[p.page - 1];
      if (!p || !page) continue;
      const rect = [p.x, p.y - NOTE_SIZE_PT, p.x + NOTE_SIZE_PT, p.y];
      addAnnot(
        pdfDoc,
        page,
        a,
        'Text',
        rect,
        `${color(a.color)} rg 0.2 0.2 0.2 RG 0.6 w ${fmt(rect[0])} ${fmt(rect[1])} ${NOTE_SIZE_PT} ${NOTE_SIZE_PT} re B`,
        { Name: 'Comment', Open: false }
      );
      written += 1;
    }
  }
  return written;
}

// Removes the annotations we wrote (by /NM), leaving any others in the file alone.
export function removeOurAnnotations(pdfDoc: PDFDocument): number {
  let removed = 0;
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (const ref of annots.asArray()) {
      if (!(ref instanceof PDFRef)) continue;
      const dict = pdfDoc.context.lookup(ref);
      if (!(dict instanceof PDFDict)) continue;
      const nm = dict.get(PDFName.of('NM'));
      const name = nm instanceof PDFString || nm instanceof PDFHexString ? nm.decodeText() : '';
      if (!name.startsWith(NM_PREFIX)) continue;
      page.node.removeAnnot(ref);
      const ap = dict.lookup(PDFName.of('AP'));
      const normal = ap instanceof PDFDict ? ap.get(PDFName.of('N')) : undefined;
      if (normal instanceof PDFRef) pdfDoc.context.delete(normal);
      pdfDoc.context.delete(ref);
      removed += 1;
    }
  }
  return removed;
}

// After a Mark session: rewrites only the annotations in the existing document.pdf (no image
// rebuild), in place. For an imported PDF that file is the student's own copy in the library (the
// original outside the app is never touched). Returns the new file size.
export async function updatePdfAnnotations(doc: MappedDoc & Pick<LibraryDocument, 'pdfUri'>, annotations: readonly Annotation[]): Promise<number | null> {
  if (!doc.pdfUri) return null;
  const file = new File(doc.pdfUri);
  if (!file.exists) return null;
  const pdfDoc = await PDFDocument.load(await file.bytes());
  removeOurAnnotations(pdfDoc);
  writeAnnotations(pdfDoc, doc, annotations);
  const bytes = await pdfDoc.save();
  file.delete();
  file.write(bytes);
  return file.size;
}
