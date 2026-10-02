// §9 O4b: WCAG 2 relative luminance and contrast ratio for opaque #rrggbb colours. Used by the
// contrast tests (theme tokens, course colours) to keep text readable in both themes.
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA: 4.5:1 for normal text, 3:1 for large text (18.66 px bold / 24 px) and icons.
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
