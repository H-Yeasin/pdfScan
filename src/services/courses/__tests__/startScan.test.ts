import { startScan } from '../startScan';

const actions = (pages: number, courseId: string | null, launch = true) => {
  const dispatch = jest.fn();
  startScan({ capture: { pages: Array.from({ length: pages }, () => ({})), mode: 'doc' }, settings: { lastCaptureMode: 'doc' } } as never, dispatch, courseId, { launch });
  return dispatch.mock.calls.map(([a]) => a);
};

describe('startScan', () => {
  it('preselects the course for a scan started from a course, even mid-session', () => {
    expect(actions(0, 'c1')).toContainEqual({ type: 'deliver/SET_COURSE', courseId: 'c1' });
    expect(actions(2, 'c1')).toContainEqual({ type: 'deliver/SET_COURSE', courseId: 'c1' });
  });

  it('goes back to the automatic course for a general scan, but not mid-session', () => {
    expect(actions(0, null)).toContainEqual({ type: 'deliver/AUTO_COURSE' });
    expect(actions(2, null).map((a) => a.type)).toEqual(['capture/SET_RETAKE_TARGET', 'capture/REQUEST_SCANNER']);
  });

  it('asks Capture to open the scanner only for a "scan now" button, not the Scan tab', () => {
    expect(actions(0, null, true)).toContainEqual({ type: 'capture/REQUEST_SCANNER', requested: true });
    expect(actions(0, null, false)).toContainEqual({ type: 'capture/REQUEST_SCANNER', requested: false });
  });

  // §7 R3: "Add pages → From a new scan".
  it('sets the document the scan is added to, and drops a stale one only when no session is open', () => {
    const run = (pages: number, appendTo?: string) => {
      const dispatch = jest.fn();
      startScan({ capture: { pages: Array.from({ length: pages }, () => ({})), mode: 'doc' }, settings: { lastCaptureMode: 'doc' } } as never, dispatch, null, { launch: true, appendTo });
      return dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'deliver/SET_APPEND_TARGET');
    };
    expect(run(0, 'doc1')).toEqual([{ type: 'deliver/SET_APPEND_TARGET', documentId: 'doc1' }]);
    expect(run(0)).toEqual([{ type: 'deliver/SET_APPEND_TARGET', documentId: null }]);
    expect(run(2)).toEqual([]);
  });

  // §17 U5: the tab bar's Scan button and its mode sheet.
  it('starts a new session in the chosen mode, else the last one, and keeps a session in progress', () => {
    const modes = (pages: number, mode?: 'book', last: 'doc' | 'notes' = 'doc') => {
      const dispatch = jest.fn();
      const state = { capture: { pages: Array.from({ length: pages }, () => ({})), mode: 'doc' }, settings: { lastCaptureMode: last } };
      startScan(state as never, dispatch, null, { launch: true, mode });
      return dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'capture/SET_MODE');
    };
    expect(modes(0, 'book')).toEqual([{ type: 'capture/SET_MODE', mode: 'book' }]);
    expect(modes(0, undefined, 'notes')).toEqual([{ type: 'capture/SET_MODE', mode: 'notes' }]);
    // Already in that mode: nothing to change.
    expect(modes(0)).toEqual([]);
    expect(modes(3, 'book')).toEqual([]);
  });
});
