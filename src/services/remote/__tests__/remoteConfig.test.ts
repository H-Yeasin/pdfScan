import {
  REMOTE_DEFAULTS,
  getRemoteConfig,
  isVersionBelow,
  loadRemoteConfig,
  parseRemoteConfig,
  remoteValuesOf,
  setRemoteConfig,
} from '../remoteConfig';

const mockApps: unknown[] = [];
let mockStored: Record<string, string> = {};
let mockFetched: Record<string, string> | 'offline' = {};

jest.mock('@react-native-firebase/app', () => ({ getApps: () => mockApps }));
jest.mock('@react-native-firebase/remote-config', () => {
  const value = (v: string | undefined) => ({ getSource: () => (v === undefined ? 'static' : 'remote'), asString: () => v ?? '' });
  return {
    getRemoteConfig: () => ({ settings: {} }),
    ensureInitialized: async () => undefined,
    getAll: () => Object.fromEntries(Object.entries(mockStored).map(([k, v]) => [k, value(v)])),
    fetchAndActivate: async () => {
      if (mockFetched === 'offline') throw new Error('network');
      mockStored = { ...mockStored, ...mockFetched };
      return true;
    },
  };
});

beforeEach(() => {
  setRemoteConfig(REMOTE_DEFAULTS);
  mockApps.length = 0;
  mockStored = {};
  mockFetched = {};
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('parseRemoteConfig', () => {
  it('starts from safe defaults: ads and sales off', () => {
    expect(parseRemoteConfig({})).toEqual(REMOTE_DEFAULTS);
    expect(REMOTE_DEFAULTS).toMatchObject({ adsEnabled: false, proSalesEnabled: false, passHours: 24, passMaxPerDay: 3 });
  });

  it('coerces console strings to their types', () => {
    expect(
      parseRemoteConfig({
        ads_enabled: 'true',
        ads_banner_screens: '["home"]',
        ads_banner_unit_android: 'ca-app-pub-1234567890123456/1234567890',
        ads_banner_unit_ios: 'not-a-unit',
        pass_hours: '12',
        pass_max_per_day: '0',
        support_whatsapp: '8801700000000',
        support_email: 'help@example.com',
        pro_sales_enabled: '1',
        min_supported_version: '1.2.0',
      })
    ).toEqual({
      adsEnabled: true,
      adsBannerScreens: ['home'],
      adsBannerUnitAndroid: 'ca-app-pub-1234567890123456/1234567890',
      adsBannerUnitIos: '',
      adsRewardedUnitAndroid: '',
      adsRewardedUnitIos: '',
      passHours: 12,
      passMaxPerDay: 0,
      supportWhatsapp: '8801700000000',
      supportEmail: 'help@example.com',
      proSalesEnabled: true,
      minSupportedVersion: '1.2.0',
    });
  });

  it('keeps the default for a value of the wrong type or out of range', () => {
    expect(
      parseRemoteConfig({
        ads_enabled: 'yes',
        ads_banner_screens: 'home,library',
        pass_hours: '0',
        pass_max_per_day: '2.5',
        support_whatsapp: '+880 1645-724080',
        support_email: 'not an address',
        min_supported_version: 'v2',
      })
    ).toEqual(REMOTE_DEFAULTS);
    expect(parseRemoteConfig({ pass_hours: '', ads_banner_screens: '[1, 2]' })).toEqual(REMOTE_DEFAULTS);
  });

  it('accepts empty optional strings but never an empty WhatsApp number', () => {
    const config = parseRemoteConfig({ support_email: '', min_supported_version: '', support_whatsapp: '' });
    expect(config.supportEmail).toBe('');
    expect(config.minSupportedVersion).toBe('');
    expect(config.supportWhatsapp).toBe(REMOTE_DEFAULTS.supportWhatsapp);
  });

  it('ignores keys it does not know', () => {
    const config = parseRemoteConfig({ ads_enabled: 'true', some_future_key: 'x' });
    expect(config).toEqual({ ...REMOTE_DEFAULTS, adsEnabled: true });
    expect(config).not.toHaveProperty('some_future_key');
  });
});

describe('remoteValuesOf', () => {
  it('keeps only values set in the console', () => {
    const v = (source: string, s: string) => ({ getSource: () => source, asString: () => s });
    expect(remoteValuesOf({ a: v('remote', 'true'), b: v('static', ''), c: v('default', 'x') })).toEqual({ a: 'true' });
  });
});

describe('isVersionBelow', () => {
  it('compares versions part by part', () => {
    expect(isVersionBelow('1.2.0', '1.10')).toBe(true);
    expect(isVersionBelow('1.10.0', '1.2')).toBe(false);
    expect(isVersionBelow('1.0', '1.0.0')).toBe(false);
    expect(isVersionBelow('1.0.0', '')).toBe(false);
  });
});

describe('loadRemoteConfig', () => {
  it('keeps the defaults when the build has no Firebase', async () => {
    await loadRemoteConfig();
    expect(getRemoteConfig()).toEqual(REMOTE_DEFAULTS);
  });

  it('applies freshly fetched values', async () => {
    mockApps.push({});
    mockFetched = { ads_enabled: 'true', pass_hours: '48' };
    await loadRemoteConfig();
    expect(getRemoteConfig()).toMatchObject({ adsEnabled: true, passHours: 48 });
  });

  it('uses the values cached from the last fetch when offline', async () => {
    mockApps.push({});
    mockStored = { ads_enabled: 'true' };
    mockFetched = 'offline';
    await loadRemoteConfig();
    expect(getRemoteConfig()).toEqual({ ...REMOTE_DEFAULTS, adsEnabled: true });
  });

  it('keeps the defaults when offline with nothing cached', async () => {
    mockApps.push({});
    mockFetched = 'offline';
    await loadRemoteConfig();
    expect(getRemoteConfig()).toEqual(REMOTE_DEFAULTS);
  });
});
