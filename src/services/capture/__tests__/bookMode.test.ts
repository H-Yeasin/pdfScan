import { captureReducer, initialCaptureState } from '../../../store/slices/captureSlice';
import type { SessionPage } from '../../../types/models';
import { splitSpread } from '../../enhance/splitSpread';
import { getCaptureModeSpec } from '../captureModes';
import { ingestPage, pageFromMaster } from '../ingest';
import { ingestOne } from '../ingestBatch';

jest.mock('../../enhance/splitSpread', () => ({ splitSpread: jest.fn() }));
jest.mock('../ingest', () => ({
  ingestPage: jest.fn(async (uri: string, _s: string, o: { enhance?: string; ocr?: boolean }) => ({
    id: `p_${uri}`,
    uri: `${uri}.master`,
    thumbUri: `${uri}.thumb`,
    width: 3000,
    height: 2000,
    rotation: 0,
    enhance: o.enhance ?? 'auto',
  })),
  pageFromMaster: jest.fn(async (m: { uri: string; width: number; height: number }, _s: string, o: { enhance?: string }) => ({
    id: `p_${m.uri}`,
    uri: m.uri,
    thumbUri: `${m.uri}.thumb`,
    width: m.width,
    height: m.height,
    rotation: 0,
    enhance: o.enhance ?? 'auto',
  })),
}));

const book = { script: 'latin' as const, spec: getCaptureModeSpec('book'), ownsInputs: true };

beforeEach(() => jest.clearAllMocks());

describe('Book mode ingest', () => {
  it('splits a spread into left then right, with no text read yet (the batch reads the halves)', async () => {
    jest.mocked(splitSpread).mockResolvedValue([
      { uri: 'left.jpg', width: 1410, height: 2000 },
      { uri: 'right.jpg', width: 1590, height: 2000 },
    ]);

    const pages = await ingestOne('spread.jpg', book);

    expect(ingestPage).toHaveBeenCalledWith('spread.jpg', 'latin', { deleteSource: true, enhance: 'auto', ocr: false });
    expect(splitSpread).toHaveBeenCalledWith('spread.jpg.master');
    expect(pages.map((p) => p.uri)).toEqual(['left.jpg', 'right.jpg']);
    expect(jest.mocked(pageFromMaster).mock.calls.map(([, , o]) => o)).toEqual([
      { enhance: 'auto', ocr: false },
      { enhance: 'auto', ocr: false },
    ]);
    expect(pages[0].splitFrom).toEqual(pages[1].splitFrom);
    expect(pages[0].splitFrom).toMatchObject({ uri: 'spread.jpg.master', width: 3000, height: 2000 });
  });

  it('keeps a portrait capture as one page', async () => {
    jest.mocked(splitSpread).mockResolvedValue(null);
    const pages = await ingestOne('portrait.jpg', book);
    expect(pages).toHaveLength(1);
    expect(pages[0].splitFrom).toBeUndefined();
    expect(pages[0].uri).toBe('portrait.jpg.master');
  });

  it('keeps the whole spread if splitting fails', async () => {
    jest.mocked(splitSpread).mockRejectedValue(new Error('skia'));
    const pages = await ingestOne('spread.jpg', book);
    expect(pages.map((p) => p.uri)).toEqual(['spread.jpg.master']);
  });

  it('never splits in other modes', async () => {
    const pages = await ingestOne('doc.jpg', { ...book, spec: getCaptureModeSpec('doc') });
    expect(splitSpread).not.toHaveBeenCalled();
    expect(pageFromMaster).not.toHaveBeenCalled();
    expect(pages).toHaveLength(1);
  });
});

describe('capture/UNSPLIT', () => {
  const splitFrom = { groupId: 'g1', uri: 'spread.jpg', thumbUri: 'spread.thumb', width: 3000, height: 2000 };
  const page = (id: string, extra: Partial<SessionPage> = {}): SessionPage => ({
    id,
    uri: `${id}.jpg`,
    width: 1,
    height: 1,
    rotation: 0,
    enhance: 'auto',
    ...extra,
  });

  it('rejoins both halves in place as the original spread', () => {
    const state = {
      ...initialCaptureState,
      pages: [page('a'), page('L', { splitFrom, enhance: 'gray' }), page('R', { splitFrom }), page('z')],
    };
    const next = captureReducer(state, { type: 'capture/UNSPLIT', groupId: 'g1', id: 'joined' });
    expect(next.pages.map((p) => p.id)).toEqual(['a', 'joined', 'z']);
    expect(next.pages[1]).toMatchObject({ uri: 'spread.jpg', thumbUri: 'spread.thumb', width: 3000, height: 2000, enhance: 'gray' });
    expect(next.pages[1].splitFrom).toBeUndefined();
  });

  it('ignores an unknown group', () => {
    const state = { ...initialCaptureState, pages: [page('a')] };
    expect(captureReducer(state, { type: 'capture/UNSPLIT', groupId: 'nope', id: 'x' })).toBe(state);
  });
});
