import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
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
