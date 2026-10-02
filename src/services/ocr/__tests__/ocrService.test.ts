import MlkitOcr from 'rn-mlkit-ocr';
import { runOcr } from '../ocrService';

const recognizeText = MlkitOcr.recognizeText as jest.Mock;

beforeEach(() => recognizeText.mockClear());

describe('runOcr', () => {
  it("passes the registry entry's ML Kit model", async () => {
    await runOcr('file:///page.jpg', 'chinese');
    expect(recognizeText).toHaveBeenCalledWith('file:///page.jpg', 'chinese');
  });

  it('gives no OCR for a planned script instead of reaching ML Kit', async () => {
    expect(await runOcr('file:///page.jpg', 'bengali')).toBeUndefined();
    expect(recognizeText).not.toHaveBeenCalled();
  });
});
