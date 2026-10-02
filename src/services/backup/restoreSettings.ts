import { isDocumentLanguage, isUiLanguage, PSEUDO_LOCALE } from '../../i18n';
import type { SettingsAction, SettingsState } from '../../store/slices/settingsSlice';
import { initialSettingsState } from '../../store/slices/settingsSlice';
import type { ThemePref } from '../../theme';
import { isCaptureMode } from '../capture/captureModes';
import { sanitizeDefaultEnhance, type PersistedSettings } from '../persistence/settingsStorage';
import { normalizeProfile } from '../submit/profile';
import { parseOcrScript } from '../scripts/registry';
import type { StudentProfile } from '../../types/models';

// §8 B4: a full backup's settings.json, applied only where the student hasn't set anything on this
// phone yet (a value still at its default), and only after asking once. A fresh install takes
// everything; a phone that's been in use keeps its own choices.

export type SettingsFromBackup = {
  actions: SettingsAction[];
  themePref?: ThemePref;
};

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];

export function settingsFromBackup(
  backup: Partial<PersistedSettings>,
  current: SettingsState,
  currentTheme: ThemePref,
  defaults: SettingsState = initialSettingsState
): SettingsFromBackup {
  const actions: SettingsAction[] = [];
  const out: SettingsFromBackup = { actions };

  if (currentTheme === 'system' && THEMES.includes(backup.themePref as ThemePref) && backup.themePref !== 'system') {
    out.themePref = backup.themePref;
  }
  const script = parseOcrScript(backup.ocrScript);
  if (current.ocrScript === defaults.ocrScript && script && script !== current.ocrScript) {
    actions.push({ type: 'settings/SET_OCR_SCRIPT', script });
  }
  if (Object.keys(current.defaultEnhanceByMode).length === 0) {
    const byMode = sanitizeDefaultEnhance(backup.defaultEnhanceByMode);
    if (Object.keys(byMode).length > 0) actions.push({ type: 'settings/LOAD_DEFAULT_ENHANCE', byMode });
  }
  if (current.lastCaptureMode === defaults.lastCaptureMode && isCaptureMode(backup.lastCaptureMode) && backup.lastCaptureMode !== current.lastCaptureMode) {
    actions.push({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: backup.lastCaptureMode });
  }

  // The profile field by field: a name typed on this phone stays, an empty roll is filled in.
  if (backup.profile) {
    const incoming = normalizeProfile(backup.profile);
    const patch: Partial<StudentProfile> = {};
    for (const key of Object.keys(incoming) as (keyof StudentProfile)[]) {
      const here = current.profile[key];
      const there = incoming[key];
      if ((here === undefined || here === '') && there !== undefined && there !== '') (patch as Record<string, unknown>)[key] = there;
    }
    if (Object.keys(patch).length > 0) actions.push({ type: 'settings/SET_PROFILE', profile: patch });
  }
  if (
    current.nameTemplate === defaults.nameTemplate &&
    typeof backup.nameTemplate === 'string' &&
    backup.nameTemplate.trim() &&
    backup.nameTemplate !== current.nameTemplate
  ) {
    actions.push({ type: 'settings/SET_NAME_TEMPLATE', template: backup.nameTemplate });
  }
  if (!current.profilePrompted && backup.profilePrompted === true) actions.push({ type: 'settings/SET_PROFILE_PROMPTED' });
  if (!current.unsortedPromptDone && backup.unsortedPromptDone === true) actions.push({ type: 'settings/SET_UNSORTED_PROMPT_DONE' });
  if (
    current.uiLanguage === defaults.uiLanguage &&
    isUiLanguage(backup.uiLanguage) &&
    backup.uiLanguage !== PSEUDO_LOCALE &&
    backup.uiLanguage !== current.uiLanguage
  ) {
    actions.push({ type: 'settings/SET_UI_LANGUAGE', language: backup.uiLanguage });
  }
  if (current.documentLanguage === defaults.documentLanguage && isDocumentLanguage(backup.documentLanguage) && backup.documentLanguage !== current.documentLanguage) {
    actions.push({ type: 'settings/SET_DOCUMENT_LANGUAGE', language: backup.documentLanguage });
  }
  return out;
}

export function hasSettingsToApply(result: SettingsFromBackup): boolean {
  return result.actions.length > 0 || result.themePref !== undefined;
}
