import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { en } from '../../../i18n/en';
import { RouterProvider, useRouter } from '../../../navigation/router';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { ThemeProvider } from '../../../theme';
import { TabBar } from '../../shared/TabBar';
import { ScanLauncher } from '../ScanLauncher';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// The scanner itself is native; what's tested is who asks for it, and how.
const mockRunScanner = jest.fn();
jest.mock('../../../services/capture/scannerPipeline', () => ({
  runNativeScannerPipeline: (...args: unknown[]) => mockRunScanner(...args),
}));
jest.mock('../../../store/useSpaceGuard', () => ({
  useSpaceGuard: () => ({ beforeScan: () => Promise.resolve(true), beforeSave: () => true }),
}));

type Ctx = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter> };

let root: ReactTestRenderer;
afterEach(() => {
  act(() => root.unmount());
  mockRunScanner.mockReset();
});

// The shell's tab bar and the launcher AppNavigator mounts, over an empty screen.
function mount() {
  let ctx: Ctx | null = null;
  function Probe() {
    ctx = { app: useAppState(), router: useRouter() };
    return null;
  }
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <RouterProvider>
            <AppStateProvider>
              <Probe />
              <TabBar />
              <ScanLauncher />
            </AppStateProvider>
          </RouterProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return () => ctx!;
}

// The outermost element with the testID (the kit's Touchable passes it down to its Pressable).
const byTestId = (id: string): ReactTestInstance => root.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];

// Lets the launcher's beforeScan() promise settle.
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('§17 U5 the tab bar', () => {
  it('has four tabs and a Scan button, each named for TalkBack', () => {
    mount();
    const tabs = ['home', 'library', 'tools', 'settings'].map((tab) => byTestId(`tab-${tab}`));
    for (const tab of tabs) expect(tab.props.accessibilityRole).toBe('tab');
    expect(tabs.map((n) => n.props.accessibilityLabel)).toEqual([en.shared.tabs.home, en.shared.tabs.files, en.shared.tabs.tools, en.shared.tabs.me]);
    expect(tabs.map((n) => n.props.accessibilityState.selected)).toEqual([true, false, false, false]);
    const scan = byTestId('tab-scan');
    expect(scan.props.accessibilityRole).toBe('button');
    expect(scan.props.accessibilityLabel).toBe(en.shared.tabs.scan);
  });

  it('switches tabs', () => {
    const ctx = mount();
    act(() => byTestId('tab-tools').props.onPress());
    expect(ctx().router.tab).toBe('tools');
    act(() => byTestId('tab-settings').props.onPress());
    expect(ctx().router.screen).toBe('settings');
  });

  it('a tap on Scan opens the scanner at once, in the last mode, over the tab', async () => {
    const ctx = mount();
    act(() => {
      ctx().app.dispatch({ type: 'settings/SET_LOADED' });
      ctx().app.dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: 'board' });
    });
    act(() => byTestId('tab-scan').props.onPress());
    await flush();
    expect(mockRunScanner).toHaveBeenCalledTimes(1);
    expect(mockRunScanner.mock.calls[0][2]).toMatchObject({ id: 'board' });
    expect(ctx().app.state.capture.scannerRequested).toBe(false);
    // No screen in between: Review is pushed when the pages land (AppNavigator).
    expect(ctx().router.screen).toBe('home');
  });

  it('waits for settings before it launches, so the last mode is known', async () => {
    const ctx = mount();
    act(() => byTestId('tab-scan').props.onPress());
    await flush();
    expect(mockRunScanner).not.toHaveBeenCalled();
    act(() => ctx().app.dispatch({ type: 'settings/SET_LOADED' }));
    await flush();
    expect(mockRunScanner).toHaveBeenCalledTimes(1);
  });

  it('a long-press opens the mode sheet; a mode is remembered and scans', async () => {
    const ctx = mount();
    act(() => ctx().app.dispatch({ type: 'settings/SET_LOADED' }));
    act(() => byTestId('tab-scan').props.onLongPress());
    for (const mode of ['notes', 'doc', 'board', 'book', 'id', 'gallery', 'file']) expect(byTestId(`menu-${mode}`)).toBeDefined();
    act(() => byTestId('menu-book').props.onPress());
    await flush();
    expect(ctx().app.state.settings.lastCaptureMode).toBe('book');
    expect(ctx().app.state.capture.mode).toBe('book');
    expect(mockRunScanner.mock.calls[0][2]).toMatchObject({ id: 'book', postProcess: 'splitSpread' });
  });
});
