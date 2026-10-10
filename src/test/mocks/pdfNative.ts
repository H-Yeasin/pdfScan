import { File, Paths } from 'expo-file-system';
import { makeJpeg } from '../jpeg';

// Stands in for modules/pdf-native (§7 R1). By default every PDF has one blank 612 × 792 pt page;
// tests set what they need with mockImplementation / mockResolvedValue. renderPage writes a
// JPEG-shaped file (test/jpeg.ts) into the mocked cache, so callers can embed, move or delete it
// like the real one; its size grows with maxDim and quality, roughly like a real render's.
//
// §18 W7 (version 2): `openDocument` hands out ids `session-1`, `session-2`, …; every session is
// the same one-page document. renderPageImage and decodeImage write a JPEG-shaped file at
// `options.out`.
let renderCount = 0;
let sessionCount = 0;

type ImageOptions = { width: number; height: number; quality: number; out: string };

function writeImage(options: ImageOptions) {
  const file = new File(options.out);
  if (!file.parentDirectory.exists) file.parentDirectory.create({ intermediates: true });
  file.write(makeJpeg(options.width, options.height, Math.round((options.width * options.height * options.quality) / 40)));
  return { uri: file.uri, width: options.width, height: options.height };
}

const PdfNative = {
  getPageCount: jest.fn(async (_uri: string) => 1),
  getPageSize: jest.fn(async (_uri: string, _page: number) => ({ width: 612, height: 792 })),
  renderPage: jest.fn(async (_uri: string, page: number, options: { maxDim: number; quality: number }) => {
    renderCount += 1;
    const file = new File(Paths.cache, 'pdf-native', `render_${renderCount}.jpg`);
    const width = Math.round((612 * options.maxDim) / 792);
    const height = options.maxDim;
    file.write(makeJpeg(width, height, Math.round((width * height * options.quality) / 40) + page));
    return { uri: file.uri, width, height };
  }),
  getPageText: jest.fn(async (_uri: string, _page: number) => ({
    width: 612,
    height: 792,
    text: '',
    words: [] as { text: string; left: number; top: number; width: number; height: number }[],
  })),

  nativeVersion: jest.fn(() => 2),
  openDocument: jest.fn(async (_uri: string, _password?: string | null) => {
    sessionCount += 1;
    return { id: `session-${sessionCount}`, pageCount: 1, pages: [{ width: 612, height: 792 }], hasOutline: false };
  }),
  closeDocument: jest.fn(async (_id: string) => undefined),
  renderPageImage: jest.fn(async (_id: string, _page: number, options: ImageOptions) => writeImage(options)),
  decodeImage: jest.fn(async (_uri: string, options: ImageOptions) => writeImage(options)),
  getSessionPageText: jest.fn(async (_id: string, _page: number) => ({
    width: 612,
    height: 792,
    text: '',
    words: [] as { text: string; left: number; top: number; width: number; height: number }[],
  })),
  getPageLinks: jest.fn(
    async (_id: string, _page: number) =>
      [] as { left: number; top: number; width: number; height: number; uri?: string; page?: number }[]
  ),
  getOutline: jest.fn(async (_id: string) => [] as { title: string; page?: number; children: unknown[] }[]),
};

export default PdfNative;
