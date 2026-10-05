import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Ads from 'react-native-google-mobile-ads';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { t } from '../../../i18n';
import { RouterProvider } from '../../../navigation/router';
import { resetAdsSdk } from '../../../services/ads/adsSdk';
import { resetRewarded } from '../../../services/ads/rewarded';
import { setEntitlement } from '../../../services/pro/entitlement';
import { REMOTE_DEFAULTS, setRemoteConfig } from '../../../services/remote/remoteConfig';
import { AppStateProvider } from '../../../store/AppStateContext';
import { ThemeProvider } from '../../../theme';
import { useProTask } from '../useProTask';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

type Mock = typeof Ads & { rewardedBehaviour: { loads: boolean; script: string[] } };
const mock = Ads as unknown as Mock;
const network = Network as unknown as { __setOnline(online: boolean | undefined): void };

// Past useProTask's sheet fade-out (300 ms) and the fake ad's load.
async function settle(ms = 400) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const textOf = (node: { props: { children?: unknown } }): string => {
  const c = node.props.children;
  return Array.isArray(c) ? c.join('') : typeof c === 'string' ? c : '';
};
const shows = (root: ReactTestRenderer, text: string) => root.root.findAll((n) => n.type === Text && textOf(n) === text).length > 0;
// The innermost pressable around the label (the sheet's backdrop is one too, around everything).
const press = async (root: ReactTestRenderer, label: string) => {
  const around = root.root.findAll(
    (n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.type === Text && textOf(c) === label).length > 0
  );
  const button = around[around.length - 1];
  await act(async () => {
    button.props.onPress();
  });
};

let mounted: ReactTestRenderer | null = null;

async function mount(run: jest.Mock): Promise<{ root: ReactTestRenderer; start: () => Promise<void> }> {
  let start!: () => Promise<void>;
  function Probe() {
    const gate = useProTask('convert');
    start = () => gate.start({ kind: 'docxToPdf', docId: 'doc1', title: 'Handout.docx', run });
    return gate.element;
  }
  let root!: ReactTestRenderer;
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
  mounted = root;
  return { root, start: () => act(() => start()) };
}

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await AsyncStorage.clear();
  await setEntitlement(null);
  resetAdsSdk();
  resetRewarded();
  setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true });
  mock.rewardedBehaviour.loads = true;
  mock.rewardedBehaviour.script = ['rewarded_earned_reward', 'closed'];
  network.__setOnline(true);
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
});

afterAll(() => setRemoteConfig(REMOTE_DEFAULTS));

describe('useProTask', () => {
  it("shows The ad couldn't load with Try again when online and no ad loads, and runs nothing", async () => {
    mock.rewardedBehaviour.loads = false;
    const run = jest.fn();
    const { root, start } = await mount(run);
    await start();
    expect(shows(root, t('pro.task.watch'))).toBe(true);

    await press(root, t('pro.task.watch'));
    await settle();
    expect(run).not.toHaveBeenCalled();
    expect(shows(root, t('pro.task.adUnavailable.title'))).toBe(true);
    expect(shows(root, t('pro.task.adUnavailable.noFill'))).toBe(true);
    expect(Ads.RewardedAd.createForAdRequest).toHaveBeenCalledTimes(1);

    // Try again asks for the ad again, with the same request; this time it loads.
    mock.rewardedBehaviour.loads = true;
    await press(root, t('pro.task.tryAgain'));
    await settle();
    expect(Ads.RewardedAd.createForAdRequest).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(shows(root, t('pro.task.adUnavailable.title'))).toBe(false);
  });

  it('runs the task after the ad is watched to the end', async () => {
    const run = jest.fn();
    const { root, start } = await mount(run);
    await start();
    await press(root, t('pro.task.watch'));
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
