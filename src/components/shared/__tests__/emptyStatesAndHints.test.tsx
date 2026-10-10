import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider, useRouter } from '../../../navigation/router';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { settingsReducer, initialSettingsState } from '../../../store/slices/settingsSlice';
import { ThemeProvider } from '../../../theme';
import { CourseScreen } from '../../../screens/CourseScreen';
import { HomeScreen } from '../../../screens/HomeScreen';
import { EmptyState } from '../EmptyState';
import { en } from '../../../i18n/en';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../components/shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../../components/shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../../components/shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));

type Ctx = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter> };

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

function pressable(root: ReturnType<typeof create>, label: string): ReactTestInstance | null {
  for (const text of root.root.findAll((n) => typeof n.type === 'string' && n.props.children === label)) {
    let node: ReactTestInstance | null = text;
    while (node && !node.props.onPress) node = node.parent;
    if (node) return node;
  }
  return null;
}

describe('empty states', () => {
  it('each renders its action and calls it', () => {
    const onPress = jest.fn();
    const onSecondary = jest.fn();
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        <ThemeProvider>
          <EmptyState title="Nothing" body="Do this" action={{ label: 'Go', onPress }} secondaryAction={{ label: 'Or this', onPress: onSecondary }} />
        </ThemeProvider>
      );
    });
    act(() => pressable(root, 'Go')!.props.onPress());
    act(() => pressable(root, 'Or this')!.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('Home without courses offers to add them', () => {
    const { root } = mount();
    expect(texts(root)).toEqual(expect.arrayContaining([en.home.emptyBody]));
    expect(pressable(root, en.home.emptyButton)).not.toBeNull();
  });

  it('an empty course offers to scan into it, by its code', () => {
    const { root, ctx } = mount();
    act(() => {
      ctx().app.dispatch({ type: 'library/CREATE_COURSE', id: 'c1', name: 'Programming', fields: { code: 'CSE 101' } });
      ctx().app.dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'c1' });
    });
    act(() => ctx().router.go('course'));
    expect(texts(root)).toEqual(expect.arrayContaining([en.courses.page.emptyBody.replace('{course}', 'CSE 101')]));
    expect(pressable(root, en.courses.page.scanInto)).not.toBeNull();
  });
});

describe('the Scan hint', () => {
  it('waits for settings, shows once, and is marked seen when it appears', () => {
    const { root, ctx } = mount();
    expect(texts(root)).not.toContain(en.shared.hint.scan);
    act(() => ctx().app.dispatch({ type: 'settings/SET_LOADED' }));
    expect(texts(root)).toContain(en.shared.hint.scan);
    expect(ctx().app.state.settings.hintsSeen).toEqual(['scan']);

    act(() => pressable(root, en.shared.hint.gotIt)!.props.onPress());
    expect(texts(root)).not.toContain(en.shared.hint.scan);
  });

  it('never shows while a scan is processing', () => {
    const { root, ctx } = mount();
    act(() => {
      ctx().app.dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
      ctx().app.dispatch({ type: 'settings/SET_LOADED' });
    });
    expect(texts(root)).not.toContain(en.shared.hint.scan);
    expect(ctx().app.state.settings.hintsSeen).toEqual([]);
  });

  it('is not shown again once seen', () => {
    const { root, ctx } = mount();
    act(() => {
      ctx().app.dispatch({ type: 'settings/LOAD_HINTS_SEEN', ids: ['scan'] });
      ctx().app.dispatch({ type: 'settings/SET_LOADED' });
    });
    expect(texts(root)).not.toContain(en.shared.hint.scan);
  });
});

describe('hintsSeen', () => {
  it('merges the stored list with hints already shown this session', () => {
    const shown = settingsReducer(initialSettingsState, { type: 'settings/MARK_HINT_SEEN', id: 'scan' });
    expect(settingsReducer(shown, { type: 'settings/MARK_HINT_SEEN', id: 'scan' })).toBe(shown);
    expect(settingsReducer(shown, { type: 'settings/LOAD_HINTS_SEEN', ids: ['submit'] }).hintsSeen.sort()).toEqual(['scan', 'submit']);
  });
});
