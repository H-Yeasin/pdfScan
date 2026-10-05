import * as Ads from 'react-native-google-mobile-ads';
import { getAdsSdkState, resetAdsSdk, showAdChoices, startAds } from '../adsSdk';

const mock = Ads as unknown as { consent: { canRequestAds: boolean; gdprApplies: boolean } } & typeof Ads;

beforeEach(() => {
  resetAdsSdk();
  mock.consent.canRequestAds = true;
  mock.consent.gdprApplies = false;
  jest.clearAllMocks();
});

describe('startAds', () => {
  it('asks for consent first, then initialises with a 13+ content rating', async () => {
    await startAds();
    expect(getAdsSdkState()).toEqual({ status: 'ready', gdprApplies: false });
    expect(Ads.AdsConsent.gatherConsent).toHaveBeenCalledTimes(1);
    expect(Ads.default().setRequestConfiguration).toHaveBeenCalledWith({ maxAdContentRating: 'T' });
    expect(Ads.default().initialize).toHaveBeenCalledTimes(1);
  });

  it("doesn't initialise when consent doesn't allow ads", async () => {
    mock.consent.canRequestAds = false;
    mock.consent.gdprApplies = true;
    await startAds();
    expect(getAdsSdkState()).toEqual({ status: 'unavailable', gdprApplies: true, reason: 'consent' });
    expect(Ads.default().initialize).not.toHaveBeenCalled();
  });

  it('runs once', async () => {
    await startAds();
    await startAds();
    expect(Ads.AdsConsent.gatherConsent).toHaveBeenCalledTimes(1);
  });

  it('stays off on an error', async () => {
    (Ads.AdsConsent.gatherConsent as jest.Mock).mockRejectedValueOnce(new Error('no network'));
    await startAds();
    expect(getAdsSdkState()).toMatchObject({ status: 'unavailable', reason: 'sdk' });
  });

  it('shows Ad choices, then starts again with the new answer', async () => {
    mock.consent.canRequestAds = false;
    await startAds();
    expect(getAdsSdkState().reason).toBe('consent');
    mock.consent.canRequestAds = true;
    await showAdChoices();
    expect(Ads.AdsConsent.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(getAdsSdkState()).toMatchObject({ status: 'ready' });
  });
});
