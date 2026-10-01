import { File } from 'expo-file-system';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, type PDFPage } from 'pdf-lib';
import { pdfRectFor, type PdfRect } from '../documents/pageMap';
import type { Annotation, LibraryDocument } from '../../types/models';
import { annotationColor, rgb01 } from './palette';

// §5 T4: annotations are data (master pixels); every PDF of a document gets them as real PDF
// annotation objects - /Highlight, /Ink, /Text - so other PDF apps show them, can hide or delete
// them, and they survive rebuilds (the builder writes them again). Each carries
// /NM (pdfscan:<id>) so ours can be found and replaced, and an appearance stream (/AP) so viewers
// that don't draw annotations themselves still show them.

export const NM_PREFIX = 'pdfscan:';

type MappedDoc = Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout' | 'pdfPageSize'>;
// pdf-lib's literal dictionary type (not exported by name).
type Literal = NonNullable<Parameters<PDFDocument['context']['stream']>[1]>;

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

function point(doc: MappedDoc, idx: number, x: number, y: number): PdfRect | null {
  return pdfRectFor(doc, idx, { left: x, top: y, width: 0, height: 0 });
}

function boundsOf(rects: readonly { x: number; y: number; width: number; height: number }[]) {
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return [x1, y1, x2, y2] as const;
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

// Writes `annotations` into `pdfDoc`, which must have been laid out as `doc` says (pages, cover,
// pdfLayout, pdfPageSize). Annotations on pages the document doesn't have are skipped. Returns how
// many were written.
export function writeAnnotations(pdfDoc: PDFDocument, doc: MappedDoc, annotations: readonly Annotation[]): number {
  const pages = pdfDoc.getPages();
  let written = 0;
  for (const a of annotations) {
    const idx = doc.pages.findIndex((p) => p.id === a.pageId);
    if (idx < 0) continue;
    if ('rects' in a.data && a.kind === 'highlight') {
      const rects = a.data.rects.map((r) => pdfRectFor(doc, idx, r)).filter((r): r is PdfRect => r !== null);
      const page = rects[0] && pages[rects[0].page - 1];
      if (!page) continue;
      const bounds = boundsOf(rects);
      const quads = rects.flatMap((r) => [r.x, r.y + r.height, r.x + r.width, r.y + r.height, r.x, r.y, r.x + r.width, r.y]);
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
      written += 1;
    } else if ('strokes' in a.data && a.kind === 'ink') {
      const strokes = a.data.strokes
        .map((stroke) => stroke.map(([x, y]) => point(doc, idx, x, y)).filter((p): p is PdfRect => p !== null))
        .filter((s) => s.length > 0);
      const page = strokes[0]?.[0] && pages[strokes[0][0].page - 1];
      if (!page) continue;
      const width = pdfRectFor(doc, idx, { left: 0, top: 0, width: a.data.width, height: 0 })?.width ?? 1;
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
      const p = point(doc, idx, a.data.x, a.data.y);
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

// After an annotate session: rewrites only the annotations in the existing document.pdf (no
// image rebuild), in place. Returns the new file size.
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
