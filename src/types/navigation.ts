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
  // §9 O2: the three-page introduction for new users.
  | 'onboarding'
  // Dev-only (__DEV__): see src/dev/FilterLabScreen.tsx.
  | 'filterLab';
export type NavDir = 'fwd' | 'back';
// The tabs and the back stacks are in navigation/navStack.ts (§16 G2).
