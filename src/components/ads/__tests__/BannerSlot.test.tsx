import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { resetAdsSdk, startAds } from '../../../services/ads/adsSdk';
import { grantPass, setEntitlement } from '../../../services/pro/entitlement';
import { REMOTE_DEFAULTS, setRemoteConfig } from '../../../services/remote/remoteConfig';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { BannerSlot } from '../BannerSlot';

const network = Network as unknown as { __setOnline(online: boolean | undefined): void };
type Ctx = ReturnType<typeof useAppState>;

let root: ReactTestRenderer | null = null;

async function mount(): Promise<() => Ctx> {
  let ctx: Ctx | null = null;
  function Probe() {
    ctx = useAppState();
    return <BannerSlot screen="home" />;
  }
  await act(async () => {
    root = create(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    );
  });
  return () => ctx!;
}

// An established student: introduction done, third start.
async function established(ctx: () => Ctx) {
  await act(async () => {
    ctx().dispatch({ type: 'settings/SET_ONBOARDING_DONE', done: true });
    ctx().dispatch({ type: 'settings/COUNT_SESSION', stored: 2 });
  });
}

const banner = () => root!.root.findAll((n) => (n.type as unknown) === 'BannerAd');
// The style of the View the banner sits in.
function slotStyle() {
  let node = banner()[0].parent;
  while (node && !node.props.style) node = node.parent;
  return node?.props.style;
}

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await setEntitlement(null);
  resetAdsSdk();
  network.__setOnline(true);
  setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true });
  await startAds();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  setRemoteConfig(REMOTE_DEFAULTS);
});

describe('BannerSlot', () => {
  it("renders Google's test banner when the policy allows it, with no space until it loads", async () => {
    const ctx = await mount();
    await established(ctx);
    const [ad] = banner();
    expect(ad.props.unitId).toBe('ca-app-pub-3940256099942544/9214589741');
    expect(ad.props.requestOptions).toEqual({ requestNonPersonalizedAdsOnly: false });
    expect(slotStyle()).toMatchObject({ height: 0 });
    await act(async () => ad.props.onAdLoaded({ width: 320, height: 50 }));
    expect(slotStyle()).not.toMatchObject({ height: 0 });
  });

  it('renders nothing when the policy says no', async () => {
    const ctx = await mount();
    // New student: no banner.
    expect(banner()).toHaveLength(0);
    await established(ctx);
    expect(banner()).toHaveLength(1);
    // Offline, a pass, ads switched off: none.
    act(() => network.__setOnline(false));
    expect(banner()).toHaveLength(0);
    act(() => network.__setOnline(true));
    await act(async () => setEntitlement(grantPass(null, Date.now(), 24)));
    expect(banner()).toHaveLength(0);
    await act(async () => setEntitlement(null));
    act(() => setRemoteConfig(REMOTE_DEFAULTS));
    expect(banner()).toHaveLength(0);
  });

  it('follows the Personalised ads toggle', async () => {
    const ctx = await mount();
    await established(ctx);
    await act(async () => ctx().dispatch({ type: 'settings/SET_PERSONALIZED_ADS', enabled: false }));
    expect(banner()[0].props.requestOptions).toEqual({ requestNonPersonalizedAdsOnly: true });
  });

  it('goes away for good when the ad fails to load', async () => {
    const ctx = await mount();
    await established(ctx);
    await act(async () => banner()[0].props.onAdFailedToLoad(new Error('no fill')));
    expect(banner()).toHaveLength(0);
  });
});
