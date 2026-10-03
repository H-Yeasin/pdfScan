import type { TKey } from '../../i18n';

// §10 M3: what Pro is, and what is free forever. Pro access today is the rewarded day pass (M6);
// paid Pro (M9) unlocks the same list. The owner's rule: never take away a feature that was
// free, so FREE_FOREVER only ever grows (__tests__/proFeatures.test.ts holds the baseline).

export type ProFeatureId =
  | 'coverTemplates'
  | 'themeAccents'
  | 'appLock'
  | 'noBanners'
  | 'pdfPasswords'
  | 'driveBackup'
  | 'convert'
  | 'editFiles'
  | 'pdfForms';

// What happens when Pro ends (a pass runs out). Turning a feature on, or making something new
// with it, always needs Pro; this is only about what was set up while Pro was active.
// - 'keepUntilOff': keeps working until the student turns it off (app lock: removing a lock
//   when a pass runs out would expose the documents it protects).
// - 'keepExisting': what was made with it stays (a document with a Pro cover keeps its cover).
// - 'pause': stops, with a notice, and picks up again with Pro (Drive auto-backup).
// - 'stop': stops (banners come back, the accent goes back to the default).
export type LapseRule = 'keepUntilOff' | 'keepExisting' | 'pause' | 'stop';

export type ProFeature = {
  id: ProFeatureId;
  // 'planned' features are never listed as part of Pro (the Pro screen shows 'live' only).
  status: 'live' | 'planned';
  labelKey: TKey;
  lapse: LapseRule;
};

// M4 built templates, accents and app lock; M5 the banners; R6 and B6 build the next two.
export const PRO_FEATURES: readonly ProFeature[] = [
  { id: 'coverTemplates', status: 'live', labelKey: 'pro.features.coverTemplates', lapse: 'keepExisting' },
  { id: 'themeAccents', status: 'live', labelKey: 'pro.features.themeAccents', lapse: 'stop' },
  { id: 'appLock', status: 'live', labelKey: 'pro.features.appLock', lapse: 'keepUntilOff' },
  { id: 'noBanners', status: 'live', labelKey: 'pro.features.noBanners', lapse: 'stop' },
  { id: 'pdfPasswords', status: 'planned', labelKey: 'pro.features.pdfPasswords', lapse: 'keepExisting' },
  { id: 'driveBackup', status: 'planned', labelKey: 'pro.features.driveBackup', lapse: 'pause' },
  // §12 Pro tasks, unlocked one task at a time by a rewarded ad (services/pro/proTask.ts) or by a
  // day pass. What was converted or edited stays. 'planned' until its step builds it
  // (pdfForms: D10).
  // Office → PDF (D5); scan/PDF → Word joins it in D6 (readerTools.BUILT_CONVERSIONS).
  { id: 'convert', status: 'live', labelKey: 'pro.features.convert', lapse: 'keepExisting' },
  // Edit TXT and CSV files (D7); XLSX (D8) and Word (D9) join it (readerTools.BUILT_EDITS).
  { id: 'editFiles', status: 'live', labelKey: 'pro.features.editFiles', lapse: 'keepExisting' },
  // Fill PDF forms and add typed text boxes.
  { id: 'pdfForms', status: 'planned', labelKey: 'pro.features.pdfForms', lapse: 'keepExisting' },
];

export const FREE_FOREVER = [
  'scan',
  'filters',
  // Every language, Bangla included.
  'ocr',
  'submit',
  'courses',
  'search',
  'annotations',
  'bookmarks',
  'examPacks',
  'deadlines',
  // Backups to a file or a folder (§8); Drive is the Pro extra.
  'fileBackup',
  'restore',
  'reader',
  // Merge, split, compress, edit pages (§7).
  'pdfTools',
  'sign',
  'share',
  'noWatermark',
] as const;

export type FreeFeatureId = (typeof FREE_FOREVER)[number];

export function getProFeature(id: ProFeatureId): ProFeature {
  const feature = PRO_FEATURES.find((f) => f.id === id);
  if (!feature) throw new Error(`Unknown Pro feature: ${id}`);
  return feature;
}

export function liveProFeatures(): ProFeature[] {
  return PRO_FEATURES.filter((f) => f.status === 'live');
}

// 'start': turn it on or make something new with it. 'keep': go on using what was set up before.
export type ProUse = 'start' | 'keep';

// Whether a feature can be used now. Pure; the lapse rules live here and nowhere else.
export function canUseProFeature(id: ProFeatureId, use: ProUse, isPro: boolean): boolean {
  if (isPro) return true;
  if (use === 'start') return false;
  const { lapse } = getProFeature(id);
  return lapse === 'keepUntilOff' || lapse === 'keepExisting';
}
