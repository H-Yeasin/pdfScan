import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import type { AppAction } from '../../../store/appReducer';
import { captureReducer, initialCaptureState } from '../../../store/slices/captureSlice';
import { getCaptureModeSpec } from '../captureModes';
import { ingestPage } from '../ingest';
import { ingestBatch, ingestGalleryBatch } from '../ingestBatch';
import { cancelProcessing, isProcessing } from '../processingSession';

jest.mock('../ingest', () => ({ ingestPage: jest.fn() }));

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
});

describe('ingestBatch', () => {
  it('reports progress per page, commits once, and offers "Scan more"', async () => {
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
    const added = actions.filter((a) => a.type === 'capture/BULK_ADD_PAGES');
    expect(added).toHaveLength(1);
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
    const added = actions.find((a) => a.type === 'capture/BULK_ADD_PAGES') as { pages: { id: string }[] };
    expect(added.pages.map((p) => p.id)).toEqual([uris[0], uris[1]]);
    expect(uris.map((u) => new File(u).exists)).toEqual([false, false, false, false]);
    expect(actions).toContainEqual({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    expect(actions).toContainEqual({ type: 'ui/SHOW_SNACK', msg: 'Stopped · kept 2 pages' });
    expect(actions.at(-1)).not.toMatchObject({ status: 'success' });
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
    expect(actions.find((a) => a.type === 'capture/BULK_ADD_PAGES')).toMatchObject({ pages: [{ id: uris[0] }] });
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
