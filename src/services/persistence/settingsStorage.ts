import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CaptureMode, EnhanceMode, OcrScript, StudentProfile } from '../../types/models';
import type { ThemePref } from '../../theme';

const SETTINGS_KEY = 'app:settings';

export type PersistedSettings = {
  themePref: ThemePref;
  firstRun: boolean;
  ocrScript: OcrScript;
  androidExportFolderUri?: string | null;
  androidExportFolderLabel?: string | null;
  // Optional: settings saved before E6 don't have it.
  defaultEnhanceByMode?: Partial<Record<CaptureMode, EnhanceMode>>;
  crashReportsEnabled?: boolean;
  lastCaptureMode?: CaptureMode;
  scannerUnavailable?: boolean;
  lastOpened?: { id: string; at: number } | null;
  // Optional: settings saved before §4 S1 don't have it (see normalizeProfile).
  profile?: StudentProfile;
  // Optional: added in §4 S2.
  nameTemplate?: string;
  // Optional: added in §4 S6.
  profilePrompted?: boolean;
  // Optional: added in §3 K6.
  unsortedPromptDone?: boolean;
  // Optional: added in §6 L4a. Unknown values read as 'system'.
  uiLanguage?: string;
  // Optional: added in §6 L4c. Unknown values read as 'ui'.
  documentLanguage?: string;
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
