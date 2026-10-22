import { chooseStartScreen } from '../startScreen';

describe('chooseStartScreen', () => {
  it('§17 U5: always opens Home, with or without a course', () => {
    expect(chooseStartScreen()).toBe('home');
    expect(chooseStartScreen({ showOnboarding: false })).toBe('home');
  });

  it('opens the introduction for a brand-new user (§9 O2)', () => {
    expect(chooseStartScreen({ showOnboarding: true })).toBe('onboarding');
  });
});
