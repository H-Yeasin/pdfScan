import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider, useRouter } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { CourseScreen } from '../CourseScreen';
import { HomeScreen } from '../HomeScreen';
import { makeDoc } from '../../test/fixtures';
import { en } from '../../i18n/en';
import { setUiLanguage } from '../../i18n';

// Icon components load their font through expo-asset; they draw nothing these tests look at.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// The signing overlays (Reanimated, gestures) only render while signing, which these tests don't.
jest.mock('../../components/shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../components/shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../components/shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));

type Ctx = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter> };

// Home and the course page, switched by the router like AppNavigator does (without transitions).
// Unmounted after each test: Home keeps a timer to the next midnight (utils/useDayClock), and a
// tree left mounted would keep Jest waiting for it.
const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

function mount() {
  let ctx: Ctx | null = null;
  function Screens() {
    const app = useAppState();
    const router = useRouter();
    ctx = { app, router };
    return router.screen === 'course' ? <CourseScreen /> : <HomeScreen />;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <RouterProvider>
            <AppStateProvider>
              <Screens />
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

// A text node's string; a kit Chip's label is `[label, null]` (no count), read as the label.
function textOf(children: unknown): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.some((c) => typeof c === 'string') && children.every((c) => typeof c === 'string' || c == null || c === false)) {
    return children.filter((c) => typeof c === 'string').join('');
  }
  return null;
}

function texts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAll((n) => typeof n.type === 'string' && textOf(n.props.children) !== null)
    .map((n) => textOf(n.props.children)!);
}

function press(root: ReturnType<typeof create>, label: string) {
  for (const text of root.root.findAll((n) => typeof n.type === 'string' && n.props.children === label)) {
    let node: ReactTestInstance | null = text;
    while (node && !node.props.onPress) node = node.parent;
    if (node) {
      const target = node;
      act(() => target.props.onPress());
      return;
    }
  }
  throw new Error(`Nothing pressable labelled "${label}"`);
}

describe('Home course hub', () => {
  it('shows placeholder cards, not the first-run card, while the library loads (§17 U13)', () => {
    const { root, ctx } = mount();
    act(() => ctx().app.dispatch({ type: 'library/RETRY_LOAD' }));
    expect(root.root.findAll((n) => n.props.accessibilityRole === 'progressbar' && typeof n.type === 'string').length).toBeGreaterThan(0);
    expect(texts(root)).not.toContain('Add your courses');
    act(() => ctx().app.dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' }));
    expect(root.root.findAll((n) => n.props.accessibilityRole === 'progressbar' && typeof n.type === 'string').length).toBe(0);
  });

  it('shows 4 courses, opens one, and a scan from there is filed into it', () => {
    const { root, ctx } = mount();
    act(() => {
      const { dispatch } = ctx().app;
      dispatch({ type: 'library/CREATE_SEMESTER', semester: { id: 's1', name: 'Fall 2026', startsOn: '2000-01-01' } });
      for (const name of ['Calculus', 'Physics', 'Chemistry', 'English']) {
        dispatch({ type: 'library/CREATE_COURSE', id: name.toLowerCase(), name, fields: { semesterId: 's1' } });
      }
    });

    expect(texts(root)).toEqual(expect.arrayContaining(['Fall 2026', 'Calculus', 'Physics', 'Chemistry', 'English']));

    press(root, 'Physics');
    expect(ctx().router.screen).toBe('course');
    expect(ctx().app.state.libraryUi.activeCourseId).toBe('physics');
    expect(texts(root)).toContain('Nothing in Physics yet');

    press(root, 'Scan into this course');
    // §17 U5: the scanner opens over the course page (ScanLauncher); Review comes when pages land.
    expect(ctx().router.screen).toBe('course');
    expect(ctx().app.state.deliver.courseId).toBe('physics');
    // A "scan now" button: ScanLauncher picks the request up and opens the scanner.
    expect(ctx().app.state.capture.scannerRequested).toBe(true);
  });

  it('offers quick setup when there are no courses yet', () => {
    const { root } = mount();
    expect(texts(root)).toContain('Hi there');
    expect(texts(root)).toContain('Add your courses');
  });

  it('filters a course page by type', () => {
    const { root, ctx } = mount();
    act(() => {
      const { dispatch } = ctx().app;
      dispatch({ type: 'library/CREATE_COURSE', id: 'math', name: 'Math' });
      dispatch({
        type: 'library/SET_FILES',
        files: [
          makeDoc({ id: 'hw', name: 'Homework 1', courseId: 'math', docType: 'assignment' }),
          makeDoc({ id: 'nt', name: 'Lecture notes', courseId: 'math', docType: 'notes' }),
          makeDoc({ id: 'old', name: 'Old scan', courseId: 'math' }),
        ],
      });
    });
    press(root, 'Math');
    expect(texts(root)).toEqual(expect.arrayContaining(['Homework 1', 'Lecture notes', 'Old scan']));

    // §17 U11: kit FilterChips, the count drawn after the label.
    pressId(root, 'course-type-assignment');
    expect(texts(root)).toContain('Homework 1');
    expect(texts(root)).not.toContain('Lecture notes');
    expect(texts(root)).not.toContain('Old scan');

    pressId(root, 'course-type-all');
    expect(texts(root)).toContain('Old scan');
  });
});

function pressId(root: ReturnType<typeof create>, testID: string) {
  const node = root.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`Nothing pressable with testID "${testID}"`);
  act(() => node.props.onPress());
}

// §17 U6: what Home shows, section by section.
describe('Home sections', () => {
  it('greets by first name, or says hi', () => {
    const { root, ctx } = mount();
    expect(texts(root).some((text) => text === 'Hi there')).toBe(true);
    act(() => ctx().app.dispatch({ type: 'settings/SET_PROFILE', profile: { name: 'Rahim Uddin' } }));
    expect(texts(root).some((text) => /^Good (morning|afternoon|evening), Rahim$/.test(text))).toBe(true);
  });

  it('shows Due soon only when something is due, else an Add a deadline chip', () => {
    const { root, ctx } = mount();
    act(() => ctx().app.dispatch({ type: 'library/CREATE_COURSE', id: 'math', name: 'Math' }));
    expect(texts(root)).not.toContain('Due soon');
    expect(texts(root)).toContain('Add a deadline');

    act(() =>
      ctx().app.dispatch({
        type: 'library/ADD_DEADLINE',
        deadline: { id: 'd1', courseId: 'math', title: 'Problem set', dueAt: Date.now() + 86_400_000, reminderIds: [], createdAt: 0 },
      })
    );
    expect(texts(root)).toContain('Due soon');
    expect(texts(root)).not.toContain('Add a deadline');
  });

  it('continues at most three documents and lists five recent ones', () => {
    const { root, ctx } = mount();
    act(() => {
      const { dispatch } = ctx().app;
      dispatch({ type: 'library/SET_FILES', files: Array.from({ length: 6 }, (_, i) => makeDoc({ id: `d${i}`, name: `Doc ${i}`, createdAt: 1000 + i })) });
      for (const id of ['d0', 'd1', 'd2', 'd3']) dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: { id, at: 5000 + Number(id[1]) } });
    });
    const continued = root.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('home-continue-') && typeof n.type === 'string');
    expect(new Set(continued.map((n) => n.props.testID))).toEqual(new Set(['home-continue-d3', 'home-continue-d2', 'home-continue-d1']));
    const recent = new Set(
      root.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('home-recent-')).map((n) => n.props.testID)
    );
    expect(recent.size).toBe(5);
    expect(recent.has('home-recent-d0')).toBe(false);
  });

  it('opens Files with the search open from the search bar', () => {
    const { ctx, root } = mount();
    pressId(root, 'home-search');
    expect(ctx().router.tab).toBe('library');
    expect(ctx().app.state.libraryUi.searchOpen).toBe(true);
  });

  it('scans in a mode from Scan as, and remembers it', () => {
    const { ctx, root } = mount();
    pressId(root, 'home-mode-board');
    expect(ctx().app.state.settings.lastCaptureMode).toBe('board');
    expect(ctx().app.state.capture.scannerRequested).toBe(true);
  });

  it("archives a course from its card's ⋯ menu", () => {
    const { ctx, root } = mount();
    act(() => ctx().app.dispatch({ type: 'library/CREATE_COURSE', id: 'math', name: 'Math' }));
    pressId(root, 'home-course-more-math');
    pressId(root, 'menu-archive');
    expect(ctx().app.state.library.courses.find((c) => c.id === 'math')?.archived).toBe(true);
  });
});

// §6 L4: under the pseudo-locale every catalog string is accented, so English that still shows is
// hard-coded. Home with a course, a document and an Unsorted one shows most of its strings.
describe('Home in the pseudo-locale', () => {
  afterEach(() => act(() => setUiLanguage('system')));

  it('shows no English from the catalog as is', () => {
    const { root, ctx } = mount();
    act(() => {
      setUiLanguage('en-XA');
      const { dispatch } = ctx().app;
      dispatch({ type: 'library/CREATE_SEMESTER', semester: { id: 's1', name: 'Term A', startsOn: '2000-01-01' } });
      dispatch({ type: 'library/CREATE_COURSE', id: 'phy', name: 'Physics', fields: { semesterId: 's1' } });
      dispatch({ type: 'library/CREATE_COURSE', id: 'chem', name: 'Chemistry', fields: { semesterId: 's1' } });
      dispatch({
        type: 'library/SET_FILES',
        files: [makeDoc({ id: 'a', name: 'Waves', courseId: 'phy' }), makeDoc({ id: 'b', name: 'Loose leaf' })],
      });
    });

    const english: string[] = [];
    const collect = (node: unknown) => {
      if (typeof node === 'string') english.push(...node.split(/\{\w+\}/).map((part) => part.trim()).filter((part) => part.length >= 4));
      else if (node && typeof node === 'object') Object.values(node).forEach(collect);
    };
    collect({ home: en.home, common: en.common, shared: en.shared, courses: en.courses });

    // Every text node, the tab bar included (L4d).
    const shown = texts(root);
    expect(shown).toEqual(expect.arrayContaining(['Physics', 'Chemistry']));
    expect(shown.some((text) => text.startsWith('['))).toBe(true);
    for (const text of shown) for (const phrase of english) expect(text).not.toContain(phrase);
  });
});

