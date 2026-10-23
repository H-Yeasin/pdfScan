import * as Ads from 'react-native-google-mobile-ads';
import { consentDebugOptions, getAdsSdkState, resetAdsSdk, showAdChoices, startAds } from '../adsSdk';

const mock = Ads as unknown as { consent: { canRequestAds: boolean; gdprApplies: boolean } } & typeof Ads;

// What UMP rejects requestInfoUpdate with while the app has no GDPR message in AdMob (docs/ads.md,
// "Setup details" step 2): seen on the emulator with the release app id, under EEA and NOT_EEA
// debug geography, after which getConsentInfo() still said canRequestAds: true.
const NO_FORM = Object.assign(
  new Error("Publisher misconfiguration: Failed to read publisher's account configuration; no form(s) configured for the input app ID."),
  { code: 'consent-update-failed' }
);

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

  it('runs the consent step in a dev build too, as a release build does', async () => {
    expect(__DEV__).toBe(true);
    await startAds();
    expect(Ads.AdsConsent.gatherConsent).toHaveBeenCalledTimes(1);
  });

  // Google's flow (UMP "Get started"): an error in the consent step is logged, and ads still run
  // when canRequestAds allows them (UMP keeps an earlier run's answer).
  it('starts when the consent step fails but UMP still allows ads', async () => {
    (Ads.AdsConsent.gatherConsent as jest.Mock).mockRejectedValueOnce(NO_FORM);
    await startAds();
    expect(getAdsSdkState()).toEqual({ status: 'ready', gdprApplies: false });
    expect(Ads.default().initialize).toHaveBeenCalledTimes(1);
  });

  it('stays off when the consent step fails and UMP has no answer: an SDK problem, not a refusal', async () => {
    mock.consent.canRequestAds = false;
    (Ads.AdsConsent.gatherConsent as jest.Mock).mockRejectedValueOnce(NO_FORM);
    await startAds();
    // 'sdk', not 'consent': Ad choices can't change an answer that was never asked for.
    expect(getAdsSdkState()).toEqual({ status: 'unavailable', gdprApplies: false, reason: 'sdk' });
    expect(Ads.default().initialize).not.toHaveBeenCalled();
  });

  it('stays off when the SDK fails to start', async () => {
    (Ads.default().initialize as jest.Mock).mockRejectedValueOnce(new Error('no Play services'));
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

describe('consentDebugOptions', () => {
  const geographies = Ads.AdsConsentDebugGeography;

  it('gives a release build nothing, whatever is set', () => {
    expect(consentDebugOptions(geographies, false, 'EEA', 'abc')).toEqual({});
  });

  it("passes a dev build's debug geography and test devices", () => {
    expect(consentDebugOptions(geographies, true, 'EEA', ' 33BE22 , 9F01AA ,')).toEqual({
      debugGeography: geographies.EEA,
      testDeviceIdentifiers: ['33BE22', '9F01AA'],
    });
    expect(consentDebugOptions(geographies, true, 'NOT_EEA', undefined)).toEqual({ debugGeography: geographies.NOT_EEA });
  });

  it('ignores a geography it does not know, and nothing set', () => {
    expect(consentDebugOptions(geographies, true, 'MARS', '')).toEqual({});
    expect(consentDebugOptions(geographies, true, undefined, undefined)).toEqual({});
  });
});
