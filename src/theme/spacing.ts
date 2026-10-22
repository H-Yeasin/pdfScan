export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// §17 U1: radii v2 ("bold student": soft, round). Chips and buttons are full pills; `full` stays for
// round things that aren't either (a dot, an avatar, a FAB). Sheets use `sheet` (the old
// `radii.sheet` / `* 1.5` were moved to it); something small and square that only wants its
// corners eased (a frame, a tool cell) uses `xs` or `thumb`, never `chip`, which is now a pill.
export const radii = {
  xs: 6,
  thumb: 8,
  input: 14,
  card: 20,
  sheet: 28,
  chip: 999,
  button: 999,
  full: 999,
} as const;

// §9 O4: touch targets are at least 48 dp. A control drawn smaller (a 36 or 44 dp icon button)
// gets the rest as hitSlop, so the layout stays as designed.
export const MIN_TOUCH = 48;
export function touchSlop(size: number): { top: number; bottom: number; left: number; right: number } {
  const d = Math.max(0, Math.ceil((MIN_TOUCH - size) / 2));
  return { top: d, bottom: d, left: d, right: d };
}
