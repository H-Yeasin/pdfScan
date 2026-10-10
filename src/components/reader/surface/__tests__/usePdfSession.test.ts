import { classifyNativePdfError } from '../../../../services/documents/readerPosition';
import { PdfEncryptedError, PdfWrongPasswordError } from '../../../../services/pdf/pdfNative';
import { sessionErrorCode } from '../usePdfSession';

// The Reader's password prompt reads these codes (readerPosition.classifyNativePdfError).
describe('sessionErrorCode', () => {
  it('reads as a password problem for a locked file and for a wrong password', () => {
    expect(classifyNativePdfError(sessionErrorCode(new PdfEncryptedError()))).toBe('password');
    expect(classifyNativePdfError(sessionErrorCode(new PdfWrongPasswordError()))).toBe('password');
  });

  it('reads as a damaged file for anything else, even with no message', () => {
    expect(classifyNativePdfError(sessionErrorCode(new Error('READ_FAILED')))).toBe('damaged');
    expect(classifyNativePdfError(sessionErrorCode(new Error('')))).toBe('damaged');
    expect(classifyNativePdfError(sessionErrorCode(undefined))).toBe('damaged');
    // A read error that happens to mention a password is still not one.
    expect(classifyNativePdfError(sessionErrorCode(new Error('no password table')))).toBe('damaged');
  });
});
