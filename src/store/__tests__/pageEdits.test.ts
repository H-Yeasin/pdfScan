import { appReducer } from '../appReducer';
import { initialAppState } from '../initialState';
import { historyUris } from '../pageHistory';
import { captureSpecFor, initialSettingsState } from '../slices/settingsSlice';
import type { AppState } from '../appReducer';
import type { SessionPage } from '../../types/models';

// Where F5 (rotation as a setting, thumbnails) meets §2 (filter stats, undo history).

const stats = { light: {} } as unknown as NonNullable<SessionPage['stats']>;

function stateWith(page: Partial<SessionPage>): AppState {
  const full: SessionPage = {
    id: 'p1',
    uri: 'file:///master.jpg',
    thumbUri: 'file:///thumb.jpg',
    width: 1000,
    height: 1400,
    rotation: 0,
    enhance: 'auto',
    stats,
    ...page,
  };
  return { ...initialAppState, capture: { ...initialAppState.capture, pages: [full] } };
}

describe('page edits across rotate, crop and undo', () => {
  it('rotates as a setting, keeps stats, and undoes', () => {
    let state = appReducer(stateWith({}), { type: 'capture/ROTATE_PAGE', id: 'p1' });
    expect(state.capture.pages[0]).toMatchObject({ rotation: 90, uri: 'file:///master.jpg', stats });
    state = appReducer(state, { type: 'review/UNDO' });
    expect(state.capture.pages[0].rotation).toBe(0);
  });

  it('a new master drops stale stats and thumbnail; undo brings both files back', () => {
    let state = appReducer(stateWith({}), {
      type: 'capture/UPDATE_PAGE',
      id: 'p1',
      patch: { uri: 'file:///cropped.jpg' },
    });
    expect(state.capture.pages[0].stats).toBeUndefined();
    expect(state.capture.pages[0].thumbUri).toBeUndefined();
    // The pre-crop files stay alive for undo until the session ends.
    expect(historyUris(state.review.history)).toEqual(
      expect.arrayContaining(['file:///master.jpg', 'file:///thumb.jpg'])
    );

    state = appReducer(state, { type: 'review/UNDO' });
    expect(state.capture.pages[0]).toMatchObject({ uri: 'file:///master.jpg', thumbUri: 'file:///thumb.jpg' });
  });

  it('a patch that keeps the same uri keeps stats and thumbnail', () => {
    const state = appReducer(stateWith({}), {
      type: 'capture/UPDATE_PAGE',
      id: 'p1',
      patch: { uri: 'file:///master.jpg', ocr: undefined },
    });
    expect(state.capture.pages[0]).toMatchObject({ stats, thumbUri: 'file:///thumb.jpg' });
  });
});

describe('captureSpecFor', () => {
  it("uses the mode's own default filter", () => {
    expect(captureSpecFor(initialSettingsState, 'notes').defaultEnhance).toBe('ink');
    expect(captureSpecFor(initialSettingsState, 'board').defaultEnhance).toBe('board');
  });

  it("prefers the user's per-mode choice", () => {
    const settings = { ...initialSettingsState, defaultEnhanceByMode: { notes: 'bw' as const } };
    expect(captureSpecFor(settings, 'notes')).toMatchObject({ id: 'notes', defaultEnhance: 'bw', pageLimit: 50 });
  });
});
