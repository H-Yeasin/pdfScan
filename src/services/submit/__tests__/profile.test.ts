import { EMPTY_PROFILE, isProfileComplete, normalizeProfile } from '../profile';

describe('isProfileComplete', () => {
  it('needs a name and a roll number', () => {
    expect(isProfileComplete(EMPTY_PROFILE)).toBe(false);
    expect(isProfileComplete({ ...EMPTY_PROFILE, name: 'Rahim' })).toBe(false);
    expect(isProfileComplete({ ...EMPTY_PROFILE, roll: '2021331045' })).toBe(false);
    expect(isProfileComplete({ ...EMPTY_PROFILE, name: 'Rahim', roll: '2021331045' })).toBe(true);
  });

  it('treats whitespace as empty', () => {
    expect(isProfileComplete({ ...EMPTY_PROFILE, name: '  ', roll: '2021331045' })).toBe(false);
  });

  it('does not need section or institution', () => {
    expect(isProfileComplete({ name: 'Rahim', roll: '1', section: '', institution: '' })).toBe(true);
  });
});

describe('normalizeProfile', () => {
  it('fills a missing profile with empty fields', () => {
    expect(normalizeProfile(undefined)).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile(null)).toEqual(EMPTY_PROFILE);
  });

  it('keeps string fields and drops the rest', () => {
    expect(normalizeProfile({ name: 'Rahim', roll: 45, section: 'B', extra: 'x' })).toEqual({
      name: 'Rahim',
      roll: '',
      section: 'B',
      institution: '',
    });
  });
});
