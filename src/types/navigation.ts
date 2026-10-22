export type ScreenName =
  | 'home'
  | 'course'
  | 'review'
  | 'deliver'
  // §17 U9: after Save or Submit ("Saved to {course}", Open · Share · Submit · Scan more).
  | 'done'
  // The Files tab (§17 U5 renamed it in the UI only).
  | 'library'
  | 'reader'
  // The Me tab since §17 U5.
  | 'settings'
  // §17 U5: the Tools tab; since U8 every tool, in one grid (screens/ToolsScreen).
  | 'tools'
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
  | 'filterLab'
  // Dev-only (__DEV__): see src/dev/ReaderLabScreen.tsx (§18 W7).
  | 'readerLab'
  // Dev-only (__DEV__): see src/dev/UiGalleryScreen.tsx (§17 U2).
  | 'uiGallery';
export type NavDir = 'fwd' | 'back';
// The tabs and the back stacks are in navigation/navStack.ts (§16 G2).
