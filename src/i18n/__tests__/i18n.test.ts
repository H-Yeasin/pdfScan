import { mockLocales } from '../../test/mocks/expoLocalization';
import { en } from '../en';
import {
  PSEUDO_LOCALE,
  formatBytes,
  formatDate,
  getLocale,
  isUiLanguage,
  registerCatalog,
  setUiLanguage,
  subscribeUiLanguage,
  systemCatalogId,
  t,
  type Catalog,
  type CatalogId,
} from '../index';
import { pseudoString } from '../pseudo';

afterEach(() => {
  setUiLanguage('system');
  mockLocales([{ languageTag: 'en-US', languageCode: 'en' }]);
});

describe('t', () => {
  it('reads nested keys and fills {name} parameters', () => {
    expect(t('home.addCourse')).toBe('Add course');
    expect(t('home.archived', { name: 'Physics' })).toBe('Physics archived');
    expect(t('settings.about.text', { version: '1.0' })).toBe('Version 1.0 · Documents never leave your phone unless you share them.');
  });

  it('leaves a parameter it was not given as it is', () => {
    expect(t('home.archived')).toBe('{name} archived');
  });

  it("picks the plural form by count, with the language's rule", () => {
    expect(t('home.docCount', { count: 1 })).toBe('1 doc');
    expect(t('home.docCount', { count: 0 })).toBe('0 docs');
    expect(t('home.docCount', { count: 12 })).toBe('12 docs');
    expect(t('common.daysAgo', { count: 3 })).toBe('3 days ago');
  });

  it('formats numbers in the active locale', () => {
    expect(t('home.docCount', { count: 1234 })).toBe('1,234 docs');
  });

  it('falls back to English for a key a translation is missing, and warns in development', () => {
    const partial = { ...en, meta: { ...en.meta, locale: 'xx' }, home: { ...en.home, addCourse: undefined } } as unknown as Catalog;
    const undo = registerCatalog('xx', partial);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setUiLanguage('xx' as CatalogId);
    expect(t('home.addCourse')).toBe('Add course');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('home.addCourse'));
    warn.mockRestore();
    undo();
  });

  it('uses a translation when one is active, and tells subscribers', () => {
    const xx = { ...en, meta: { ...en.meta, locale: 'xx', plural: () => 'other' as const }, home: { ...en.home, addCourse: 'Kurs hinzufügen' } };
    const undo = registerCatalog('xx', xx);
    const listener = jest.fn();
    const unsubscribe = subscribeUiLanguage(listener);
    setUiLanguage('xx' as CatalogId);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLocale()).toBe('xx');
    expect(t('home.addCourse')).toBe('Kurs hinzufügen');
    expect(t('home.docCount', { count: 1 })).toBe('1 docs');
    unsubscribe();
    undo();
  });
});

describe('the system language', () => {
  it('is the first phone language that has a catalog, else English', () => {
    mockLocales([
      { languageTag: 'xx-XX', languageCode: 'xx' },
      { languageTag: 'en-GB', languageCode: 'en' },
    ]);
    expect(systemCatalogId()).toBe('en');
    const undo = registerCatalog('xx', en);
    expect(systemCatalogId()).toBe('xx');
    undo();
    mockLocales([{ languageTag: 'fr-FR', languageCode: 'fr' }]);
    expect(systemCatalogId()).toBe('en');
  });

  it('accepts only known settings values', () => {
    for (const value of ['system', 'en', PSEUDO_LOCALE]) expect(isUiLanguage(value)).toBe(true);
    for (const value of ['fr', '', null, 3]) expect(isUiLanguage(value)).toBe(false);
  });
});

describe('the pseudo-locale', () => {
  it('accents letters, keeps {params}, and is at least 40% longer', () => {
    const out = pseudoString('Insert {token} here');
    expect(out).toMatch(/^\[Îñšéŕţ \{token\} ĥéŕé ·+\]$/);
    expect(out.length).toBeGreaterThanOrEqual('Insert {token} here'.length * 1.4);
  });

  it('turns every string pseudo, with parameters and plurals still working', () => {
    setUiLanguage(PSEUDO_LOCALE);
    expect(getLocale()).toBe(PSEUDO_LOCALE);
    expect(t('home.archived', { name: 'Physics' })).toMatch(/^\[Physics áŕçĥîṽéð ·+\]$/);
    expect(t('home.docCount', { count: 2 })).toMatch(/^\[2 ðöçš ·+\]$/);
    expect(formatDate(new Date(2026, 9, 2), { month: 'short', day: 'numeric' })).toBe('Oct 2');
  });
});

describe('formatting', () => {
  it('formats sizes like utils/format, in the active locale', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(340 * 1024)).toBe('340 KB');
    expect(formatBytes(1.44 * 1024 * 1024)).toBe('1.4 MB');
  });
});

// §16 G6: a row formats its page count, size and date on every render; the formatters are built
// once per locale + options.
describe('Intl formatter cache', () => {
  const { dateFormat, numberFormat } = jest.requireActual('../index') as typeof import('../index');

  it('hands back the same formatter for the same locale and options', () => {
    expect(numberFormat('en')).toBe(numberFormat('en'));
    expect(numberFormat('en', { maximumFractionDigits: 1 })).toBe(numberFormat('en', { maximumFractionDigits: 1 }));
    expect(dateFormat('en', { month: 'short', day: 'numeric' })).toBe(dateFormat('en', { month: 'short', day: 'numeric' }));
  });

  it('keeps locales and options apart', () => {
    expect(numberFormat('en')).not.toBe(numberFormat('bn'));
    expect(numberFormat('en')).not.toBe(numberFormat('en', { maximumFractionDigits: 1 }));
    expect(dateFormat('en', { month: 'short' })).not.toBe(dateFormat('en', { month: 'long' }));
  });

  it('builds nothing new for a formatted value', () => {
    formatDate(new Date(2026, 9, 2), { month: 'short', day: 'numeric' });
    const built = jest.spyOn(Intl, 'DateTimeFormat');
    expect(formatDate(new Date(2026, 9, 3), { month: 'short', day: 'numeric' })).toBe('Oct 3');
    expect(built).not.toHaveBeenCalled();
    built.mockRestore();
  });
});
