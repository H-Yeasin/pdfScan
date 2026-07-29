import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OcrScript } from '../../types/models';
import type { ThemePref } from '../../theme';

const SETTINGS_KEY = 'app:settings';

export type PersistedSettings = {
  themePref: ThemePref;
  firstRun: boolean;
  ocrScript: OcrScript;
};

export async function loadSettings(): Promise<PersistedSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSettings;
  } catch (error) {
    console.warn('Failed to load settings', error);
    return null;
  }
}

export async function persistSettings(settings: PersistedSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
