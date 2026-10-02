export type ScreenName =
  | 'home'
  | 'course'
  | 'capture'
  | 'review'
  | 'deliver'
  | 'library'
  | 'reader'
  | 'settings'
  | 'pro'
  | 'manageFolders'
  | 'academicOptions'
  // §5 T6.
  | 'examPack'
  // §8 B1: Settings → Storage.
  | 'storage'
  // §8 B3: Settings → Backup.
  | 'backup'
  // Dev-only (__DEV__): see src/dev/FilterLabScreen.tsx.
  | 'filterLab';
export type NavDir = 'fwd' | 'back';

// The screens a "back" from Reader or Settings returns to: wherever the user was browsing from.
export type HubScreen = 'home' | 'library' | 'course';
// The tabs a Course page goes back to.
export type TabHub = 'home' | 'library';
