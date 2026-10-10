import { makeDoc } from '../../../test/fixtures';
import { canFindInDoc, canSign, canSubmit, canUsePageTools, hasPageMasters, isPasswordProtected, isPdfLevel } from '../formatCapabilities';

describe('page tools by kind of document (§7 R2)', () => {
  const scan = makeDoc();
  const imported = makeDoc({ sourceKind: 'imported_pdf', pages: [{ id: 'p', fileUri: '', width: 850, height: 1100 }] });
  const locked = { ...imported, indexState: 'encrypted' as const };
  const docx = makeDoc({ format: 'DOCX', pages: [] });

  it('lets imported PDFs be merged, split, compressed, signed and submitted', () => {
    expect(isPdfLevel(imported)).toBe(true);
    expect(canUsePageTools(imported)).toBe(true);
    // The jest mock stands in for modules/pdf-native, so it counts as present.
    expect(canSign(imported)).toBe(true);
    expect(canSubmit(imported)).toBe(true);
  });

  it('keeps text and annotation tools to pages with masters', () => {
    expect(hasPageMasters(scan)).toBe(true);
    expect(hasPageMasters(imported)).toBe(false);
  });

  it('turns everything off for a password-protected PDF', () => {
    expect(isPasswordProtected(locked)).toBe(true);
    expect([canUsePageTools(locked), canSign(locked), canSubmit(locked)]).toEqual([false, false, false]);
  });

  it('leaves other formats alone', () => {
    expect([canUsePageTools(docx), canSign(docx), hasPageMasters(docx)]).toEqual([false, false, false]);
  });
});

describe('Find in the Reader (§12 D11)', () => {
  it('covers every openable format', () => {
    for (const format of ['PDF', 'TXT', 'CSV', 'XLSX', 'XLS', 'DOCX'] as const) expect(canFindInDoc(format)).toBe(true);
    expect(canFindInDoc('DOC')).toBe(false);
  });

  // §18 W2: its document.pdf has the OCR text layer, the same as a PDF-format scan's.
  it('covers a JPG-format scan', () => {
    expect(canFindInDoc('JPG')).toBe(true);
  });
});
