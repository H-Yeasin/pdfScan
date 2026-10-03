import { bannerBlock, bannerUnitId, MIN_SESSIONS_FOR_ADS, nonPersonalizedOnly, shouldShowBanner, type BannerInputs } from '../adPolicy';
import { REMOTE_DEFAULTS } from '../../remote/remoteConfig';
import { PRO_FEATURES } from '../../pro/proFeatures';

// Every input set so a banner may show; each test changes one.
const OK: BannerInputs = {
  remote: { adsEnabled: true, adsBannerScreens: ['home', 'library'] },
  screen: 'home',
  onboardingDone: true,
  sessions: MIN_SESSIONS_FOR_ADS,
  isPro: false,
  online: true,
  processing: false,
  sdkReady: true,
  unitId: 'ca-app-pub-1/2',
};

describe('adPolicy', () => {
  it('shows a banner on Home and Library when every rule allows it', () => {
    expect(shouldShowBanner(OK)).toBe(true);
    expect(shouldShowBanner({ ...OK, screen: 'library' })).toBe(true);
  });

  it.each<[string, Partial<BannerInputs>, ReturnType<typeof bannerBlock>]>([
    ['ads switched off in Remote Config', { remote: { ...OK.remote, adsEnabled: false } }, 'adsOff'],
    ['a screen left out of ads_banner_screens', { remote: { ...OK.remote, adsBannerScreens: ['library'] } }, 'screen'],
    ['the introduction not done', { onboardingDone: false }, 'onboarding'],
    ['the first two starts', { sessions: MIN_SESSIONS_FOR_ADS - 1 }, 'newUser'],
    ['a Pro pass', { isPro: true }, 'pro'],
    ['offline', { online: false }, 'offline'],
    ['network not known yet', { online: null }, 'offline'],
    ['a scan being processed', { processing: true }, 'processing'],
    ['the SDK not ready (or no consent)', { sdkReady: false }, 'sdk'],
    ['no banner unit configured', { unitId: '' }, 'noUnit'],
  ])('no banner with %s', (_name, change, block) => {
    expect(bannerBlock({ ...OK, ...change })).toBe(block);
    expect(shouldShowBanner({ ...OK, ...change })).toBe(false);
  });

  it('is off with the bundled Remote Config defaults', () => {
    expect(shouldShowBanner({ ...OK, remote: REMOTE_DEFAULTS })).toBe(false);
  });

  it('starts on the third session', () => {
    expect(MIN_SESSIONS_FOR_ADS).toBe(3);
  });

  it('lists "no banners" as a live Pro feature that stops when Pro ends', () => {
    expect(PRO_FEATURES.find((f) => f.id === 'noBanners')).toMatchObject({ status: 'live', lapse: 'stop' });
  });
});

describe('bannerUnitId', () => {
  const remote = { adsBannerUnitAndroid: 'ca-app-pub-1/2', adsBannerUnitIos: 'ca-app-pub-3/4' };
  it("uses Google's test unit in development builds", () => {
    expect(bannerUnitId('android', remote, true, 'TEST')).toBe('TEST');
  });
  it('uses the platform unit from Remote Config in release builds', () => {
    expect(bannerUnitId('android', remote, false, 'TEST')).toBe('ca-app-pub-1/2');
    expect(bannerUnitId('ios', remote, false, 'TEST')).toBe('ca-app-pub-3/4');
    expect(bannerUnitId('web', remote, false, 'TEST')).toBe('');
  });
});

describe('personalisation', () => {
  it('follows the toggle outside consent regions', () => {
    expect(nonPersonalizedOnly(false, true)).toBe(false);
    expect(nonPersonalizedOnly(false, false)).toBe(true);
  });
  it('leaves it to the consent form where the law needs consent', () => {
    expect(nonPersonalizedOnly(true, false)).toBe(false);
  });
});
