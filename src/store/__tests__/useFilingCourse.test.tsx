import { act, create } from 'react-test-renderer';
import { makeDoc } from '../../test/fixtures';
import { AppStateProvider, useAppState } from '../AppStateContext';
import { useFilingCourse } from '../useFilingCourse';

type Probe = { app: ReturnType<typeof useAppState>; filing: ReturnType<typeof useFilingCourse> };

function mount() {
  let probe: Probe | null = null;
  function Probe() {
    probe = { app: useAppState(), filing: useFilingCourse() };
    return null;
  }
  act(() => {
    create(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    );
  });
  return {
    current: () => probe!,
    dispatch: (...a: Parameters<Probe['app']['dispatch']>) => act(() => probe!.app.dispatch(...a)),
  };
}

const COURSES = ['Calculus', 'Physics', 'Chemistry', 'English'];

function withCourses() {
  const p = mount();
  for (const name of COURSES) p.dispatch({ type: 'library/CREATE_COURSE', id: name.toLowerCase(), name });
  return p;
}

// The page a scan session starts with (BULK_ADD_PAGES stamps capture.startedAt).
const page = { id: 'p1', uri: 'file:///p1.jpg', width: 10, height: 10, rotation: 0 as const, enhance: 'auto' as const };

describe('useFilingCourse', () => {
  it('files a scan during class time into that class, with no taps', () => {
    const p = withCourses();
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    // A 4-course week: Physics is on right now; the others are on other days.
    p.dispatch({ type: 'library/ADD_SLOT', slot: { id: 'ph', courseId: 'physics', weekday: now.getDay(), startMin: Math.max(0, minute - 30), endMin: Math.min(1439, minute + 30) } });
    for (const [i, id] of ['calculus', 'chemistry', 'english'].entries()) {
      p.dispatch({ type: 'library/ADD_SLOT', slot: { id, courseId: id, weekday: (now.getDay() + 1 + i) % 7, startMin: 540, endMin: 600 } });
    }
    p.dispatch({ type: 'capture/BULK_ADD_PAGES', pages: [page] });

    expect(p.current().app.state.capture.startedAt).not.toBeNull();
    expect(p.current().filing).toMatchObject({ courseId: 'physics', automatic: true });
  });

  it('without a timetable, suggests the last course used for this capture mode', () => {
    const p = withCourses();
    p.dispatch({
      type: 'library/SET_FILES',
      files: [
        makeDoc({ id: 'b', courseId: 'english', mode: 'board', createdAt: Date.now() - 1000 }),
        makeDoc({ id: 'd', courseId: 'chemistry', mode: 'doc', createdAt: Date.now() - 500 }),
      ],
    });
    p.dispatch({ type: 'capture/SET_MODE', mode: 'board' });
    expect(p.current().filing.courseId).toBe('english');
    p.dispatch({ type: 'capture/SET_MODE', mode: 'doc' });
    expect(p.current().filing.courseId).toBe('chemistry');
  });

  it('a pick (or a scan from a course page) wins until the next general scan', () => {
    const p = withCourses();
    p.dispatch({ type: 'deliver/SET_COURSE', courseId: 'english' });
    expect(p.current().filing).toMatchObject({ courseId: 'english', automatic: false });
    p.dispatch({ type: 'deliver/SET_COURSE', courseId: null });
    expect(p.current().filing).toMatchObject({ courseId: null, automatic: false });
    p.dispatch({ type: 'deliver/AUTO_COURSE' });
    expect(p.current().filing).toMatchObject({ courseId: 'calculus', automatic: true });
  });
});
