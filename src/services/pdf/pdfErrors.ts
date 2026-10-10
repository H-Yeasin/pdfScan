// The PDF needs a password (or is encrypted in a way the app can't edit). Thrown by the native
// reader (pdfNative.ts) and by the pdf-lib page tools (pdfOps.ts) alike, so callers check one
// type. The file itself is kept and still opens in the Reader's password prompt.
export class PdfEncryptedError extends Error {
  constructor() {
    super('The PDF is password-protected');
    this.name = 'PdfEncryptedError';
  }
}

// §18 W7: a password was given and it doesn't open the PDF. It is still an encrypted PDF, so code
// that only asks "does this need a password?" keeps working.
export class PdfWrongPasswordError extends PdfEncryptedError {
  constructor() {
    super();
    this.message = "That password doesn't open the PDF";
    this.name = 'PdfWrongPasswordError';
  }
}
