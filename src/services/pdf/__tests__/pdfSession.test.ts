import { File, Paths } from 'expo-file-system';
import PdfNative from '../../../../modules/pdf-native';
import { PdfEncryptedError, PdfWrongPasswordError } from '../pdfErrors';
import {
  getPageCount,
  hasPdfSessions,
  openDocument,
  PdfNativeUnavailableError,
  PdfOutOfRangeError,
  pdfNativeVersion,
  PdfSessionClosedError,
  renderPageImage,
} from '../pdfNative';
import { acquirePdfSession, openPdfSessionCount } from '../pdfSession';

const native = PdfNative as unknown as {
  nativeVersion?: jest.Mock;
  getPageCount: jest.Mock;
  openDocument: jest.Mock;
  closeDocument: jest.Mock;
  renderPageImage: jest.Mock;
  getSessionPageText: jest.Mock;
};

function coded(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

// closeDocument runs a promise turn after release().
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const image = (name: string) => ({
  width: 108,
  height: 140,
  annotations: true,
  quality: 0.8,
  out: new File(Paths.cache, 'reader', name).uri,
});

beforeEach(() => {
  native.openDocument.mockClear();
  native.closeDocument.mockClear();
  native.renderPageImage.mockClear();
});

describe('pdfNative version 2 (§18 W7)', () => {
  it('reads the native version and treats a build without it as version 1', async () => {
    expect(pdfNativeVersion()).toBe(2);
    expect(hasPdfSessions()).toBe(true);
    const nativeVersion = native.nativeVersion;
    delete native.nativeVersion;
    try {
      expect(pdfNativeVersion()).toBe(1);
      expect(hasPdfSessions()).toBe(false);
      // The session calls refuse before they reach a function the build doesn't have…
      await expect(openDocument('file:///a.pdf')).rejects.toBeInstanceOf(PdfNativeUnavailableError);
      expect(native.openDocument).not.toHaveBeenCalled();
      // …and the version 1 calls still work.
      await expect(getPageCount('file:///a.pdf')).resolves.toBe(1);
    } finally {
      native.nativeVersion = nativeVersion;
    }
  });

  it('maps native error codes to typed errors', async () => {
    native.openDocument.mockRejectedValueOnce(coded('ENCRYPTED'));
    const encrypted = await openDocument('file:///a.pdf').catch((e: unknown) => e);
    expect(encrypted).toBeInstanceOf(PdfEncryptedError);
    expect(encrypted).not.toBeInstanceOf(PdfWrongPasswordError);

    native.openDocument.mockRejectedValueOnce(coded('PASSWORD_WRONG'));
    const wrong = await openDocument('file:///a.pdf', 'nope').catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(PdfWrongPasswordError);
    // Still "this PDF needs a password" for code that only asks that.
    expect(wrong).toBeInstanceOf(PdfEncryptedError);

    native.renderPageImage.mockRejectedValueOnce(coded('SESSION_CLOSED'));
    await expect(renderPageImage('gone', 0, image('a.jpg'))).rejects.toBeInstanceOf(PdfSessionClosedError);

    native.renderPageImage.mockRejectedValueOnce(coded('OUT_OF_RANGE', 'Page 9 is out of range (0..0)'));
    const range = await renderPageImage('session-1', 9, image('a.jpg')).catch((e: unknown) => e);
    expect(range).toBeInstanceOf(PdfOutOfRangeError);
    expect((range as Error).message).toContain('Page 9');

    const other = coded('READ_FAILED', 'Not a readable PDF');
    native.openDocument.mockRejectedValueOnce(other);
    await expect(openDocument('file:///a.pdf')).rejects.toBe(other);
  });

  it('sends no password as null, not as an empty string', async () => {
    await openDocument('file:///a.pdf', '');
    expect(native.openDocument).toHaveBeenLastCalledWith('file:///a.pdf', null);
  });
});

describe('pdfSession (§18 W7)', () => {
  it('opens a file once for two users and closes it on the last release', async () => {
    const [a, b] = await Promise.all([acquirePdfSession('file:///two.pdf'), acquirePdfSession('file:///two.pdf')]);
    expect(native.openDocument).toHaveBeenCalledTimes(1);
    expect(a.pageCount).toBe(1);
    expect(b.pages).toEqual([{ width: 612, height: 792 }]);
    expect(openPdfSessionCount()).toBe(1);

    a.release();
    a.release(); // a second release must not take b's reference
    await settle();
    expect(native.closeDocument).not.toHaveBeenCalled();
    const rendered = await b.renderPage(0, image('two.jpg'));
    expect(new File(rendered.uri).exists).toBe(true);

    b.release();
    await settle();
    expect(native.closeDocument).toHaveBeenCalledTimes(1);
    const id = (await native.openDocument.mock.results[0].value).id;
    expect(native.closeDocument).toHaveBeenCalledWith(id);
    expect(openPdfSessionCount()).toBe(0);

    // Acquired again after the close: a new native open.
    const c = await acquirePdfSession('file:///two.pdf');
    expect(native.openDocument).toHaveBeenCalledTimes(2);
    c.release();
    await settle();
  });

  it('refuses work after release', async () => {
    const session = await acquirePdfSession('file:///released.pdf');
    session.release();
    await expect(session.pageText(0)).rejects.toThrow('after release');
    await settle();
  });

  it('opens again, once, when native code has closed the session', async () => {
    const session = await acquirePdfSession('file:///idle.pdf', 'secret');
    const firstId = (await native.openDocument.mock.results[0].value).id;
    const realRender = native.renderPageImage.getMockImplementation();
    native.renderPageImage.mockImplementation(async (id: string, _page: number, options: { out: string; width: number; height: number }) => {
      if (id === firstId) throw coded('SESSION_CLOSED');
      return { uri: options.out, width: options.width, height: options.height };
    });
    try {
      // Two renders find the session closed at the same time.
      const [a, b] = await Promise.all([session.renderPage(0, image('idle-a.jpg')), session.renderPage(0, image('idle-b.jpg'))]);
      expect(a.width).toBe(108);
      expect(b.width).toBe(108);
      expect(native.openDocument).toHaveBeenCalledTimes(2);
      // The reopen uses the password the session was opened with.
      expect(native.openDocument).toHaveBeenLastCalledWith('file:///idle.pdf', 'secret');

      session.release();
      await settle();
      // The document that is open now is the one that gets closed.
      const secondId = (await native.openDocument.mock.results[1].value).id;
      expect(native.closeDocument).toHaveBeenCalledWith(secondId);
    } finally {
      native.renderPageImage.mockImplementation(realRender);
    }
  });

  it('does not keep a failed open, and keeps passwords apart', async () => {
    native.openDocument.mockRejectedValueOnce(coded('ENCRYPTED'));
    await expect(acquirePdfSession('file:///locked.pdf')).rejects.toBeInstanceOf(PdfEncryptedError);
    expect(openPdfSessionCount()).toBe(0);

    native.openDocument.mockRejectedValueOnce(coded('PASSWORD_WRONG'));
    await expect(acquirePdfSession('file:///locked.pdf', 'wrong')).rejects.toBeInstanceOf(PdfWrongPasswordError);
    expect(openPdfSessionCount()).toBe(0);

    const session = await acquirePdfSession('file:///locked.pdf', 'right');
    expect(native.openDocument).toHaveBeenCalledTimes(3);
    expect(native.openDocument).toHaveBeenLastCalledWith('file:///locked.pdf', 'right');
    session.release();
    await settle();
    // Nothing was opened by the two failures, so only one close.
    expect(native.closeDocument).toHaveBeenCalledTimes(1);
  });
});
