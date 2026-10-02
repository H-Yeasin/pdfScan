import { CAPTURE_MODES } from '../../services/capture/captureModes';
import { scannerUnavailableMessage } from '../../services/capture/scannerFallback';
import { FILTERS } from '../../services/enhance/filters/registry';
import { PSEUDO_LOCALE, setUiLanguage, t } from '../index';

// Strings that services hand to the UI (capture mode names and hints, filter names, capture
// messages) are catalog keys or read at call time, so they follow the language like screens do.
afterEach(() => setUiLanguage('system'));

describe('service strings follow the UI language', () => {
  it('every capture mode and filter has a name (and hint) in the catalog', () => {
    for (const key of [...CAPTURE_MODES.flatMap((m) => [m.labelKey, m.hintKey]), ...FILTERS.map((f) => f.labelKey)]) {
      expect(t(key)).not.toBe(key);
    }
  });

  it('switch with the language, read when shown', () => {
    expect(scannerUnavailableMessage()).toBe("Your phone doesn't support Google's scanner. Using basic camera mode.");
    setUiLanguage(PSEUDO_LOCALE);
    expect(scannerUnavailableMessage()).toMatch(/^\[Ýöûŕ /);
    expect(t(CAPTURE_MODES[0].labelKey)).toMatch(/^\[Ñöţéš /);
    expect(t('capture.added', { pages: t('capture.pages', { count: 2 }) })).toMatch(/^\[Åððéð \[2 þáĝéš ·+\] ·+\]$/);
  });
});
