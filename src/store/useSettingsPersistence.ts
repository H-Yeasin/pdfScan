import { useEffect } from 'react';
import { PSEUDO_LOCALE, isDocumentLanguage, isUiLanguage, setDocumentLanguage, setUiLanguage } from '../i18n';
import { isCaptureMode } from '../services/capture/captureModes';
import { loadSettings, persistSettings, sanitizeDefaultEnhance } from '../services/persistence/settingsStorage';
import { normalizeProfile } from '../services/submit/profile';
import { isAutoBackupFrequency } from '../services/backup/schedule';
import { useAppDispatch, useAppSlices } from './AppStateContext';
import { useTheme } from '../theme';

export function useSettingsPersistence() {
  const dispatch = useAppDispatch();
  const state = useAppSlices('settings');
  const { themePref, setThemePref } = useTheme();
  const { loaded } = state.settings;

  useEffect(() => {
    loadSettings().then((settings) => {
      if (settings) {
        setThemePref(settings.themePref);
        dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: settings.firstRun });
        dispatch({ type: 'settings/SET_OCR_SCRIPT', script: settings.ocrScript });
        dispatch({
          type: 'settings/SET_ANDROID_EXPORT_FOLDER',
          uri: settings.androidExportFolderUri ?? null,
          label: settings.androidExportFolderLabel ?? null,
        });
        dispatch({ type: 'settings/LOAD_DEFAULT_ENHANCE', byMode: sanitizeDefaultEnhance(settings.defaultEnhanceByMode) });
        dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled: settings.crashReportsEnabled === true });
        dispatch({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: settings.scannerUnavailable === true });
        const opened = settings.lastOpened;
        if (opened && typeof opened.id === 'string' && typeof opened.at === 'number') {
          dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: opened });
        }
        dispatch({ type: 'settings/SET_PROFILE', profile: normalizeProfile(settings.profile) });
        if (settings.profilePrompted === true) dispatch({ type: 'settings/SET_PROFILE_PROMPTED' });
        if (settings.unsortedPromptDone === true) dispatch({ type: 'settings/SET_UNSORTED_PROMPT_DONE' });
        // An emptied template would name nothing; the default is the better reading of it.
        if (typeof settings.nameTemplate === 'string' && settings.nameTemplate.trim()) {
          dispatch({ type: 'settings/SET_NAME_TEMPLATE', template: settings.nameTemplate });
        }
        // The pseudo-locale only exists in development builds.
        if (isUiLanguage(settings.uiLanguage) && (settings.uiLanguage !== PSEUDO_LOCALE || __DEV__)) {
          dispatch({ type: 'settings/SET_UI_LANGUAGE', language: settings.uiLanguage });
        }
        if (isDocumentLanguage(settings.documentLanguage)) {
          dispatch({ type: 'settings/SET_DOCUMENT_LANGUAGE', language: settings.documentLanguage });
        }
        if (typeof settings.lastBackupAt === 'number') {
          dispatch({
            type: 'settings/SET_LAST_BACKUP',
            at: settings.lastBackupAt,
            bytes: typeof settings.lastBackupBytes === 'number' ? settings.lastBackupBytes : null,
          });
        }
        if (settings.onboardingDone === true) dispatch({ type: 'settings/SET_ONBOARDING_DONE', done: true });
        if (typeof settings.backupReminderSnoozedUntil === 'number') {
          dispatch({ type: 'settings/SNOOZE_BACKUP_REMINDER', until: settings.backupReminderSnoozedUntil });
        }
        if (isAutoBackupFrequency(settings.autoBackup)) dispatch({ type: 'settings/SET_AUTO_BACKUP', frequency: settings.autoBackup });
        dispatch({
          type: 'settings/LOAD_AUTO_BACKUP_STATE',
          lastAt: typeof settings.lastAutoBackupAt === 'number' ? settings.lastAutoBackupAt : null,
          uris: Array.isArray(settings.autoBackupUris) ? settings.autoBackupUris.filter((u): u is string => typeof u === 'string') : [],
        });
        if (typeof settings.backupFolderUri === 'string') {
          dispatch({ type: 'settings/SET_BACKUP_FOLDER', uri: settings.backupFolderUri, label: settings.backupFolderLabel ?? null });
        }
        if (isCaptureMode(settings.lastCaptureMode)) {
          dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: settings.lastCaptureMode });
        }
      }
      // Only after the stored values are in state, so the save effect below never writes the
      // defaults over them.
      dispatch({ type: 'settings/SET_LOADED' });
    });
  }, [dispatch, setThemePref]);

  useEffect(() => {
    if (!loaded) return;
    persistSettings({
      themePref,
      firstRun: state.settings.firstRun,
      ocrScript: state.settings.ocrScript,
      androidExportFolderUri: state.settings.androidExportFolderUri,
      androidExportFolderLabel: state.settings.androidExportFolderLabel,
      defaultEnhanceByMode: state.settings.defaultEnhanceByMode,
      crashReportsEnabled: state.settings.crashReportsEnabled,
      scannerUnavailable: state.settings.scannerUnavailable,
      lastCaptureMode: state.settings.lastCaptureMode,
      lastOpened: state.settings.lastOpened,
      profile: state.settings.profile,
      nameTemplate: state.settings.nameTemplate,
      profilePrompted: state.settings.profilePrompted,
      unsortedPromptDone: state.settings.unsortedPromptDone,
      uiLanguage: state.settings.uiLanguage,
      documentLanguage: state.settings.documentLanguage,
      lastBackupAt: state.settings.lastBackupAt,
      lastBackupBytes: state.settings.lastBackupBytes,
      backupFolderUri: state.settings.backupFolderUri,
      backupFolderLabel: state.settings.backupFolderLabel,
      backupReminderSnoozedUntil: state.settings.backupReminderSnoozedUntil,
      autoBackup: state.settings.autoBackup,
      lastAutoBackupAt: state.settings.lastAutoBackupAt,
      autoBackupUris: state.settings.autoBackupUris,
      onboardingDone: state.settings.onboardingDone,
    });
  }, [
    loaded,
    themePref,
    state.settings.firstRun,
    state.settings.ocrScript,
    state.settings.androidExportFolderUri,
    state.settings.androidExportFolderLabel,
    state.settings.defaultEnhanceByMode,
    state.settings.crashReportsEnabled,
    state.settings.scannerUnavailable,
    state.settings.lastCaptureMode,
    state.settings.lastOpened,
    state.settings.profile,
    state.settings.nameTemplate,
    state.settings.profilePrompted,
    state.settings.unsortedPromptDone,
    state.settings.uiLanguage,
    state.settings.documentLanguage,
    state.settings.lastBackupAt,
    state.settings.lastBackupBytes,
    state.settings.backupFolderUri,
    state.settings.backupFolderLabel,
    state.settings.backupReminderSnoozedUntil,
    state.settings.autoBackup,
    state.settings.lastAutoBackupAt,
    state.settings.autoBackupUris,
    state.settings.onboardingDone,
  ]);

  // The i18n layer follows the setting; screens re-render through useT.
  useEffect(() => {
    setUiLanguage(state.settings.uiLanguage);
  }, [state.settings.uiLanguage]);
  useEffect(() => {
    setDocumentLanguage(state.settings.documentLanguage);
  }, [state.settings.documentLanguage]);
}
