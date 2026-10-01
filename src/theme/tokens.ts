import type { CourseColor } from '../types/models';

export type ThemeName = 'light' | 'dark';

export type ThemeTokens = {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  edge: string;
  accent: string;
  accentInk: string;
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
  accent: '#16a085',
  accentInk: '#0e6655',
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
  accentSoft: '#1d302c',
  danger: '#e74c3c',
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
