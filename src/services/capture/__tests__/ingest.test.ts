import { File, Paths } from 'expo-file-system';
import { downscaleAndCompressPage } from '../../enhance/enhanceService';
import { runOcr } from '../../ocr/ocrService';
import { ingestPage } from '../ingest';

jest.mock('../../enhance/enhanceService', () => ({
  downscaleAndCompressPage: jest.fn(async (uri: string, maxDim: number) => ({
    uri: `${uri}.${maxDim}.jpg`,
    width: maxDim,
    height: Math.round(maxDim * 0.75),
  })),
}));
jest.mock('../../ocr/ocrService', () => ({ runOcr: jest.fn(async () => ({ text: 'Lab report', blocks: [] })) }));

describe('ingestPage', () => {
  it('downscales to the master spec, makes a thumbnail and OCRs the master', async () => {
    const page = await ingestPage('file:///gallery/IMG_1.HEIC', 'latin');

    expect(downscaleAndCompressPage).toHaveBeenNthCalledWith(1, 'file:///gallery/IMG_1.HEIC', 2400, 0.92);
    expect(downscaleAndCompressPage).toHaveBeenNthCalledWith(2, 'file:///gallery/IMG_1.HEIC.2400.jpg', 400, 0.7);
    expect(runOcr).toHaveBeenCalledWith('file:///gallery/IMG_1.HEIC.2400.jpg', 'latin');
    expect(page).toMatchObject({
      uri: 'file:///gallery/IMG_1.HEIC.2400.jpg',
      thumbUri: 'file:///gallery/IMG_1.HEIC.2400.jpg.400.jpg',
      width: 2400,
      height: 1800,
      rotation: 0,
      enhance: 'auto',
      ocr: { text: 'Lab report', blocks: [] },
    });
  });

  it("starts the page with the capture mode's default filter", async () => {
    const page = await ingestPage('file:///scan/1.jpg', 'latin', { enhance: 'document_scan' });
    expect(page.enhance).toBe('document_scan');
  });

  it('deletes the raw capture only when asked to', async () => {
    const raw = new File(Paths.cache, 'raw_scan.jpg');
    raw.write('raw');
    await ingestPage(raw.uri, 'latin');
    expect(raw.exists).toBe(true);
    await ingestPage(raw.uri, 'latin', { deleteSource: true });
    expect(raw.exists).toBe(false);
  });
});
