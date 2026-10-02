import { savableQuickSetup } from '../../courses/courseSetup';
import { afterOnboarding, exampleFileName, onboardingDecision } from '../onboarding';
import type { Course } from '../../../types/models';

describe('onboardingDecision', () => {
  const fresh = { onboardingDone: false, libraryLoaded: true, documentCount: 0, courseCount: 0 };

  it('shows it to a brand-new user only', () => {
    expect(onboardingDecision(fresh)).toBe('show');
    expect(onboardingDecision({ ...fresh, onboardingDone: true })).toBe('none');
  });

  it('never shows it to someone who already has a library, and records that', () => {
    expect(onboardingDecision({ ...fresh, documentCount: 3 })).toBe('markDone');
    expect(onboardingDecision({ ...fresh, courseCount: 1 })).toBe('markDone');
  });

  it("doesn't take a library that failed to load for an empty one", () => {
    expect(onboardingDecision({ ...fresh, libraryLoaded: false })).toBe('none');
  });

  it('starts on Home with a course, else Capture', () => {
    expect(afterOnboarding(true)).toBe('home');
    expect(afterOnboarding(false)).toBe('capture');
  });
});

describe('exampleFileName', () => {
  const sample = { name: 'Rahim', roll: '2021331045' };

  it('uses what was typed, sample values for the rest', () => {
    expect(exampleFileName({ name: '', roll: '' }, sample)).toBe('2021331045_Rahim_CSE101_HW1.pdf');
    expect(exampleFileName({ name: 'Nusrat Jahan', roll: '' }, sample)).toBe('2021331045_NusratJahan_CSE101_HW1.pdf');
    expect(exampleFileName({ name: 'Nusrat', roll: '42' }, sample)).toBe('42_Nusrat_CSE101_HW1.pdf');
  });
});

describe('savableQuickSetup (what Skip saves)', () => {
  const now = new Date(2026, 9, 2);
  const existing: Course[] = [{ id: 'c1', name: 'Physics', code: 'PHY101', color: 'teal', archived: false, sortOrder: 0, createdAt: 1 }];

  it('keeps the rows that are fine and drops the half-typed or clashing ones', () => {
    const result = savableQuickSetup(
      [
        { name: 'Chemistry', code: 'CHE101' },
        { name: '', code: 'MAT' },
        { name: 'Optics', code: 'PHY101' },
        { name: '', code: '' },
        { name: 'Biology', code: '' },
      ],
      'Fall 2026',
      existing,
      [],
      now
    );
    expect(result).toEqual({ rows: [{ name: 'Chemistry', code: 'CHE101' }, { name: 'Biology', code: '' }], semesterName: 'Fall 2026' });
  });

  it('a blank semester takes the default, nothing typed saves nothing', () => {
    expect(savableQuickSetup([{ name: 'Art', code: '' }], '  ', [], [], now).semesterName).not.toBe('');
    expect(savableQuickSetup([{ name: '', code: '' }], 'Fall', [], [], now).rows).toEqual([]);
  });
});
