import { coverDefaults, formatCoverDate, layoutCover } from '../../services/pdf/coverTemplates';
import { pageDimensions } from '../../services/pdf/pdfService';
import { footerPresetOf, footerPresetText } from '../../services/submit/footerPresets';
import { renderText } from '../../services/submit/naming';
import { PSEUDO_LOCALE, isDocumentLanguage, setDocumentLanguage, setUiLanguage, t, tDoc } from '../index';

jest.mock('../../services/enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// §6 L4c: text that goes into documents has its own language: 'ui' follows the app, a catalog id
// pins it (a Bangla UI can still make English covers). The pseudo-locale stands in for "another UI
// language" here, since English is the only catalog so far.
afterEach(() => {
  setUiLanguage('system');
  setDocumentLanguage('ui');
});

const profile = { name: 'Rahim Uddin', roll: '2021331045', section: 'B', institution: 'SUST' };
const ctx = { profile, course: { name: 'Physics', code: 'PHY 101' }, docType: 'assignment' as const, n: 3, date: new Date(2026, 9, 2) };
const coverTexts = () =>
  layoutCover('assignment', coverDefaults(ctx), pageDimensions('A4'))
    .filter((item) => item.kind === 'text')
    .map((item) => (item.kind === 'text' ? item.text : ''));

describe('document language', () => {
  it("follows the UI language by default ('ui')", () => {
    setUiLanguage(PSEUDO_LOCALE);
    expect(tDoc('document.submittedBy')).toMatch(/^\[Šûƀɱîţţéð ƀý ·+\]$/);
    expect(coverTexts()).toContain(tDoc('document.submittedBy'));
  });

  it('can stay English under another UI language: covers, dates, footers and file names', () => {
    setUiLanguage(PSEUDO_LOCALE);
    setDocumentLanguage('en');
    expect(t('home.addCourse')).toMatch(/^\[/);

    const texts = coverTexts();
    expect(texts).toEqual(expect.arrayContaining(['Assignment 3', 'Submitted by', 'Submitted to', 'Name: Rahim Uddin', 'Date of submission: 2 October 2026']));
    expect(texts.some((text) => text.startsWith('['))).toBe(false);
    expect(formatCoverDate(new Date(2026, 9, 2))).toBe('2 October 2026');
    expect(footerPresetText('pages')).toBe('Page {X} of {Y}');
    expect(renderText('{roll}_{type}{n}', { ...ctx })).toBe('2021331045_HW3');
  });

  it('reads a footer preset chosen in English as that preset after a language change', () => {
    const english = footerPresetText('namePages');
    setUiLanguage(PSEUDO_LOCALE);
    expect(footerPresetText('namePages')).not.toBe(english);
    expect(footerPresetOf(english)).toBe('namePages');
    expect(footerPresetOf(footerPresetText('namePages'))).toBe('namePages');
    expect(footerPresetOf('My own footer {X}')).toBe('custom');
  });

  it('accepts only known settings values', () => {
    expect(isDocumentLanguage('ui')).toBe(true);
    expect(isDocumentLanguage('en')).toBe(true);
    expect(isDocumentLanguage(PSEUDO_LOCALE)).toBe(false);
    expect(isDocumentLanguage('xx')).toBe(false);
  });
});
