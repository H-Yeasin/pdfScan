import { File, Paths } from 'expo-file-system';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

// Test PDFs with real text: page i shows texts[i] in Helvetica, so pdfjs reads it back.
export async function makeTextPdf(texts: string[], options: { size?: [number, number]; name?: string } = {}): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = pdfDoc.addPage(options.size ?? [612, 792]);
    page.drawText(text, { x: 72, y: page.getHeight() - 100, size: 18, font });
  }
  const file = new File(Paths.cache, 'pdfs', options.name ?? `${Math.random().toString(36).slice(2)}.pdf`);
  file.write(await pdfDoc.save());
  return file.uri;
}

// A PDF whose trailer says it is encrypted (pdf-lib can't encrypt; this is all `load` checks).
export async function makeEncryptedPdf(): Promise<string> {
  const pdfDoc = await PDFDocument.load(await new File(await makeTextPdf(['Secret'])).bytes());
  pdfDoc.context.trailerInfo.Encrypt = pdfDoc.context.register(pdfDoc.context.obj({ Filter: PDFName.of('Standard') }));
  const file = new File(Paths.cache, 'pdfs', `encrypted_${Math.random().toString(36).slice(2)}.pdf`);
  file.write(await pdfDoc.save());
  return file.uri;
}

// The text of every page, via pdfjs (what a reader or search engine would extract).
export async function pdfPageTexts(uri: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    out.push((content.items as { str: string }[]).map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}
