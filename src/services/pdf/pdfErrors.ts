// The PDF needs a password (or is encrypted in a way the app can't edit). Thrown by the native
// reader (pdfNative.ts) and by the pdf-lib page tools (pdfOps.ts) alike, so callers check one
// type. The file itself is kept and still opens in the Reader's password prompt.
export class PdfEncryptedError extends Error {
  constructor() {
    super('The PDF is password-protected');
    this.name = 'PdfEncryptedError';
  }
}
