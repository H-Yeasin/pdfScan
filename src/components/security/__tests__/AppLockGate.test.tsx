import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { useSettingsPersistence } from '../../../store/useSettingsPersistence';
import { ThemeProvider } from '../../../theme';
import { AppLockGate } from '../AppLockGate';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const auth = LocalAuthentication as unknown as {
  authenticateAsync: jest.Mock;
  __setResult(r: { success: boolean; error?: string }): void;
  __reset(): void;
};

type Ctx = ReturnType<typeof useAppState>;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// The gate as AppNavigator uses it, around a stand-in for the screens (the Reader an "Open with"
// file was routed to).
async function mount(): Promise<{ root: ReactTestRenderer; ctx: () => Ctx }> {
  let ctx: Ctx | null = null;
  function Probe() {
    useSettingsPersistence();
    ctx = useAppState();
    return (
      <AppLockGate>
        <Text>Reader: notes.pdf</Text>
      </AppLockGate>
    );
  }
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <ThemeProvider>
        <AppStateProvider>
          <Probe />
        </AppStateProvider>
      </ThemeProvider>
    );
  });
  await flush();
  return { root, ctx: () => ctx! };
}

const shows = (root: ReactTestRenderer, text: string) => root.root.findAll((n) => n.type === Text && n.props.children === text).length > 0;

beforeEach(async () => {
  await AsyncStorage.clear();
  auth.__reset();
});

describe('AppLockGate', () => {
  it('shows the app straight away when the lock is off', async () => {
    const { root } = await mount();
    expect(shows(root, 'Reader: notes.pdf')).toBe(true);
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('starts locked, with nothing of the app (or an opened file) underneath, until unlocked', async () => {
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin', appLock: { enabled: true, after: '1min' } }));
    auth.__setResult({ success: false, error: 'user_cancel' });
    const { root } = await mount();
    expect(shows(root, 'PDF Scan is locked')).toBe(true);
    expect(shows(root, 'Reader: notes.pdf')).toBe(false);
    expect(auth.authenticateAsync).toHaveBeenCalledTimes(1);

    auth.__setResult({ success: true });
    const unlock = root.root.findAll((n) => n.type === Text && n.props.children === 'Unlock')[0];
    let node = unlock.parent;
    while (node && !node.props.onPress) node = node.parent;
    await act(async () => node!.props.onPress());
    await flush();
    expect(shows(root, 'Reader: notes.pdf')).toBe(true);
  });

  it('unlocks when the lock is turned off', async () => {
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin', appLock: { enabled: true } }));
    auth.__setResult({ success: false, error: 'user_cancel' });
    const { root, ctx } = await mount();
    expect(shows(root, 'Reader: notes.pdf')).toBe(false);
    await act(async () => ctx().dispatch({ type: 'settings/SET_APP_LOCK', appLock: { enabled: false } }));
    expect(shows(root, 'Reader: notes.pdf')).toBe(true);
  });
});
