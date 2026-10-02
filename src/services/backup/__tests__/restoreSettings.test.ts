import { initialSettingsState, type SettingsState } from '../../../store/slices/settingsSlice';
import { hasSettingsToApply, settingsFromBackup } from '../restoreSettings';

const backup = {
  themePref: 'dark' as const,
  ocrScript: 'devanagari' as const,
  lastCaptureMode: 'book' as const,
  profile: { name: 'Rahim', roll: '42', section: '', institution: 'DU' },
  nameTemplate: '{course}_{type}{n}',
  profilePrompted: true,
  uiLanguage: 'en',
  documentLanguage: 'en',
};

describe('settingsFromBackup', () => {
  it('takes everything on a fresh install', () => {
    const result = settingsFromBackup(backup, initialSettingsState, 'system');
    expect(result.themePref).toBe('dark');
    expect(result.actions).toEqual(
      expect.arrayContaining([
        { type: 'settings/SET_OCR_SCRIPT', script: 'devanagari' },
        { type: 'settings/SET_LAST_CAPTURE_MODE', mode: 'book' },
        { type: 'settings/SET_PROFILE', profile: { name: 'Rahim', roll: '42', institution: 'DU' } },
        { type: 'settings/SET_NAME_TEMPLATE', template: '{course}_{type}{n}' },
        { type: 'settings/SET_PROFILE_PROMPTED' },
        { type: 'settings/SET_UI_LANGUAGE', language: 'en' },
        { type: 'settings/SET_DOCUMENT_LANGUAGE', language: 'en' },
      ])
    );
    expect(hasSettingsToApply(result)).toBe(true);
  });

  it('keeps whatever was already set on this phone', () => {
    const current: SettingsState = {
      ...initialSettingsState,
      ocrScript: 'korean',
      nameTemplate: 'mine',
      profile: { name: 'Karim', roll: '', section: 'B', institution: '' },
      uiLanguage: 'en',
    };
    const result = settingsFromBackup(backup, current, 'light');
    expect(result.themePref).toBeUndefined();
    const types = result.actions.map((a) => a.type);
    expect(types).not.toContain('settings/SET_OCR_SCRIPT');
    expect(types).not.toContain('settings/SET_NAME_TEMPLATE');
    expect(types).not.toContain('settings/SET_UI_LANGUAGE');
    // Only the empty profile fields are filled in.
    expect(result.actions).toContainEqual({ type: 'settings/SET_PROFILE', profile: { roll: '42', institution: 'DU' } });
  });

  it('ignores values this app version does not know', () => {
    const result = settingsFromBackup(
      { themePref: 'neon' as never, ocrScript: 'klingon' as never, lastCaptureMode: 'x' as never, uiLanguage: 'en-XA' },
      initialSettingsState,
      'system'
    );
    expect(hasSettingsToApply(result)).toBe(false);
  });
});
