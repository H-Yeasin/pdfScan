import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CaptureMode, EnhanceMode, OcrScript, StudentProfile } from '../../types/models';
import type { ThemePref } from '../../theme';
import { FILTERS } from '../enhance/filters/registry';

const SETTINGS_KEY = 'app:settings';

// Filter IDs are session-only and may be renamed (E1 renamed document_scan); a stored ID that no
// longer exists is dropped rather than handed to the registry.
export function sanitizeDefaultEnhance(raw: Partial<Record<CaptureMode, EnhanceMode>> | undefined) {
  const valid = new Set<string>(FILTERS.filter((spec) => spec.available).map((spec) => spec.id));
  const out: Partial<Record<CaptureMode, EnhanceMode>> = {};
  for (const [mode, enhance] of Object.entries(raw ?? {})) if (enhance && valid.has(enhance)) out[mode as CaptureMode] = enhance;
  return out;
}

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
  // Optional: added in §8 B3.
  lastBackupAt?: number | null;
  lastBackupBytes?: number | null;
  backupFolderUri?: string | null;
  backupFolderLabel?: string | null;
  // Optional: added in §8 B5.
  backupReminderSnoozedUntil?: number | null;
  autoBackup?: string;
  lastAutoBackupAt?: number | null;
  autoBackupUris?: string[];
  // Optional: added in §9 O2.
  onboardingDone?: boolean;
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
