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
};

export const tokens: Record<ThemeName, ThemeTokens> = { light, dark };
