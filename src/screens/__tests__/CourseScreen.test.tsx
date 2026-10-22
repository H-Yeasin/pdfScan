import { Alert } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider, useRouter } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { makeDoc } from '../../test/fixtures';
import { CourseScreen } from '../CourseScreen';
import { ExamPackScreen } from '../ExamPackScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../components/shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../components/shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../components/shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));

type Ctx = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter> };

const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  jest.restoreAllMocks();
});

function mount(screen: 'course' | 'examPack') {
  let ctx: Ctx | null = null;
  function Probe() {
    const router = useRouter();
    ctx = { app: useAppState(), router };
    // The course page mounts when a test goes to it, after seeding, as it does from Home.
    if (screen === 'examPack') return <ExamPackScreen />;
    return router.screen === 'course' ? <CourseScreen /> : null;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <RouterProvider>
            <AppStateProvider>
              <Probe />
            </AppStateProvider>
          </RouterProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  mounted.push(root);
  // The library has loaded (useLibraryPersistence isn't mounted here); §17 U13's skeletons show until then.
  act(() => ctx!.app.dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' }));
  return { root, ctx: () => ctx! };
}

// A text node's own strings (a Chip's label is followed by an optional count element).
function texts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAll((n) => typeof n.type === 'string' && [n.props.children].flat().some((c) => typeof c === 'string'))
    .map((n) => [n.props.children].flat().filter((c) => typeof c === 'string').join(''));
}

function byId(root: ReturnType<typeof create>, testID: string): ReactTestInstance {
  const node = root.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`Nothing pressable with testID "${testID}"`);
  return node;
}

const DAY = 24 * 60 * 60 * 1000;

function seedCourse(ctx: () => Ctx, highlight?: string) {
  act(() => {
    const { dispatch } = ctx().app;
    dispatch({ type: 'library/CREATE_COURSE', id: 'phy', name: 'Physics', fields: { code: 'PHY 101' } });
    dispatch({ type: 'library/SET_FILES', files: [makeDoc({ id: 'lab', name: 'Lab report', courseId: 'phy' })] });
    for (const id of ['d1', 'd2']) {
      dispatch({
        type: 'library/ADD_DEADLINE',
        deadline: { id, courseId: 'phy', title: `Homework ${id}`, dueAt: Date.now() + 3 * DAY, reminderIds: [], createdAt: Date.now() },
      });
    }
    dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'phy' });
    if (highlight) dispatch({ type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: highlight });
  });
  act(() => ctx().router.go('course'));
}

describe('CourseScreen (§17 U11)', () => {
  it('shows the course with labelled actions, and its sections closed with counts', () => {
    const { root, ctx } = mount('course');
    seedCourse(ctx);
    const all = texts(root);
    expect(all).toEqual(expect.arrayContaining(['Physics', 'PHY 101', 'Scan', 'Exam pack', 'Edit', 'Documents · 1', 'Lab report', 'Deadlines']));
    const deadlines = byId(root, 'course-section-deadlines');
    expect(deadlines.props.accessibilityLabel).toBe('Deadlines, 2');
    expect(deadlines.props.accessibilityState).toEqual({ expanded: false });
    // Closed: the deadlines themselves aren't drawn yet.
    expect(all).not.toContain('Homework d1');
    expect(all).not.toContain('Add deadline');
  });

  it('opens a section in place, and closes it again', () => {
    const { root, ctx } = mount('course');
    seedCourse(ctx);
    act(() => byId(root, 'course-section-deadlines').props.onPress());
    expect(texts(root)).toEqual(expect.arrayContaining(['Homework d1', 'Homework d2', 'Add deadline']));
    expect(byId(root, 'course-section-deadlines').props.accessibilityState).toEqual({ expanded: true });

    act(() => byId(root, 'course-section-deadlines').props.onPress());
    expect(texts(root)).not.toContain('Homework d1');
  });

  it('opens on Deadlines when a reminder pointed at one', () => {
    const { root, ctx } = mount('course');
    seedCourse(ctx, 'd1');
    expect(byId(root, 'course-section-deadlines').props.accessibilityState).toEqual({ expanded: true });
    expect(texts(root)).toContain('Homework d1');
    // Bookmarks and Submissions only show once there is one.
    expect(root.root.findAll((n) => n.props.testID === 'course-section-bookmarks')).toHaveLength(0);
    expect(root.root.findAll((n) => n.props.testID === 'course-section-submissions')).toHaveLength(0);
  });

  it('the Exam pack chip opens the pack, filed under this course', () => {
    const { root, ctx } = mount('course');
    seedCourse(ctx);
    act(() => byId(root, 'course-pack').props.onPress());
    expect(ctx().router.screen).toBe('examPack');
    expect(ctx().app.state.pack.courseId).toBe('phy');
  });
});

describe('ExamPackScreen (§17 U11)', () => {
  it('asks before Clear, and clears only on the destructive answer', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { root, ctx } = mount('examPack');
    act(() => {
      ctx().app.dispatch({ type: 'library/SET_FILES', files: [makeDoc({ id: 'lab', name: 'Lab report', courseId: 'phy' })] });
    });
    const doc = ctx().app.state.library.files[0];
    act(() => ctx().app.dispatch({ type: 'pack/ADD', items: [{ documentId: doc.id, pageId: doc.pages[0].id }] }));
    expect(texts(root)).toContain('Lab report · p. 1');

    act(() => byId(root, 'pack-clear').props.onPress());
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alert.mock.calls[0];
    expect(title).toBe('Clear the exam pack?');
    expect(body).toMatch(/1 page comes out of the pack/);
    // Nothing is cleared until the answer.
    expect(ctx().app.state.pack.items).toHaveLength(1);

    const clear = buttons!.find((b) => b.style === 'destructive')!;
    act(() => clear.onPress!());
    expect(ctx().app.state.pack.items).toHaveLength(0);
  });
});
