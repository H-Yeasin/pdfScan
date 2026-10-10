import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import type { AppAction } from '../../../store/appReducer';
import { captureReducer, initialCaptureState, type CaptureState } from '../../../store/slices/captureSlice';
import type { SessionPage } from '../../../types/models';
import { getCaptureModeSpec } from '../captureModes';
import { ingestPage, readPage } from '../ingest';
import { ingestBatch, ingestGalleryBatch, stopReadingText, textReadingDone } from '../ingestBatch';
import { cancelProcessing, isProcessing } from '../processingSession';

jest.mock('../ingest', () => ({ ingestPage: jest.fn(), pageFromMaster: jest.fn(), readPage: jest.fn() }));
jest.mock('../idCardPages', () => ({ composeIdCardPages: jest.fn(async (pages: unknown[]) => pages.slice(0, 1)) }));

function rawFile(name: string): string {
  const file = new File(Paths.cache, name);
  file.write('raw');
  return file.uri;
}

function actionsOf(dispatch: jest.Mock): AppAction[] {
  return dispatch.mock.calls.map(([action]) => action);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ingestPage).mockImplementation(async (uri, _script, options) => {
    if (options?.deleteSource) new File(uri).delete();
    return { id: uri, uri: `${uri}.master`, width: 1, height: 1, rotation: 0, enhance: options?.enhance ?? 'auto' };
  });
  jest.mocked(readPage).mockImplementation(async (master) => ({ ocr: { text: `text of ${master.uri}`, blocks: [] }, ocrGeometry: `key:${master.uri}` }));
});

// The pages a batch put into the session, in the order it added them.
function addedIds(actions: AppAction[]): string[] {
  return actions.flatMap((a) => (a.type === 'capture/ADD_PAGE' ? [a.page.id] : []));
}

describe('ingestBatch', () => {
  it('reports progress per page, adds each page as it finishes, and offers "Scan more"', async () => {
    const dispatch = jest.fn();
    const onScanMore = jest.fn();
    const uris = [rawFile('s1.jpg'), rawFile('s2.jpg')];

    await ingestBatch(dispatch, uris, { script: 'latin', spec: getCaptureModeSpec('notes'), ownsInputs: true, onScanMore });

    const actions = actionsOf(dispatch);
    expect(actions.filter((a) => a.type === 'capture/SET_PROGRESS')).toEqual([
      { type: 'capture/SET_PROGRESS', progress: { done: 0, total: 2 } },
      { type: 'capture/SET_PROGRESS', progress: { done: 1, total: 2 } },
      { type: 'capture/SET_PROGRESS', progress: { done: 2, total: 2 } },
      { type: 'capture/SET_PROGRESS', progress: null },
    ]);
    expect(addedIds(actions)).toEqual(uris);
    expect(actions.some((a) => a.type === 'capture/BULK_ADD_PAGES')).toBe(false);
    const snack = actions.find((a) => a.type === 'ui/SHOW_SNACK');
    expect(snack).toMatchObject({ msg: 'Added 2 pages', action: 'Scan more' });
    (snack as { onAction: () => void }).onAction();
    expect(onScanMore).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(isProcessing()).toBe(false);
  });

  it('cancelling mid-batch keeps finished pages and deletes the unprocessed scans', async () => {
    const dispatch = jest.fn();
    const uris = ['c1.jpg', 'c2.jpg', 'c3.jpg', 'c4.jpg'].map(rawFile);
    jest.mocked(ingestPage).mockImplementation(async (uri, _script, options) => {
      if (uri === uris[1]) cancelProcessing(); // user taps Cancel while page 2 is processing
      if (options?.deleteSource) new File(uri).delete();
      return { id: uri, uri: `${uri}.master`, width: 1, height: 1, rotation: 0, enhance: 'auto' };
    });

    await ingestBatch(dispatch, uris, { script: 'latin', spec: getCaptureModeSpec('doc'), ownsInputs: true });

    const actions = actionsOf(dispatch);
    expect(addedIds(actions)).toEqual([uris[0], uris[1]]);
    expect(uris.map((u) => new File(u).exists)).toEqual([false, false, false, false]);
    expect(actions).toContainEqual({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    expect(actions).toContainEqual({ type: 'ui/SHOW_SNACK', msg: 'Stopped · kept 2 pages' });
    expect(actions.some((a) => a.type === 'capture/SET_PROCESSING_STATUS' && a.status === 'success')).toBe(false);
    // "Stop" means stop: the kept pages aren't read now, only told that nothing is coming.
    await textReadingDone();
    expect(readPage).not.toHaveBeenCalled();
    expect(actionsOf(dispatch).filter((a) => a.type === 'capture/UPDATE_PAGE')).toEqual([
      { type: 'capture/UPDATE_PAGE', id: uris[0], patch: { ocrPending: undefined } },
      { type: 'capture/UPDATE_PAGE', id: uris[1], patch: { ocrPending: undefined } },
    ]);
  });

  it('keeps finished pages on a failure and reports which page failed', async () => {
    const dispatch = jest.fn();
    const uris = ['f1.jpg', 'f2.jpg', 'f3.jpg'].map(rawFile);
    jest.mocked(ingestPage).mockImplementation(async (uri) => {
      if (uri === uris[1]) throw new Error('decode failed');
      return { id: uri, uri, width: 1, height: 1, rotation: 0, enhance: 'auto' };
    });

    await ingestBatch(dispatch, uris, { script: 'latin', spec: getCaptureModeSpec('doc'), ownsInputs: true });

    const actions = actionsOf(dispatch);
    expect(addedIds(actions)).toEqual([uris[0]]);
    expect(actions).toContainEqual({
      type: 'capture/SET_PROCESSING_STATUS',
      status: 'error',
      errorMessage: "Couldn't process page 2 · kept 1 page",
    });
    expect(new File(uris[2]).exists).toBe(false);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it("never deletes the user's gallery photos", async () => {
    const dispatch = jest.fn();
    const uris = ['g1.jpg', 'g2.jpg'].map(rawFile);
    jest.mocked(ingestPage).mockImplementation(async (uri, _script, options) => {
      if (uri === uris[0]) cancelProcessing();
      expect(options?.deleteSource).toBe(false);
      return { id: uri, uri, width: 1, height: 1, rotation: 0, enhance: options?.enhance ?? 'auto' };
    });

    await ingestGalleryBatch(dispatch, uris, 'latin', getCaptureModeSpec('board'));

    expect(uris.map((u) => new File(u).exists)).toEqual([true, true]);
    expect(actionsOf(dispatch)[0]).toEqual({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
  });
});

describe('ingestBatch: pages first, text afterwards (§16 G7)', () => {
  const options = { script: 'latin' as const, spec: getCaptureModeSpec('doc'), ownsInputs: true };

  it('puts every page into the session, in order, before any of them is read', async () => {
    const dispatch = jest.fn();
    const uris = ['o1.jpg', 'o2.jpg', 'o3.jpg'].map(rawFile);

    await ingestBatch(dispatch, uris, options);

    // The batch is over (the "added" message is out) and no page has been read yet.
    const before = actionsOf(dispatch);
    expect(before.filter((a) => a.type === 'capture/ADD_PAGE')).toEqual([
      { type: 'capture/ADD_PAGE', page: expect.objectContaining({ id: uris[0], ocrPending: true }), afterId: undefined },
      { type: 'capture/ADD_PAGE', page: expect.objectContaining({ id: uris[1], ocrPending: true }), afterId: uris[0] },
      { type: 'capture/ADD_PAGE', page: expect.objectContaining({ id: uris[2], ocrPending: true }), afterId: uris[1] },
    ]);
    expect(before.some((a) => a.type === 'capture/UPDATE_PAGE')).toBe(false);
    expect(before.some((a) => a.type === 'ui/SHOW_SNACK')).toBe(true);
    expect(jest.mocked(ingestPage).mock.calls.every(([, , o]) => o?.ocr === false)).toBe(true);

    await textReadingDone();
    expect(actionsOf(dispatch).filter((a) => a.type === 'capture/UPDATE_PAGE')).toEqual(
      uris.map((uri) => ({
        type: 'capture/UPDATE_PAGE',
        id: uri,
        patch: { ocr: { text: `text of ${uri}.master`, blocks: [] }, ocrGeometry: `key:${uri}.master`, ocrPending: undefined },
      }))
    );
  });

  it('reads one page at a time and sends stats through the uri-checked action', async () => {
    let running = 0;
    let maxRunning = 0;
    const stats = { marker: 'stats' } as never;
    jest.mocked(readPage).mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return { stats, ocr: undefined, ocrGeometry: undefined };
    });
    const dispatch = jest.fn();
    const uris = ['r1.jpg', 'r2.jpg', 'r3.jpg'].map(rawFile);

    await ingestBatch(dispatch, uris, options);
    await textReadingDone();

    expect(maxRunning).toBe(1);
    expect(actionsOf(dispatch).filter((a) => a.type === 'capture/SET_PAGE_STATS')).toEqual(
      uris.map((uri) => ({ type: 'capture/SET_PAGE_STATS', id: uri, uri: `${uri}.master`, stats }))
    );
  });

  it('stopping while a page is being read keeps every page and clears the rest of the flags', async () => {
    const dispatch = jest.fn();
    const uris = ['m1.jpg', 'm2.jpg', 'm3.jpg', 'm4.jpg'].map(rawFile);
    jest.mocked(readPage).mockImplementation(async (master) => {
      if (master.uri === `${uris[1]}.master`) stopReadingText();
      return { ocr: { text: 'read', blocks: [] }, ocrGeometry: 'key' };
    });

    await ingestBatch(dispatch, uris, options);
    await textReadingDone();

    const actions = actionsOf(dispatch);
    expect(addedIds(actions)).toEqual(uris);
    expect(actions.some((a) => a.type === 'capture/REMOVE_PAGE' || a.type === 'capture/CLEAR_PAGES')).toBe(false);
    expect(readPage).toHaveBeenCalledTimes(2);
    const patches = actions.flatMap((a) => (a.type === 'capture/UPDATE_PAGE' ? [a.patch] : []));
    expect(patches.map((p) => p.ocr?.text)).toEqual(['read', 'read', undefined, undefined]);
    expect(patches.every((p) => 'ocrPending' in p && p.ocrPending === undefined)).toBe(true);
  });

  it('a new batch stops the reading of the one before it', async () => {
    const dispatch = jest.fn();
    const first = ['n1.jpg', 'n2.jpg'].map(rawFile);
    let release = () => {};
    jest.mocked(readPage).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ ocr: undefined, ocrGeometry: undefined })))
    );
    await ingestBatch(dispatch, first, options);
    const firstReading = textReadingDone();
    // Until n1 is being read.
    while (jest.mocked(readPage).mock.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));

    const second = ingestBatch(dispatch, [rawFile('n3.jpg')], options);
    release();
    await firstReading;
    await second;
    await textReadingDone();

    // n1 was being read; n2 never was.
    expect(jest.mocked(readPage).mock.calls.map(([m]) => m.uri)).not.toContain(`${first[1]}.master`);
  });

  it('ID card pages are composed after the batch and committed once', async () => {
    const dispatch = jest.fn();
    const uris = ['i1.jpg', 'i2.jpg'].map(rawFile);

    await ingestBatch(dispatch, uris, { ...options, spec: getCaptureModeSpec('id') });
    await textReadingDone();

    const actions = actionsOf(dispatch);
    expect(addedIds(actions)).toEqual([]);
    expect(actions.filter((a) => a.type === 'capture/BULK_ADD_PAGES')).toEqual([
      { type: 'capture/BULK_ADD_PAGES', pages: [expect.objectContaining({ id: uris[0] })] },
    ]);
    expect(readPage).not.toHaveBeenCalled();
  });
});

describe('capture/ADD_PAGE', () => {
  const page = (id: string): SessionPage => ({ id, uri: `${id}.jpg`, width: 1, height: 1, rotation: 0, enhance: 'auto' });
  const ids = (state: CaptureState) => state.pages.map((p) => p.id);

  it("takes a pending retake's place, then keeps the batch together", () => {
    let state: CaptureState = { ...initialCaptureState, pages: [page('a'), page('b'), page('c')], retakeTargetId: 'b' };
    state = captureReducer(state, { type: 'capture/ADD_PAGE', page: page('n1') });
    expect(ids(state)).toEqual(['a', 'n1', 'c']);
    expect(state.retakeTargetId).toBeNull();
    state = captureReducer(state, { type: 'capture/ADD_PAGE', page: page('n2'), afterId: 'n1' });
    expect(ids(state)).toEqual(['a', 'n1', 'n2', 'c']);
  });

  it('goes to the end when the page before it was removed, and starts the session clock', () => {
    let state = captureReducer(initialCaptureState, { type: 'capture/ADD_PAGE', page: page('n1') });
    expect(state.startedAt).not.toBeNull();
    state = captureReducer(state, { type: 'capture/ADD_PAGE', page: page('n2'), afterId: 'gone' });
    expect(ids(state)).toEqual(['n1', 'n2']);
  });
});

describe('capture/SET_PROGRESS', () => {
  it('sets, clamps and clears progress', () => {
    let state = captureReducer(initialCaptureState, { type: 'capture/SET_PROGRESS', progress: { done: 3, total: 10 } });
    expect(state.progress).toEqual({ done: 3, total: 10 });
    state = captureReducer(state, { type: 'capture/SET_PROGRESS', progress: { done: 12, total: 10 } });
    expect(state.progress).toEqual({ done: 10, total: 10 });
    state = captureReducer(state, { type: 'capture/SET_PROGRESS', progress: null });
    expect(state.progress).toBeNull();
    expect(captureReducer(state, { type: 'capture/SET_PROGRESS', progress: null })).toBe(state);
  });
});
