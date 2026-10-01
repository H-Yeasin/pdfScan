import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider, useRouter } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { CourseScreen } from '../CourseScreen';
import { HomeScreen } from '../HomeScreen';

// Icon components load their font through expo-asset; they draw nothing these tests look at.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// The signing overlays (Reanimated, gestures) only render while signing, which these tests don't.
jest.mock('../../components/shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../components/shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../components/shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));

type Ctx = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter> };

// Home and the course page, switched by the router like AppNavigator does (without transitions).
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
    expect(ctx().app.state.library.activeCourseId).toBe('physics');
    expect(texts(root)).toContain('Nothing in Physics yet');

    press(root, 'Scan into this course');
    expect(ctx().router.screen).toBe('capture');
    expect(ctx().app.state.deliver.courseId).toBe('physics');
  });

  it('offers quick setup when there are no courses yet', () => {
    const { root } = mount();
    expect(texts(root)).toContain('Your courses');
    expect(texts(root)).toContain('Add your courses');
  });
});
