import type { Annotation } from '../../types/models';

// §5 T4 eraser and note editing: the topmost annotation at a point (master pixels), or null.
// `slop` is how far off a tap may land, in master pixels.
export function annotationAt(annotations: readonly Annotation[], x: number, y: number, slop: number): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    const d = a.data;
    if ('rects' in d) {
      if (d.rects.some((r) => x >= r.left - slop && x <= r.left + r.width + slop && y >= r.top - slop && y <= r.top + r.height + slop)) return a;
    } else if ('strokes' in d) {
      const reach = d.width / 2 + slop;
      if (d.strokes.some((s) => s.some(([px, py], k) => near(x, y, px, py, s[k - 1], reach)))) return a;
    } else if ('box' in d) {
      const r = d.box;
      if (x >= r.left - slop && x <= r.left + r.width + slop && y >= r.top - slop && y <= r.top + r.height + slop) return a;
    } else if (Math.hypot(x - d.x, y - d.y) <= NOTE_ICON / 2 + slop) {
      return a;
    }
  }
  return null;
}

// The note icon's size in master pixels (drawn as a square around its anchor).
export const NOTE_ICON = 60;

// Distance from (x, y) to the segment ending at (px, py), from the previous point if any.
function near(x: number, y: number, px: number, py: number, prev: [number, number] | undefined, reach: number): boolean {
  if (!prev) return Math.hypot(x - px, y - py) <= reach;
  const [ax, ay] = prev;
  const dx = px - ax;
  const dy = py - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= reach;
}
