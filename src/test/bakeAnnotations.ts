import { File } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { removeOurAnnotations, writeMarks } from '../services/annotations/pdfAnnotations';
import type { Annotation, LibraryDocument } from '../types/models';

type BakedDoc = Parameters<typeof writeMarks>[1] & Pick<LibraryDocument, 'pdfUri'>;

// What builds before §18 W17 did after a Mark session: rewrites the annotations in the document's
// own PDF, in place. The app no longer does this (document.pdf holds none of ours); tests use it
// to look at what the writers produce, and to make a file as an older build left it. Returns the
// new file size, or null when the file was left alone.
export async function updatePdfAnnotations(doc: BakedDoc, annotations: readonly Annotation[]): Promise<number | null> {
  if (!doc.pdfUri) return null;
  const file = new File(doc.pdfUri);
  if (!file.exists) return null;
  const pdfDoc = await PDFDocument.load(await file.bytes());
  const removed = removeOurAnnotations(pdfDoc);
  const written = await writeMarks(pdfDoc, doc, annotations);
  if (removed === 0 && written === 0) return null;
  file.write(await pdfDoc.save());
  return file.size;
}
