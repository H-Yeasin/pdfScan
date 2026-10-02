import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { getUiLanguage, setUiLanguage } from '../../i18n';
import { ThemeProvider } from '../../theme';
import { AppStateProvider, useAppState } from '../AppStateContext';
import { useSettingsPersistence } from '../useSettingsPersistence';

type Ctx = ReturnType<typeof useAppState>;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<() => Ctx> {
  let ctx: Ctx | null = null;
  function Probe() {
    useSettingsPersistence();
    ctx = useAppState();
    return null;
  }
  await act(async () => {
    create(
      <ThemeProvider>
        <AppStateProvider>
          <Probe />
        </AppStateProvider>
      </ThemeProvider>
    );
  });
  await flush();
  return () => ctx!;
}

beforeEach(() => AsyncStorage.clear());

describe('useSettingsPersistence', () => {
  it('keeps the chosen capture mode and first-run state across a restart', async () => {
    const first = await mount();
    expect(first().state.settings).toMatchObject({ loaded: true, firstRun: true, lastCaptureMode: 'doc' });

    await act(async () => {
      first().dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: 'notes' });
      first().dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: false });
    });
    await flush();

    const second = await mount();
    expect(second().state.settings).toMatchObject({ loaded: true, firstRun: false, lastCaptureMode: 'notes' });
  });

  it('ignores an unknown stored mode', async () => {
    await AsyncStorage.setItem(
      'app:settings',
      JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin', lastCaptureMode: 'selfie' })
    );
    const ctx = await mount();
    expect(ctx().state.settings.lastCaptureMode).toBe('doc');
  });
});

describe('§10 M4 settings', () => {
  it('keeps the app lock and the logo across a restart, and reads a bad lock as off', async () => {
    const first = await mount();
    expect(first().state.settings.appLock).toEqual({ enabled: false, after: '1min', hideInRecents: false });
    await act(async () => {
      first().dispatch({ type: 'settings/SET_APP_LOCK', appLock: { enabled: true } });
      first().dispatch({ type: 'settings/SET_APP_LOCK', appLock: { after: '5min' } });
      first().dispatch({ type: 'settings/SET_INSTITUTION_LOGO', name: 'logo_1.png' });
    });
    await flush();
    const second = await mount();
    expect(second().state.settings.appLock).toEqual({ enabled: true, after: '5min', hideInRecents: false });
    expect(second().state.settings.institutionLogo).toBe('logo_1.png');

    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin', appLock: 'on' }));
    const third = await mount();
    expect(third().state.settings.appLock.enabled).toBe(false);
  });
});

describe('student profile', () => {
  it('patches one field at a time and survives a restart', async () => {
    const first = await mount();
    expect(first().state.settings.profile).toEqual({ name: '', roll: '', section: '', institution: '' });

    await act(async () => {
      first().dispatch({ type: 'settings/SET_PROFILE', profile: { name: 'Rahim' } });
      first().dispatch({ type: 'settings/SET_PROFILE', profile: { roll: '2021331045' } });
    });
    expect(first().state.settings.profile).toEqual({ name: 'Rahim', roll: '2021331045', section: '', institution: '' });
    await flush();

    const second = await mount();
    expect(second().state.settings.profile).toEqual({ name: 'Rahim', roll: '2021331045', section: '', institution: '' });
  });

  it('starts empty when settings were saved before the profile existed', async () => {
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin' }));
    const ctx = await mount();
    expect(ctx().state.settings.profile).toEqual({ name: '', roll: '', section: '', institution: '' });
  });
});

describe('naming template', () => {
  it('survives a restart, and an empty stored template means the default', async () => {
    const first = await mount();
    expect(first().state.settings.nameTemplate).toBe('{roll}_{name}_{course}_{type}{n}');
    await act(async () => {
      first().dispatch({ type: 'settings/SET_NAME_TEMPLATE', template: '{course}_{title}' });
    });
    await flush();
    expect((await mount())().state.settings.nameTemplate).toBe('{course}_{title}');

    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin', nameTemplate: ' ' }));
    expect((await mount())().state.settings.nameTemplate).toBe('{roll}_{name}_{course}_{type}{n}');
  });
});

describe('app language (§6 L4a)', () => {
  afterEach(() => setUiLanguage('system'));

  it('survives a restart and is applied to the i18n layer', async () => {
    const first = await mount();
    expect(first().state.settings.uiLanguage).toBe('system');
    await act(async () => {
      first().dispatch({ type: 'settings/SET_UI_LANGUAGE', language: 'en-XA' });
    });
    expect(getUiLanguage()).toBe('en-XA');
    await flush();
    setUiLanguage('system');

    expect((await mount())().state.settings.uiLanguage).toBe('en-XA');
    expect(getUiLanguage()).toBe('en-XA');
  });

  it('reads an unknown stored language as the phone language', async () => {
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin', uiLanguage: 'tlh' }));
    expect((await mount())().state.settings.uiLanguage).toBe('system');
  });
});

describe('privacy choices (§10 M1)', () => {
  it('defaults to personalised ads on and usage counts off', async () => {
    const ctx = await mount();
    expect(ctx().state.settings).toMatchObject({ personalizedAdsEnabled: true, usageStatsEnabled: false });
  });

  it('keeps both choices across a restart', async () => {
    const first = await mount();
    await act(async () => {
      first().dispatch({ type: 'settings/SET_PERSONALIZED_ADS', enabled: false });
      first().dispatch({ type: 'settings/SET_USAGE_STATS', enabled: true });
    });
    await flush();
    expect((await mount())().state.settings).toMatchObject({ personalizedAdsEnabled: false, usageStatsEnabled: true });
  });

  it('reads settings saved before M1 as the defaults', async () => {
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'system', firstRun: false, ocrScript: 'latin' }));
    expect((await mount())().state.settings).toMatchObject({ personalizedAdsEnabled: true, usageStatsEnabled: false });
  });
});
