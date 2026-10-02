import type { ScreenName } from '../types/navigation';
import { rootScreen } from '../navigation/backHandling';

// §9 O1: the first screen, chosen once settings and the library index are in (or the boot timeout
// fires). Home once the student has an active course, otherwise Capture. A failed library load
// has no courses and lands on Capture. §9 O2 adds Onboarding here for brand-new users.
export function chooseStartScreen({ hasActiveCourse }: { hasActiveCourse: boolean }): ScreenName {
  return rootScreen(hasActiveCourse);
}
