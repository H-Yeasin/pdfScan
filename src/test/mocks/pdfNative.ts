import { File, Paths } from 'expo-file-system';
import { makeJpeg } from '../jpeg';

// Stands in for modules/pdf-native (§7 R1). By default every PDF has one blank 612 × 792 pt page;
// tests set what they need with mockImplementation / mockResolvedValue. renderPage writes a
// JPEG-shaped file (test/jpeg.ts) into the mocked cache, so callers can embed, move or delete it
// like the real one; its size grows with maxDim and quality, roughly like a real render's.
let renderCount = 0;

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
};

export default PdfNative;
