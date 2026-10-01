export type ScreenName =
  | 'capture'
  | 'review'
  | 'deliver'
  | 'library'
  | 'reader'
  | 'settings'
  | 'pro'
  | 'manageFolders'
  | 'academicOptions'
  // Dev-only (__DEV__): see src/dev/FilterLabScreen.tsx.
  | 'filterLab';
export type NavDir = 'fwd' | 'back';
