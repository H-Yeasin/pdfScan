import { startScan } from '../startScan';

const actions = (pages: number, courseId: string | null, launch = true) => {
  const dispatch = jest.fn();
  startScan({ capture: { pages: Array.from({ length: pages }, () => ({})) } } as never, dispatch, courseId, { launch });
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
      startScan({ capture: { pages: Array.from({ length: pages }, () => ({})) } } as never, dispatch, null, { launch: true, appendTo });
      return dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'deliver/SET_APPEND_TARGET');
    };
    expect(run(0, 'doc1')).toEqual([{ type: 'deliver/SET_APPEND_TARGET', documentId: 'doc1' }]);
    expect(run(0)).toEqual([{ type: 'deliver/SET_APPEND_TARGET', documentId: null }]);
    expect(run(2)).toEqual([]);
  });
});
