import { chooseStartScreen } from '../startScreen';

describe('chooseStartScreen', () => {
  it('opens Capture for a new user and for one with no active course', () => {
    expect(chooseStartScreen({ hasActiveCourse: false })).toBe('capture');
  });

  it('opens Home once a course exists', () => {
    expect(chooseStartScreen({ hasActiveCourse: true })).toBe('home');
  });

  it('opens the introduction for a brand-new user (§9 O2)', () => {
    expect(chooseStartScreen({ hasActiveCourse: false, showOnboarding: true })).toBe('onboarding');
  });
});
