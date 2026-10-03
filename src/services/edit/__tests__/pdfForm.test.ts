import { Directory, File, Paths } from 'expo-file-system';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { makeDoc } from '../../../test/fixtures';
import type { ExternalFileDocument } from '../../../types/models';
import { PreviewTooLargeError } from '../../documents/sheetService';
import { NM_PREFIX } from '../../annotations/pdfAnnotations';
import { setTextRaster } from '../../pdf/textAppearance';
import { fieldLabel, fillPdfForm, PDF_FORM_MAX_BYTES, PdfFormLockedError, readPdfForm, saveFilledForm } from '../pdfForm';

// §12 D10: filling in a PDF form. The fixture is a class worksheet's cover form: a name, a
// multi-line answer, a checkbox, a radio group, a dropdown, a read-only field and a button.
async function worksheetForm(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const form = pdfDoc.getForm();
  const name = form.createTextField('student.name');
  name.setMaxLength(20);
  name.addToPage(page, { x: 50, y: 760, width: 300, height: 24 });
  name.acroField.dict.set(PDFName.of('TU'), PDFString.of('Student name'));
  const answer = form.createTextField('answer_1');
  answer.enableMultiline();
  answer.addToPage(page, { x: 50, y: 600, width: 400, height: 120 });
  form.createCheckBox('agree').addToPage(page, { x: 50, y: 560, width: 16, height: 16 });
  const section = form.createRadioGroup('section');
  section.addOptionToPage('A', page, { x: 50, y: 520, width: 16, height: 16 });
  section.addOptionToPage('B', page, { x: 90, y: 520, width: 16, height: 16 });
  const course = form.createDropdown('course');
  course.addOptions(['PHY 101', 'CHE 102']);
  course.addToPage(page, { x: 50, y: 480, width: 200, height: 24 });
  const school = form.createTextField('school');
  school.setText('Dhaka College');
  school.enableReadOnly();
  school.addToPage(page, { x: 50, y: 440, width: 200, height: 24 });
  form.createButton('print').addToPage('Print', page, { x: 50, y: 400, width: 80, height: 24 });
  return pdfDoc.save();
}

function writeFile(name: string, bytes: Uint8Array): File {
  const file = new File(Paths.cache, 'pdf-form-test', name);
  file.write(bytes);
  return file;
}

function widgetContent(pdfDoc: PDFDocument, fieldName: string): { content: string; resources: PDFDict | undefined } {
  const widget = pdfDoc.getForm().getField(fieldName).acroField.getWidgets()[0];
  const normal = widget.getAppearances()?.normal;
  const stream = normal as PDFRawStream;
  return { content: new TextDecoder().decode(decodePDFRawStream(stream).decode()), resources: stream.dict.lookup(PDFName.of('Resources')) as PDFDict | undefined };
}

describe('§12 D10 reading a PDF form', () => {
  it('lists the fields a student can fill in, in order, with readable labels', async () => {
    const fields = await readPdfForm(writeFile('read.pdf', await worksheetForm()).uri);
    expect(fields).toEqual([
      { kind: 'text', name: 'student.name', label: 'Student name', value: '', multiline: false, maxLength: 20 },
      { kind: 'text', name: 'answer_1', label: 'answer 1', value: '', multiline: true, maxLength: undefined },
      { kind: 'checkbox', name: 'agree', label: 'agree', value: false },
      { kind: 'choice', name: 'section', label: 'section', value: '', options: ['A', 'B'] },
      { kind: 'choice', name: 'course', label: 'course', value: '', options: ['PHY 101', 'CHE 102'] },
    ]);
  });

  it('says a PDF has no form, and refuses one that needs a password or is too large', async () => {
    const plain = await PDFDocument.create();
    plain.addPage();
    expect(await readPdfForm(writeFile('plain.pdf', await plain.save()).uri)).toEqual([]);

    const locked = await PDFDocument.create();
    locked.addPage();
    locked.context.trailerInfo.Encrypt = locked.context.obj({ Filter: 'Standard' });
    await expect(readPdfForm(writeFile('locked.pdf', await locked.save()).uri)).rejects.toBeInstanceOf(PdfFormLockedError);

    await expect(readPdfForm(writeFile('big.pdf', new Uint8Array(PDF_FORM_MAX_BYTES + 1)).uri)).rejects.toBeInstanceOf(PreviewTooLargeError);
  });

  it('labels a field by its tooltip, else the last part of its name', () => {
    expect(fieldLabel('form1[0].page1[0].Student_name[0]')).toBe('Student name');
    expect(fieldLabel('x.y', '  Roll number ')).toBe('Roll number');
    expect(fieldLabel('[0]')).toBe('[0]');
  });
});

describe('§12 D10 filling in a PDF form', () => {
  it('fills every kind of field and keeps the form fillable', async () => {
    const out = await fillPdfForm(
      await worksheetForm(),
      { 'student.name': 'Asha Rahman, a very long name', answer_1: 'Line one\nLine two', agree: true, section: 'B', course: 'CHE 102', school: 'Changed' },
      { flatten: false }
    );
    const pdfDoc = await PDFDocument.load(out);
    const form = pdfDoc.getForm();
    // Kept to the field's 20 characters.
    expect(form.getTextField('student.name').getText()).toBe('Asha Rahman, a very ');
    expect(form.getTextField('answer_1').getText()).toBe('Line one\nLine two');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getRadioGroup('section').getSelected()).toBe('B');
    expect(form.getDropdown('course').getSelected()).toEqual(['CHE 102']);
    // A read-only field is left alone.
    expect(form.getTextField('school').getText()).toBe('Dhaka College');
    // The appearance shows the answer (Helvetica).
    expect(widgetContent(pdfDoc, 'student.name').content).toContain('Tj');
  });

  it('flattens: the answers stay on the page and the fields are gone', async () => {
    const out = await fillPdfForm(await worksheetForm(), { 'student.name': 'Asha', agree: true }, { flatten: true });
    const pdfDoc = await PDFDocument.load(out);
    expect(pdfDoc.getForm().getFields()).toHaveLength(0);
    // The page draws the flattened fields' appearances as form XObjects.
    const xobjects = pdfDoc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject')) as PDFDict | undefined;
    expect(xobjects?.keys().length).toBeGreaterThanOrEqual(2);
  });

  it('draws another script with shaped images, so it shows without a font and survives flattening', async () => {
    const undo = setTextRaster((_text, size, px) => {
      const width = Math.ceil(size * px * 3);
      const height = Math.ceil(size * px);
      return { width, height, alpha: new Uint8Array(width * height).fill(200), run: { width: width / px, ascent: (height * 0.8) / px, descent: (height * 0.2) / px } };
    });
    try {
      const out = await fillPdfForm(await worksheetForm(), { 'student.name': 'আশা রহমান' }, { flatten: false });
      const pdfDoc = await PDFDocument.load(out);
      expect(pdfDoc.getForm().getTextField('student.name').getText()).toBe('আশা রহমান');
      const { content, resources } = widgetContent(pdfDoc, 'student.name');
      expect(content).toContain('/Tx0 Do');
      expect(resources?.lookup(PDFName.of('XObject'))).toBeInstanceOf(PDFDict);
      // Flattening doesn't try to redraw it in Helvetica (which would throw).
      await expect(fillPdfForm(await worksheetForm(), { 'student.name': 'আশা' }, { flatten: true })).resolves.toBeInstanceOf(Uint8Array);
    } finally {
      undo();
    }
  });

  it("releases the app's own marks in the copy, so they stay as plain annotations", async () => {
    const pdfDoc = await PDFDocument.load(await worksheetForm());
    const page = pdfDoc.getPage(0);
    const annot = pdfDoc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10] });
    annot.set(PDFName.of('NM'), PDFString.of(`${NM_PREFIX}a1`));
    page.node.addAnnot(pdfDoc.context.register(annot));
    const out = await PDFDocument.load(await fillPdfForm(await pdfDoc.save(), {}, { flatten: false }));
    const names = out
      .getPage(0)
      .node.Annots()!
      .asArray()
      .map((ref) => (out.context.lookup(ref) as PDFDict).get(PDFName.of('NM')));
    expect(names.filter((n) => n !== undefined)).toEqual([]);
    // The form's eight widgets and the mark.
    expect(names).toHaveLength(9);
  });
});

describe('§12 D10 saving the filled form', () => {
  it("is a new library document; the library PDF isn't touched and its course and type carry", async () => {
    const original = await worksheetForm();
    const file = writeFile('library.pdf', original);
    const doc = makeDoc({ id: 'doc_form', name: 'Lab cover', sourceKind: 'imported_pdf', pdfUri: file.uri, pdfLayout: 'standard', courseId: 'c1', docType: 'assignment' });
    const copy = await saveFilledForm({ doc }, { 'student.name': 'Asha' }, { flatten: true });
    expect(copy.id).not.toBe(doc.id);
    expect(copy.name).toBe('Lab cover (filled)');
    expect(copy).toMatchObject({ format: 'PDF', sourceKind: 'imported_pdf', courseId: 'c1', docType: 'assignment' });
    expect(copy.pages).toHaveLength(doc.pages.length);
    expect(await new File(file.uri).bytes()).toEqual(original);
    expect((await PDFDocument.load(await new File(copy.pdfUri!).bytes())).getForm().getFields()).toHaveLength(0);
    // The temp file is gone.
    expect(new Directory(Paths.cache, 'edit').list()).toEqual([]);
  });

  it('saves a file from outside into the library and never writes it', async () => {
    const original = await worksheetForm();
    const file = writeFile('outside.pdf', original);
    const external: ExternalFileDocument = { uri: file.uri, name: 'Form.pdf', format: 'PDF', sizeBytes: original.length, sourceUri: file.uri, importedAt: 1, pageCount: 1 };
    const copy = await saveFilledForm({ external }, { agree: true }, { flatten: false });
    expect(copy.name).toBe('Form (filled)');
    expect(copy.courseId).toBeUndefined();
    expect(await new File(file.uri).bytes()).toEqual(original);
    expect((await PDFDocument.load(await new File(copy.pdfUri!).bytes())).getForm().getCheckBox('agree').isChecked()).toBe(true);
  });
});
