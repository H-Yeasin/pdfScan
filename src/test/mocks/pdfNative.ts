import { File, Paths } from 'expo-file-system';

// Stands in for modules/pdf-native (§7 R1). By default every PDF has one blank 612 × 792 pt page;
// tests set what they need with mockImplementation / mockResolvedValue. renderPage writes a real
// (tiny, fake) JPEG into the mocked cache, so callers can move or delete it like the real one.
let renderCount = 0;

const PdfNative = {
  getPageCount: jest.fn(async (_uri: string) => 1),
  getPageSize: jest.fn(async (_uri: string, _page: number) => ({ width: 612, height: 792 })),
  renderPage: jest.fn(async (_uri: string, page: number, options: { maxDim: number; quality: number }) => {
    renderCount += 1;
    const file = new File(Paths.cache, 'pdf-native', `render_${renderCount}.jpg`);
    file.write(`jpeg page ${page} @${options.maxDim}`);
    return { uri: file.uri, width: Math.round((612 * options.maxDim) / 792), height: options.maxDim };
  }),
  getPageText: jest.fn(async (_uri: string, _page: number) => ({
    width: 612,
    height: 792,
    text: '',
    words: [] as { text: string; left: number; top: number; width: number; height: number }[],
  })),
};

export default PdfNative;
