import { DEFAULT_MARK, normalizeMark, type MarkPrefs } from '../annotations/markMode';
import { NIGHT_PALETTES, type NightPalette } from '../reader/darkMatrix';

// §12 D2: how the Reader shows a document. One set for every document: the choices are about how
// the student likes to read (page by page, screen kept on), not about one file, and a per-document
// copy would need a new library column for little gain. Stored in settings (`app:settings`), so
// they survive a restart; anything unknown in storage reads as the default.

export type ReadingLayout = 'continuous' | 'paged';
export type ReadingFit = 'width' | 'page';
export type ReadingSpacing = 'none' | 'small' | 'large';
export type NightStrength = 'low' | 'medium' | 'high';

export type ReadingSettings = {
  // Continuous scroll, or one page at a time. PDFs and scans only.
  layout: ReadingLayout;
  // Fit the page's width, or the whole page on screen. PDFs and scans only.
  fit: ReadingFit;
  // The gap between pages. PDFs and scans only.
  spacing: ReadingSpacing;
  // Night: dark colours in the text, sheet and Word viewers. PDFs and scans (§18 W10): the pages
  // themselves are redrawn dark, and `nightStrength` picks how dark the paper is (`nightPalette`).
  night: boolean;
  nightStrength: NightStrength;
  // Keep the screen on while the Reader is open (expo-keep-awake). Off by default: battery.
  keepAwake: boolean;
  // §12 D3: Mark mode's last tool and colours (annotations/markMode).
  mark: MarkPrefs;
};

export const DEFAULT_READING: ReadingSettings = {
  layout: 'continuous',
  fit: 'width',
  spacing: 'small',
  night: false,
  nightStrength: 'medium',
  keepAwake: false,
  mark: DEFAULT_MARK,
};

export const READING_SPACING_PX: Record<ReadingSpacing, number> = { none: 0, small: 10, large: 24 };

const LAYOUTS: readonly ReadingLayout[] = ['continuous', 'paged'];
const FITS: readonly ReadingFit[] = ['width', 'page'];
const SPACINGS: readonly ReadingSpacing[] = ['none', 'small', 'large'];
const STRENGTHS: readonly NightStrength[] = ['low', 'medium', 'high'];

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

// Settings saved before D2 have none; a damaged or older value falls back field by field.
export function normalizeReading(raw: unknown): ReadingSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ReadingSettings, unknown>>;
  return {
    layout: pick(LAYOUTS, r.layout, DEFAULT_READING.layout),
    fit: pick(FITS, r.fit, DEFAULT_READING.fit),
    spacing: pick(SPACINGS, r.spacing, DEFAULT_READING.spacing),
    night: r.night === true,
    nightStrength: pick(STRENGTHS, r.nightStrength, DEFAULT_READING.nightStrength),
    keepAwake: r.keepAwake === true,
    mark: normalizeMark(r.mark),
  };
}

// §18 W10: the page surface's night colours for these settings; null by day.
export function nightPalette(reading: Pick<ReadingSettings, 'night' | 'nightStrength'>): NightPalette | null {
  return reading.night ? NIGHT_PALETTES[reading.nightStrength] : null;
}
