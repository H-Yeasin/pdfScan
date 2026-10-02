export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  chip: 8,
  card: 12,
  thumb: 6,
  full: 999,
} as const;

// §9 O4: touch targets are at least 48 dp. A control drawn smaller (a 36 or 44 dp icon button)
// gets the rest as hitSlop, so the layout stays as designed.
export const MIN_TOUCH = 48;
export function touchSlop(size: number): { top: number; bottom: number; left: number; right: number } {
  const d = Math.max(0, Math.ceil((MIN_TOUCH - size) / 2));
  return { top: d, bottom: d, left: d, right: d };
}
