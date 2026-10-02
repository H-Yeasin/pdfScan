import { FREE_FOREVER, PRO_FEATURES, canUseProFeature, getProFeature, liveProFeatures } from '../proFeatures';

// The owner's rule: never take away a feature that was free. This baseline only ever grows; if
// this test fails because something was removed from FREE_FOREVER, that is the rule breaking.
const FREE_BASELINE = [
  'scan',
  'filters',
  'ocr',
  'submit',
  'courses',
  'search',
  'annotations',
  'bookmarks',
  'examPacks',
  'deadlines',
  'fileBackup',
  'restore',
  'reader',
  'pdfTools',
  'sign',
  'share',
  'noWatermark',
];

describe('free forever', () => {
  it('keeps every feature that was ever free', () => {
    for (const id of FREE_BASELINE) expect(FREE_FOREVER).toContain(id);
  });

  it('never lists a feature as both free and Pro', () => {
    const free = new Set<string>(FREE_FOREVER);
    for (const feature of PRO_FEATURES) expect(free.has(feature.id)).toBe(false);
  });
});

describe('PRO_FEATURES', () => {
  it('has unique ids and a label for each', () => {
    expect(new Set(PRO_FEATURES.map((f) => f.id)).size).toBe(PRO_FEATURES.length);
    for (const f of PRO_FEATURES) expect(f.labelKey).toBe(`pro.features.${f.id}`);
  });

  it('lists only live features as part of Pro', () => {
    expect(liveProFeatures().every((f) => f.status === 'live')).toBe(true);
  });

  it('throws on an unknown id', () => {
    expect(() => getProFeature('batch' as never)).toThrow();
  });
});

describe('lapse rules', () => {
  it('lets Pro use everything', () => {
    for (const f of PRO_FEATURES) {
      expect(canUseProFeature(f.id, 'start', true)).toBe(true);
      expect(canUseProFeature(f.id, 'keep', true)).toBe(true);
    }
  });

  it('never lets anything start without Pro', () => {
    for (const f of PRO_FEATURES) expect(canUseProFeature(f.id, 'start', false)).toBe(false);
  });

  it('keeps app lock on until turned off, so a lapsed pass never exposes documents', () => {
    expect(canUseProFeature('appLock', 'keep', false)).toBe(true);
  });

  it('keeps what was made with a Pro cover or password', () => {
    expect(canUseProFeature('coverTemplates', 'keep', false)).toBe(true);
    expect(canUseProFeature('pdfPasswords', 'keep', false)).toBe(true);
  });

  it('pauses Drive backup and brings banners and the default accent back', () => {
    expect(canUseProFeature('driveBackup', 'keep', false)).toBe(false);
    expect(canUseProFeature('noBanners', 'keep', false)).toBe(false);
    expect(canUseProFeature('themeAccents', 'keep', false)).toBe(false);
  });
});
