import { startScan } from '../startScan';

const actions = (pages: number, courseId: string | null) => {
  const dispatch = jest.fn();
  startScan({ capture: { pages: Array.from({ length: pages }, () => ({})) } } as never, dispatch, courseId);
  return dispatch.mock.calls.map(([a]) => a);
};

describe('startScan', () => {
  it('preselects the course for a scan started from a course, even mid-session', () => {
    expect(actions(0, 'c1')).toContainEqual({ type: 'deliver/SET_COURSE', courseId: 'c1' });
    expect(actions(2, 'c1')).toContainEqual({ type: 'deliver/SET_COURSE', courseId: 'c1' });
  });

  it('goes back to the automatic course for a general scan, but not mid-session', () => {
    expect(actions(0, null)).toContainEqual({ type: 'deliver/AUTO_COURSE' });
    expect(actions(2, null).map((a) => a.type)).toEqual(['capture/SET_RETAKE_TARGET']);
  });
});
