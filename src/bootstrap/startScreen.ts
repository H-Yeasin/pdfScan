import type { ScreenName } from '../types/navigation';
import { rootScreen } from '../navigation/backHandling';

// §9 O1: the first screen, chosen once settings and the library index are in (or the boot timeout
// fires). §17 U5: always Home (it used to be Capture until a course existed; the tab bar's Scan
// button now opens the scanner from any tab). §9 O2: a brand-new user starts on Onboarding
// (services/onboarding.onboardingDecision says who that is).
export function chooseStartScreen({ showOnboarding = false }: { showOnboarding?: boolean } = {}): ScreenName {
  return showOnboarding ? 'onboarding' : rootScreen();
}
