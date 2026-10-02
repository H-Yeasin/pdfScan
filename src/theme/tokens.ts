import type { CourseColor } from '../types/models';

export type ThemeName = 'light' | 'dark';

export type ThemeTokens = {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  edge: string;
  // A fill (buttons, selection, the active tab's underline) and icons; never body text, which uses
  // accentInk. Text and icons drawn ON an accent fill use onAccent. Contrast: theme/__tests__/contrast.test.ts.
  accent: string;
  accentInk: string;
  onAccent: string;
  accentSoft: string;
  danger: string;
  // Course colours (services/courses/palette.ts), each at least 4.5:1 against bg, surface and
  // surface2 so they work as text, icons and dots - see palette.test.ts.
  courseColors: Record<CourseColor, string>;
};

const light: ThemeTokens = {
  bg: '#f5ead8',
  surface: '#fffdf8',
  surface2: '#f4ecdd',
  ink: '#201e1d',
  muted: '#645c50',
  edge: 'rgba(32,30,29,.13)',
  // §9 O4b: deepened from #16a085 so white labels on it reach 4.5:1.
  accent: '#0f7f69',
  accentInk: '#0e6655',
  onAccent: '#ffffff',
  accentSoft: '#dff0ea',
  danger: '#c0392b',
  courseColors: {
    teal: '#0f766e',
    blue: '#1d4ed8',
    indigo: '#4338ca',
    purple: '#7e22ce',
    pink: '#be185d',
    red: '#b91c1c',
    orange: '#9a3412',
    amber: '#854d0e',
    green: '#166534',
    slate: '#475569',
  },
};

const dark: ThemeTokens = {
  bg: '#14120f',
  surface: '#201e1d',
  surface2: '#2a2723',
  ink: '#f2eade',
  muted: '#a19786',
  edge: 'rgba(255,255,255,.14)',
  accent: '#1abc9c',
  accentInk: '#7fe3cd',
  // §9 O4b: the bright dark-theme accent takes dark labels (white was 2.4:1).
  onAccent: '#0b1f1a',
  accentSoft: '#1d302c',
  // §9 O4b: lightened from #e74c3c so error text reaches 4.5:1 on every dark surface.
  danger: '#f16253',
  courseColors: {
    teal: '#5eead4',
    blue: '#93c5fd',
    indigo: '#a5b4fc',
    purple: '#d8b4fe',
    pink: '#f9a8d4',
    red: '#fca5a5',
    orange: '#fdba74',
    amber: '#fcd34d',
    green: '#86efac',
    slate: '#cbd5e1',
  },
};

export const tokens: Record<ThemeName, ThemeTokens> = { light, dark };

// §10 M4: theme accents (Pro). 'teal' is the default above; each other accent swaps only the four
// accent tokens, in both themes, and passes the same contrast rules (theme/__tests__/contrast.test.ts).
export type AccentId = 'teal' | 'ocean' | 'plum' | 'rose' | 'amber';
export type AccentTokens = Pick<ThemeTokens, 'accent' | 'accentInk' | 'onAccent' | 'accentSoft'>;

const pickAccent = (t: ThemeTokens): AccentTokens => ({ accent: t.accent, accentInk: t.accentInk, onAccent: t.onAccent, accentSoft: t.accentSoft });

export const ACCENTS: Record<AccentId, Record<ThemeName, AccentTokens>> = {
  teal: { light: pickAccent(light), dark: pickAccent(dark) },
  ocean: {
    light: { accent: '#1d5fbf', accentInk: '#1a4f9c', onAccent: '#ffffff', accentSoft: '#e1eaf7' },
    dark: { accent: '#6aa7f5', accentInk: '#a9cbfa', onAccent: '#0b1626', accentSoft: '#1b2638' },
  },
  plum: {
    light: { accent: '#7b3fa8', accentInk: '#6a3591', onAccent: '#ffffff', accentSoft: '#efe3f6' },
    dark: { accent: '#c49af0', accentInk: '#dcc2f7', onAccent: '#1d0f2a', accentSoft: '#2a2133' },
  },
  rose: {
    light: { accent: '#b8325a', accentInk: '#9e2a4d', onAccent: '#ffffff', accentSoft: '#f7e1e7' },
    dark: { accent: '#f07a9a', accentInk: '#f7b3c5', onAccent: '#2a0b14', accentSoft: '#33202a' },
  },
  amber: {
    light: { accent: '#8a5a00', accentInk: '#7a4f00', onAccent: '#ffffff', accentSoft: '#f6e8c9' },
    dark: { accent: '#e8a838', accentInk: '#f3cd85', onAccent: '#241700', accentSoft: '#30271a' },
  },
};

export const DEFAULT_ACCENT: AccentId = 'teal';
export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && value in ACCENTS;
}

// A theme's tokens with an accent applied.
export function themeTokens(theme: ThemeName, accent: AccentId): ThemeTokens {
  return accent === DEFAULT_ACCENT ? tokens[theme] : { ...tokens[theme], ...ACCENTS[accent][theme] };
}
