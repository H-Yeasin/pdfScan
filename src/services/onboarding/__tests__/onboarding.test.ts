import { savableQuickSetup } from '../../courses/courseSetup';
import { afterOnboarding, exampleFileName, initialsOf, onboardingDecision, studentCard } from '../onboarding';
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

describe('studentCard', () => {
  const empty = { profile: { name: '', roll: '' }, semester: 'Fall 2026', rows: [], rowColors: [] };

  it('starts a quarter done: the semester is filled in for them', () => {
    const card = studentCard(empty);
    expect(card).toMatchObject({ done: 1, total: 4, initials: '', courses: [] });
    expect(card.steps).toEqual({ semester: true, name: false, roll: false, courses: false });
  });

  it('fills in as they type, and is ready with a name, a roll and a course', () => {
    const card = studentCard({
      ...empty,
      profile: { name: '  Nusrat Jahan ', roll: '2021331045' },
      rows: [
        { name: 'Programming', code: 'CSE 101' },
        { name: '', code: '' },
        { name: 'Physics', code: '' },
      ],
      rowColors: ['#111', '#222', '#333'],
    });
    expect(card.initials).toBe('NJ');
    expect(card.name).toBe('Nusrat Jahan');
    // Blank rows are skipped; each course keeps the colour it'll be saved with.
    expect(card.courses).toEqual([
      { label: 'CSE 101', color: '#111' },
      { label: 'Physics', color: '#333' },
    ]);
    expect(card.done).toBe(card.total);
  });

  it('takes initials from the first and last word, in any script', () => {
    expect(initialsOf('rahim')).toBe('R');
    expect(initialsOf('Md. Rahim Uddin')).toBe('MU');
    expect(initialsOf('রহিম উদ্দিন')).toBe('রউ');
    expect(initialsOf('   ')).toBe('');
  });
});
