import { classifyPdfError } from '../../../../services/documents/readerPosition';
import { PdfEncryptedError, PdfWrongPasswordError } from '../../../../services/pdf/pdfNative';
import { sessionErrorMessage } from '../usePdfSession';

// The Reader's password prompt reads these messages (readerPosition.classifyPdfError), the same
// way it reads pdf-jsi's.
describe('sessionErrorMessage', () => {
  it('reads as a password problem for a locked file and for a wrong password', () => {
    expect(classifyPdfError(sessionErrorMessage(new PdfEncryptedError()))).toBe('password');
    expect(classifyPdfError(sessionErrorMessage(new PdfWrongPasswordError()))).toBe('password');
  });

  it('reads as a damaged file for anything else, even with no message', () => {
    expect(classifyPdfError(sessionErrorMessage(new Error('READ_FAILED')))).toBe('damaged');
    expect(classifyPdfError(sessionErrorMessage(new Error('')))).toBe('damaged');
    expect(classifyPdfError(sessionErrorMessage(undefined))).toBe('damaged');
    // A read error that happens to mention a password is still not one.
    expect(classifyPdfError(sessionErrorMessage(new Error('no password table')))).toBe('damaged');
  });
});
