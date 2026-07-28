import { useTheme } from './ThemeProvider';

// The Capture screen's background/surfaces are always this fixed dark chrome regardless of
// the app's light/dark theme setting — but its accent color still follows the live theme
// (the source design's shutter ring literally reads var(--accent), everything else is a
// hardcoded dark value). See captureChromeStatic + useCaptureChrome below.
export const captureChromeStatic = {
  base: '#0e100f',
  gradientInner: '#2b2822',
  gradientMid: '#111110',
  gradientOuter: '#0b0b0a',
  pillBg: 'rgba(255,255,255,.09)',
  pillBorder: 'rgba(255,255,255,.22)',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,.6)',
  frameIdle: 'rgba(255,255,255,.5)',
  scrim: 'rgba(0,0,0,.55)',
} as const;

export function useCaptureChrome() {
  const { tokens } = useTheme();
  return {
    ...captureChromeStatic,
    accent: tokens.accent,
    accentInk: tokens.accentInk,
  };
}
