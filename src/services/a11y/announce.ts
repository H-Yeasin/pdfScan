import { AccessibilityInfo, Platform } from 'react-native';

// §9 O4b: says `message` through the screen reader. Android reads the views marked
// accessibilityLiveRegion="polite" by itself (the snackbar, scan progress), so this only speaks
// on iOS, where live regions don't exist - on Android it would be read twice.
export function announce(message: string): void {
  if (Platform.OS === 'ios' && message) AccessibilityInfo.announceForAccessibility(message);
}
