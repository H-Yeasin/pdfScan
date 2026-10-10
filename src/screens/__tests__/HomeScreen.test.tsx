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
  return { root, ctx: () => ctx! };
}

function texts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
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
    expect(ctx().router.screen).toBe('capture');
    expect(ctx().app.state.deliver.courseId).toBe('physics');
    // A "scan now" button: Capture opens the scanner on arrival (the Scan tab doesn't).
    expect(ctx().app.state.capture.scannerRequested).toBe(true);
  });

  it('offers quick setup when there are no courses yet', () => {
    const { root } = mount();
    expect(texts(root)).toContain('Your courses');
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
    expect(texts(root)).toEqual(expect.arrayContaining(['Homework 1', 'Lecture notes', 'Old scan', 'All 3']));

    press(root, 'Assignments 1');
    expect(texts(root)).toContain('Homework 1');
    expect(texts(root)).not.toContain('Lecture notes');
    expect(texts(root)).not.toContain('Old scan');

    press(root, 'All 3');
    expect(texts(root)).toContain('Old scan');
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
        files: [makeDoc({ id: 'a', name: 'Waves', courseId: 'phy' }), makeDoc({ id: 'b', name: 'Loose page' })],
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

