import { captureReducer, initialCaptureState } from '../../../store/slices/captureSlice';
import type { SessionPage } from '../../../types/models';
import { warpPerspectiveCrop } from '../../enhance/perspectiveCrop';
import { splitSpread } from '../../enhance/splitSpread';
import { getCaptureModeSpec } from '../captureModes';
import { ingestGalleryBatch, ingestOne } from '../ingestBatch';
import { detectDocumentQuad } from '../quadDetector';
import type { Quad } from '../quadGeometry';

jest.mock('../quadDetector', () => ({ detectDocumentQuad: jest.fn() }));
jest.mock('../../enhance/perspectiveCrop', () => ({
  warpPerspectiveCrop: jest.fn(async (uri: string) => ({ uri: `${uri}.cropped`, width: 1700, height: 2200 })),
}));
jest.mock('../../enhance/splitSpread', () => ({ splitSpread: jest.fn(async () => null) }));
jest.mock('../../ocr/ocrService', () => ({ runOcr: jest.fn(async () => ({ text: 'ocr', blocks: [] })) }));
jest.mock('../ingest', () => {
  const page = (uri: string, w: number, h: number, enhance?: string) => ({
    id: `p_${uri}`,
    uri,
    thumbUri: `${uri}.thumb`,
    width: w,
    height: h,
    rotation: 0,
    enhance: enhance ?? 'auto',
  });
  return {
    ingestPage: jest.fn(async (uri: string, _s: string, o: { enhance?: string }) => page(`${uri}.master`, 3000, 2000, o.enhance)),
    pageFromMaster: jest.fn(async (m: { uri: string; width: number; height: number }, _s: string, o: { enhance?: string }) =>
      page(m.uri, m.width, m.height, o.enhance)
    ),
  };
});

const quad: Quad = [
  { x: 100, y: 80 },
  { x: 2900, y: 100 },
  { x: 2950, y: 1900 },
  { x: 60, y: 1880 },
];
const gallery = { script: 'latin' as const, spec: getCaptureModeSpec('doc'), ownsInputs: false, autoCrop: true };

beforeEach(() => jest.clearAllMocks());

describe('gallery auto-crop', () => {
  it('warps a confidently detected page and OCRs the cropped master', async () => {
    jest.mocked(detectDocumentQuad).mockResolvedValue({ quad, confidence: 'high' });
    const [page] = await ingestOne('IMG_1.jpg', gallery);
    expect(warpPerspectiveCrop).toHaveBeenCalledWith('IMG_1.jpg.master', quad);
    expect(page).toMatchObject({ uri: 'IMG_1.jpg.master.cropped', width: 1700, height: 2200, ocr: { text: 'ocr' } });
    expect(page.needsCropReview).toBeUndefined();
  });

  it('only suggests a doubtful outline, flagging the page for review', async () => {
    jest.mocked(detectDocumentQuad).mockResolvedValue({ quad, confidence: 'low' });
    const [page] = await ingestOne('IMG_2.jpg', gallery);
    expect(warpPerspectiveCrop).not.toHaveBeenCalled();
    expect(page).toMatchObject({ uri: 'IMG_2.jpg.master', needsCropReview: true, cropSuggestion: quad });
  });

  it('keeps the full photo when no page is found', async () => {
    jest.mocked(detectDocumentQuad).mockResolvedValue(null);
    const [page] = await ingestOne('IMG_3.jpg', gallery);
    expect(page.needsCropReview).toBe(true);
    expect(page.cropSuggestion).toBeUndefined();
  });

  it("respects Book mode: splits a cropped spread, but not an uncropped photo", async () => {
    const book = { ...gallery, spec: getCaptureModeSpec('book') };
    jest.mocked(detectDocumentQuad).mockResolvedValueOnce({ quad, confidence: 'high' });
    await ingestOne('spread.jpg', book);
    expect(splitSpread).toHaveBeenCalledWith('spread.jpg.master.cropped');

    jest.mocked(splitSpread).mockClear();
    jest.mocked(detectDocumentQuad).mockResolvedValueOnce(null);
    const pages = await ingestOne('desk.jpg', book);
    expect(splitSpread).not.toHaveBeenCalled();
    expect(pages[0].needsCropReview).toBe(true);
  });

  it('processes a batch one photo at a time', async () => {
    let running = 0;
    let maxRunning = 0;
    jest.mocked(detectDocumentQuad).mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return { quad, confidence: 'high' };
    });
    const dispatch = jest.fn();
    await ingestGalleryBatch(dispatch, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], 'latin', getCaptureModeSpec('doc'));
    expect(maxRunning).toBe(1);
    expect(detectDocumentQuad).toHaveBeenCalledTimes(4);
    const added = dispatch.mock.calls.find(([a]) => a.type === 'capture/BULK_ADD_PAGES')?.[0];
    expect(added.pages).toHaveLength(4);
  });
});

describe('crop review state', () => {
  const flagged: SessionPage = {
    id: 'p',
    uri: 'photo.jpg',
    width: 3000,
    height: 2000,
    rotation: 0,
    enhance: 'auto',
    needsCropReview: true,
    cropSuggestion: quad,
  };

  it('a new master (manual crop) clears the flag and the stale suggestion', () => {
    const state = captureReducer(
      { ...initialCaptureState, pages: [flagged] },
      { type: 'capture/UPDATE_PAGE', id: 'p', patch: { uri: 'cropped.jpg', width: 1700, height: 2200 } }
    );
    expect(state.pages[0]).toMatchObject({ uri: 'cropped.jpg', needsCropReview: undefined, cropSuggestion: undefined });
  });

  it('other edits keep the flag', () => {
    const state = captureReducer(
      { ...initialCaptureState, pages: [flagged] },
      { type: 'capture/UPDATE_PAGE', id: 'p', patch: { enhance: 'gray' } }
    );
    expect(state.pages[0].needsCropReview).toBe(true);
  });
});
