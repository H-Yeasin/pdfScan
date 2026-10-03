import type { OcrBounding, PageOcr } from '../../types/models';
import { readingOrderTokens, selectionText, type TextToken } from '../study/textSelection';

export type Point = [number, number];

function expand(box: OcrBounding, by: number): OcrBounding {
  return { left: box.left - by, top: box.top - by, width: box.width + by * 2, height: box.height + by * 2 };
}

function inside(box: OcrBounding, x: number, y: number): boolean {
  return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
}

// The points along a stroke every `step` pixels, so fast strokes (few touch samples) still pass
// through every word they cross.
function sample(stroke: readonly Point[], step: number): Point[] {
  const out: Point[] = [];
  stroke.forEach((p, i) => {
    const prev = stroke[i - 1];
    if (!prev) {
      out.push(p);
      return;
    }
    const n = Math.max(1, Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) / step));
    for (let k = 1; k <= n; k++) out.push([prev[0] + ((p[0] - prev[0]) * k) / n, prev[1] + ((p[1] - prev[1]) * k) / n]);
  });
  return out;
}

function union(boxes: readonly OcrBounding[]): OcrBounding {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

// §5 T4: a highlighter stroke snapped to the words it passes through (within half the stroke's
// thickness), merged into one rect per OCR line, plus the highlighted text. A stroke that crosses
// no word becomes one free rect around itself, with no text. §12 D3's underline and strike snap
// the same way; only how the rects are drawn differs (marks.markLine).
export function snapHighlight(
  stroke: readonly Point[],
  ocr: PageOcr | undefined,
  thickness: number
): { rects: OcrBounding[]; text?: string } {
  if (stroke.length === 0) return { rects: [] };
  const tokens = readingOrderTokens(ocr);
  const points = sample(stroke, Math.max(2, thickness / 4));
  const hit: TextToken[] = tokens.filter((token) => {
    const zone = expand(token.bounding, thickness / 2);
    return points.some(([x, y]) => inside(zone, x, y));
  });
  if (hit.length === 0) {
    const half = thickness / 2;
    const xs = stroke.map((p) => p[0]);
    const ys = stroke.map((p) => p[1]);
    const left = Math.min(...xs) - half;
    const top = Math.min(...ys) - half;
    return { rects: [{ left, top, width: Math.max(...xs) + half - left, height: Math.max(...ys) + half - top }] };
  }
  return wordRects(hit);
}

// Words (from a stroke, or §12 D3's Select text → Highlight/Underline) as one rect per OCR line
// they're on, plus their text in reading order.
export function wordRects(words: readonly TextToken[]): { rects: OcrBounding[]; text?: string } {
  if (words.length === 0) return { rects: [] };
  const byLine = new Map<string, TextToken[]>();
  for (const token of words) {
    const key = `${token.block}:${token.line}`;
    byLine.set(key, [...(byLine.get(key) ?? []), token]);
  }
  return { rects: [...byLine.values()].map((line) => union(line.map((t) => t.bounding))), text: selectionText(words) || undefined };
}
