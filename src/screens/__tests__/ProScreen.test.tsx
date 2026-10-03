import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { AccentPicker } from '../../components/settings/AccentPicker';
import { RouterProvider, useRouter } from '../../navigation/router';
import { resetAdsSdk } from '../../services/ads/adsSdk';
import { setEntitlement } from '../../services/pro/entitlement';
import { REMOTE_DEFAULTS, setRemoteConfig } from '../../services/remote/remoteConfig';
import { AppStateProvider } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { ProScreen } from '../ProScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

let root: ReactTestRenderer | null = null;

async function render(children: React.ReactNode) {
  let router!: ReturnType<typeof useRouter>;
  function Probe() {
    router = useRouter();
    return <>{children}</>;
  }
  await act(async () => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AppStateProvider>
            <RouterProvider>
              <Probe />
            </RouterProvider>
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  // The pass log loads from the secure store.
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return () => router;
}

const texts = () => root!.root.findAll((n) => n.type === Text).map((n) => [n.props.children].flat().join(''));

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await setEntitlement(null);
  resetAdsSdk();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  setRemoteConfig(REMOTE_DEFAULTS);
});

describe('ProScreen', () => {
  it('offers the pass with no price or purchase button', async () => {
    setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true });
    await render(<ProScreen />);
    const all = texts();
    expect(all).toContain('Watch an ad, get Pro for 24 hours');
    expect(all).toContain('3 passes left today');
    expect(all).toContain('More cover page designs');
    expect(all.some((s) => /৳|\$|price|buy|purchase|restore/i.test(s))).toBe(false);
  });

  it('shows no button while ads are off', async () => {
    await render(<ProScreen />);
    expect(texts()).not.toContain('Watch an ad, get Pro for 24 hours');
    expect(texts()).toContain("Ads aren't available right now, so the pass can't be offered. Try again later.");
  });
});

describe('entry points', () => {
  it('a Pro accent opens the Pro screen instead of a popup', async () => {
    const router = await render(<AccentPicker />);
    const rose = root!.root.findAll((n) => n.props.accessibilityLabel === 'Rose accent' && n.props.onPress)[0];
    await act(async () => rose.props.onPress());
    expect(router().screen).toBe('pro');
  });
});
