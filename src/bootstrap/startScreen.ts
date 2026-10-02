import type { ScreenName } from '../types/navigation';
import { rootScreen } from '../navigation/backHandling';

// §9 O1: the first screen, chosen once settings and the library index are in (or the boot timeout
// fires). Home once the student has an active course, otherwise Capture. A failed library load
// has no courses and lands on Capture. §9 O2: a brand-new user starts on Onboarding
// (services/onboarding.onboardingDecision says who that is).
export function chooseStartScreen({ hasActiveCourse, showOnboarding = false }: { hasActiveCourse: boolean; showOnboarding?: boolean }): ScreenName {
  return showOnboarding ? 'onboarding' : rootScreen(hasActiveCourse);
}
