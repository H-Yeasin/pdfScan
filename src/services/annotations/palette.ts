// §5 T4: annotation colours. These mark the page (paper), not the app's UI, so they are fixed
// values rather than theme tokens: a highlight looks the same in the PDF, in other apps and in
// either app theme.
export const HIGHLIGHT_COLORS = {
  yellow: '#ffd43b',
  green: '#8ce99a',
  pink: '#faa2c1',
  blue: '#74c0fc',
} as const;

export const PEN_COLORS = {
  black: '#212529',
  red: '#e03131',
  blue: '#1c7ed6',
} as const;

export const NOTE_COLOR = '#ffd43b';

const ALL: Record<string, string> = { ...HIGHLIGHT_COLORS, ...PEN_COLORS, note: NOTE_COLOR };

export function annotationColor(key: string): string {
  return ALL[key] ?? HIGHLIGHT_COLORS.yellow;
}

// "#rrggbb" → [r, g, b] in 0..1, for PDF colour operators.
export function rgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Pen widths in master pixels (a 2400 px master is about 290 dpi on A4).
export const PEN_WIDTHS = { thin: 4, thick: 10 } as const;
// How tall a highlighter stroke is, in master pixels, for snapping to the words it crosses.
export const HIGHLIGHTER_THICKNESS = 24;
