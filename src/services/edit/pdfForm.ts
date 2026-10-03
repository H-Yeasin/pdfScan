import { File, Paths } from 'expo-file-system';
import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFString,
  PDFTextField,
  StandardFonts,
  type PDFField,
  type PDFFont,
} from 'pdf-lib';
import { t } from '../../i18n';
import type { ExternalFileDocument, LibraryDocument } from '../../types/models';
import { createId } from '../../utils/id';
import { NM_PREFIX } from '../annotations/pdfAnnotations';
import { PreviewTooLargeError } from '../documents/sheetService';
import { addPdfFileToLibrary } from '../persistence/libraryOperations';
import { ASCENT, helveticaFontDict, LINE_HEIGHT, textLinesAppearance } from '../pdf/textAppearance';

// §12 D10: filling in a PDF's form (Pro, `pdfForms`; one ad unlocks the document for a while, like
// D7's editing). pdf-lib's AcroForm support reads text fields, checkboxes, radio groups, dropdowns
// and list boxes; buttons and signature fields are left alone. The filled form is always a new
// library document ("<name> (filled)"): the student's original (a library PDF or a file from
// outside) is never written. Optionally flattened: the answers become part of the page and the
// fields are gone, which is what many submission portals want.
//
// Text in any script: what Helvetica can draw gets pdf-lib's own appearance; anything else (Bangla)
// gets an appearance drawn with the shaped-text images of textAppearance, so other apps show it
// without needing a font, and flattening keeps it.

// pdf-lib holds the whole file (and the saved copy) in memory.
export const PDF_FORM_MAX_BYTES = 25 * 1024 * 1024;

export type FormField =
  | { kind: 'text'; name: string; label: string; value: string; multiline: boolean; maxLength?: number }
  | { kind: 'checkbox'; name: string; label: string; value: boolean }
  // Radio groups, dropdowns and list boxes: one choice from `options` ('' = none).
  | { kind: 'choice'; name: string; label: string; value: string; options: string[] };

// What the student entered, by field name. Only fields in here change.
export type FormValues = Record<string, string | boolean>;

// The PDF needs a password: pdf-lib can't read its fields.
export class PdfFormLockedError extends Error {
  constructor() {
    super('The PDF is password-protected');
    this.name = 'PdfFormLockedError';
  }
}

export type FormSource = { uri: string; name: string };

export type FormTarget = { doc: LibraryDocument; external?: undefined } | { doc?: undefined; external: ExternalFileDocument };

export function formSourceFor(target: FormTarget): FormSource | null {
  if (target.external) return { uri: target.external.uri, name: target.external.name };
  const uri = target.doc.pdfUri ?? target.doc.contentUri;
  return uri ? { uri, name: target.doc.name } : null;
}

async function loadPdf(uri: string): Promise<PDFDocument> {
  const file = new File(uri);
  if ((file.size ?? 0) > PDF_FORM_MAX_BYTES) throw new PreviewTooLargeError('PDF form');
  try {
    return await PDFDocument.load(await file.bytes());
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new PdfFormLockedError();
    throw e;
  }
}

function decoded(value: unknown): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined;
}

// What the field is called on screen: its tooltip (/TU) when the form has one, else the last
// part of its name ("form1[0].page1[0].Student_name[0]" → "Student name").
export function fieldLabel(name: string, tooltip?: string): string {
  const tip = tooltip?.trim();
  if (tip) return tip;
  const last = name.split('.').pop() ?? name;
  const plain = last
    .replace(/\[\d+\]$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
  return plain || name;
}

function choiceOptions(options: string[], selected: string): string[] {
  return selected && !options.includes(selected) ? [...options, selected] : options;
}

function toFormField(field: PDFField): FormField | null {
  if (field.isReadOnly()) return null;
  const name = field.getName();
  const label = fieldLabel(name, decoded(field.acroField.dict.lookup(PDFName.of('TU'))));
  if (field instanceof PDFTextField) {
    return { kind: 'text', name, label, value: field.getText() ?? '', multiline: field.isMultiline(), maxLength: field.getMaxLength() };
  }
  if (field instanceof PDFCheckBox) return { kind: 'checkbox', name, label, value: field.isChecked() };
  if (field instanceof PDFRadioGroup) {
    const value = field.getSelected() ?? '';
    return { kind: 'choice', name, label, value, options: choiceOptions(field.getOptions(), value) };
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const value = field.getSelected()[0] ?? '';
    return { kind: 'choice', name, label, value, options: choiceOptions(field.getOptions(), value) };
  }
  return null;
}

// The fields the student can fill in, in the form's order. An empty list: no form (say so).
export async function readPdfForm(uri: string): Promise<FormField[]> {
  const pdfDoc = await loadPdf(uri);
  return pdfDoc
    .getForm()
    .getFields()
    .map(toFormField)
    .filter((f): f is FormField => f !== null);
}

const DEFAULT_FIELD_SIZE = 11;
const FIELD_PAD = 2;

function fontSizeOf(da: string | undefined): number | undefined {
  const m = da?.match(/(\d+(?:\.\d+)?)\s+Tf/);
  const size = m ? Number(m[1]) : NaN;
  return size > 0 ? size : undefined;
}

// A text or choice field's appearance drawn by textAppearance (for text Helvetica can't encode):
// one widget at a time, clipped to its box. Auto size (0 in /DA) fits the box's height.
function shapedFieldAppearance(pdfDoc: PDFDocument, field: PDFField, text: string, multiline: boolean) {
  const ctx = pdfDoc.context;
  const helv = helveticaFontDict(pdfDoc);
  for (const widget of field.acroField.getWidgets()) {
    const { width, height } = widget.getRectangle();
    const fieldSize = fontSizeOf(widget.getDefaultAppearance() ?? field.acroField.getDefaultAppearance());
    const lines = multiline ? text.split('\n') : [text.replace(/\n/g, ' ')];
    const size = fieldSize ?? Math.max(4, Math.min(multiline ? DEFAULT_FIELD_SIZE : (height - 2 * FIELD_PAD) / LINE_HEIGHT, DEFAULT_FIELD_SIZE * 1.4));
    const look = textLinesAppearance(pdfDoc, lines, { sizePt: size, color: [0, 0, 0], left: FIELD_PAD, helv });
    // A single line sits in the middle of the box (its baseline 0.3 em below the middle); several
    // start at the top.
    const top = multiline ? height - FIELD_PAD : height / 2 + size * (ASCENT - 0.3);
    const content = `/Tx BMC q 0 0 ${width} ${height} re W n 1 0 0 1 0 ${top} cm\n${look.content}\nQ EMC`;
    const ref = ctx.register(ctx.stream(content, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, width, height], Resources: look.resources }));
    widget.setNormalAppearance(ref);
  }
  pdfDoc.getForm().markFieldAsClean(field.ref);
}

function setField(pdfDoc: PDFDocument, field: PDFField, value: string | boolean, font: PDFFont) {
  if (field instanceof PDFTextField) {
    const max = field.getMaxLength();
    const text = String(value);
    const kept = max !== undefined ? [...text].slice(0, max).join('') : text;
    field.setText(kept || undefined);
    try {
      field.updateAppearances(font);
    } catch {
      // Helvetica can't encode it (another script).
      shapedFieldAppearance(pdfDoc, field, kept, field.isMultiline());
    }
  } else if (field instanceof PDFCheckBox) {
    if (value === true) field.check();
    else field.uncheck();
    field.updateAppearances();
  } else if (field instanceof PDFRadioGroup) {
    const v = String(value);
    if (v && field.getOptions().includes(v)) field.select(v);
    else field.clear();
    field.updateAppearances();
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const v = String(value);
    if (v) field.select(v);
    else field.clear();
    try {
      field.updateAppearances(font);
    } catch {
      shapedFieldAppearance(pdfDoc, field, v, false);
    }
  }
}

// Our marks in the copy (Mark mode's annotations, written into a library PDF) become plain PDF
// annotations: the copy is a new document with no marks of its own, so a Mark session there would
// otherwise remove them as "ours".
function releaseOurAnnotations(pdfDoc: PDFDocument) {
  for (const page of pdfDoc.getPages()) {
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const dict = ref instanceof PDFRef ? pdfDoc.context.lookup(ref) : ref;
      if (!(dict instanceof PDFDict)) continue;
      if (decoded(dict.get(PDFName.of('NM')))?.startsWith(NM_PREFIX)) dict.delete(PDFName.of('NM'));
    }
  }
}

// The filled form's bytes. Pure apart from pdf-lib, for the tests.
export async function fillPdfForm(bytes: Uint8Array, values: FormValues, opts: { flatten: boolean }): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  for (const field of form.getFields()) {
    const value = values[field.getName()];
    if (value === undefined || field.isReadOnly()) continue;
    setField(pdfDoc, field, value, font);
  }
  releaseOurAnnotations(pdfDoc);
  // Appearances are already drawn (above), so pdf-lib mustn't redraw them in Helvetica.
  if (opts.flatten) form.flatten({ updateFieldAppearances: false });
  return pdfDoc.save({ updateFieldAppearances: false });
}

export function filledCopyName(name: string): string {
  return t('reader.form.copyName', { name: name.replace(/\.pdf$/i, '') });
}

// Fills the form into a new library document, from a temp file (`cache/edit/`, deleted after). A
// library document's copy stays in its course, with its type. The original is never written.
export async function saveFilledForm(target: FormTarget, values: FormValues, opts: { flatten: boolean }): Promise<LibraryDocument> {
  const source = formSourceFor(target);
  if (!source) throw new Error('The document has no PDF');
  const file = new File(source.uri);
  if ((file.size ?? 0) > PDF_FORM_MAX_BYTES) throw new PreviewTooLargeError('PDF form');
  const out = await fillPdfForm(await file.bytes(), values, opts);
  const temp = new File(Paths.cache, 'edit', `${createId('form')}.pdf`);
  try {
    temp.write(out);
    const pageCount = target.doc ? target.doc.pages.length : target.external.pageCount;
    const doc = addPdfFileToLibrary(temp.uri, filledCopyName(source.name), pageCount);
    return target.doc ? { ...doc, courseId: target.doc.courseId, docType: target.doc.docType } : doc;
  } finally {
    if (temp.exists) temp.delete();
  }
}
