import { NOTE_ICON } from '../../annotations/hitTest';
import { markLine, turnedContentSize, turnedQuad, uprightTurn } from '../../annotations/marks';
import { annotationColor } from '../../annotations/palette';
import type { Annotation } from '../../../types/models';
import { textBoxOn, textCorner, textSizeOn } from '../markPlacement';
import { markShapes, shapesKey, turnedFrame } from '../markShapes';
import { mapPoint, pixelSpace } from '../pageSpace';

const row = (over: Partial<Annotation> & Pick<Annotation, 'kind' | 'data'>): Annotation => ({ id: 'a1', documentId: 'd', pageId: 'p', color: 'yellow', createdAt: 1, updatedAt: 1, ...over });
const options = { highlightAlpha: 0.45 };
const rect = { left: 100, top: 200, width: 300, height: 40 };

describe('§18 W15 markShapes, per kind', () => {
  it('a highlight is its boxes, see-through; an underline and a strike are thin solid lines', () => {
    const second = { left: 100, top: 260, width: 120, height: 40 };
    expect(markShapes(row({ kind: 'highlight', data: { rects: [rect, second] } }), options)).toEqual([
      { type: 'rect', key: 'a1:0', rect, color: annotationColor('yellow'), alpha: 0.45 },
      { type: 'rect', key: 'a1:1', rect: second, color: annotationColor('yellow'), alpha: 0.45 },
    ]);
    const [underline] = markShapes(row({ kind: 'underline', color: 'red', data: { rects: [rect] } }), options);
    expect(underline).toEqual({ type: 'rect', key: 'a1:0', rect: markLine('underline', rect), color: annotationColor('red'), alpha: 1 });
    const [strike] = markShapes(row({ kind: 'strike', color: 'blue', data: { rects: [rect] } }), options);
    expect(strike).toMatchObject({ rect: markLine('strike', rect), alpha: 1 });
  });

  it('pen strokes are paths at the pen width; one point is a dot', () => {
    const shapes = markShapes(row({ kind: 'ink', color: 'red', data: { strokes: [[[10, 20], [30.123456, 40], [50, 60]], [[5, 5]], []], width: 6 } }), options);
    expect(shapes).toEqual([
      { type: 'stroke', key: 'a1:0', path: 'M10 20 L30.12 40 L50 60', color: annotationColor('red'), width: 6 },
      { type: 'dot', key: 'a1:1', x: 5, y: 5, r: 3, color: annotationColor('red') },
    ]);
  });

  it('a note is its icon around the point it was put at', () => {
    const [note] = markShapes(row({ kind: 'note', color: 'note', data: { x: 500, y: 600 }, text: 'ask' }), options);
    expect(note).toMatchObject({ type: 'note', rect: { left: 500 - NOTE_ICON / 2, top: 600 - NOTE_ICON / 2, width: NOTE_ICON, height: NOTE_ICON } });
  });

  it('a text box is its lines in its own frame; dragged, it is drawn where the finger has it', () => {
    const box = { left: 100, top: 200, width: 400, height: 120 };
    const a = row({ kind: 'text', color: 'black', data: { box, size: 50 }, text: 'Name\nRoll 12' });
    const [text] = markShapes(a, options);
    expect(text).toMatchObject({ type: 'text', id: 'a1', box, width: 400, height: 120, size: 50, lines: [{ text: 'Name', top: 0 }, { text: 'Roll 12', top: 60 }] });
    if (text.type !== 'text') throw new Error('not a text box');
    // The frame puts the text's own corner on the box's.
    expect(mapPoint(text.frame, 0, 0)).toEqual({ x: 100, y: 200 });
    expect(mapPoint(text.frame, 400, 120)).toEqual({ x: 500, y: 320 });

    const moved = { ...box, left: 300, top: 900 };
    expect(markShapes(a, { ...options, moved: { id: 'a1', box: moved } })[0]).toMatchObject({ box: moved });
    expect(markShapes(a, { ...options, moved: { id: 'other', box: moved } })[0]).toMatchObject({ box });
  });

  it('a signature is its image in the unit square, turned as it was placed', () => {
    const box = { left: 100, top: 200, width: 60, height: 240 };
    const [sig] = markShapes(row({ kind: 'signature', color: '', data: { box, file: 'sig_a1.png', turn: 90 } }), options);
    expect(sig).toMatchObject({ type: 'signature', documentId: 'd', file: 'sig_a1.png', box });
    if (sig.type !== 'signature') throw new Error('not a signature');
    // Turned a quarter clockwise: the image's top-left is the box's top-right, its top edge
    // runs down the box's right side.
    expect(mapPoint(sig.frame, 0, 0)).toEqual({ x: 160, y: 200 });
    expect(mapPoint(sig.frame, 1, 0)).toEqual({ x: 160, y: 440 });
    expect(mapPoint(sig.frame, 0, 1)).toEqual({ x: 100, y: 200 });
  });

  it('on a night page ink-like marks take the night colour; a highlight and a note keep theirs', () => {
    const ink = (hex: string) => `night(${hex})`;
    const night = { ...options, highlightAlpha: 0.3, ink };
    expect(markShapes(row({ kind: 'ink', color: 'black', data: { strokes: [[[0, 0], [1, 1]]], width: 4 } }), night)[0]).toMatchObject({ color: `night(${annotationColor('black')})` });
    expect(markShapes(row({ kind: 'underline', color: 'red', data: { rects: [rect] } }), night)[0]).toMatchObject({ color: `night(${annotationColor('red')})` });
    expect(markShapes(row({ kind: 'text', color: 'blue', data: { box: rect, size: 30 }, text: 'x' }), night)[0]).toMatchObject({ color: `night(${annotationColor('blue')})` });
    expect(markShapes(row({ kind: 'highlight', data: { rects: [rect] } }), night)[0]).toMatchObject({ color: annotationColor('yellow'), alpha: 0.3 });
    expect(markShapes(row({ kind: 'note', color: 'note', data: { x: 1, y: 1 } }), night)[0]).toMatchObject({ fill: annotationColor('note') });
  });

  it('a row with data of another kind draws nothing', () => {
    expect(markShapes(row({ kind: 'note', data: { rects: [rect] } }), options)).toEqual([]);
  });

  it('the key changes when a row is edited, added or removed, and only then', () => {
    const a = row({ kind: 'note', data: { x: 1, y: 2 } });
    expect(shapesKey([a])).toBe(shapesKey([{ ...a }]));
    expect(shapesKey([{ ...a, updatedAt: 2 }])).not.toBe(shapesKey([a]));
    expect(shapesKey([a, { ...a, id: 'a2' }])).not.toBe(shapesKey([a]));
  });
});

describe('§18 W15 boxes that read upright on a turned page', () => {
  it('turnedQuad moves the corners on by one for each quarter turn', () => {
    const box = { left: 0, top: 0, width: 4, height: 2 };
    expect(turnedQuad(box)).toEqual({ tl: { x: 0, y: 0 }, tr: { x: 4, y: 0 }, bl: { x: 0, y: 2 } });
    expect(turnedQuad(box, 90)).toEqual({ tl: { x: 4, y: 0 }, tr: { x: 4, y: 2 }, bl: { x: 0, y: 0 } });
    expect(turnedQuad(box, 180)).toEqual({ tl: { x: 4, y: 2 }, tr: { x: 0, y: 2 }, bl: { x: 4, y: 0 } });
    expect(turnedQuad(box, 270)).toEqual({ tl: { x: 0, y: 2 }, tr: { x: 0, y: 0 }, bl: { x: 4, y: 2 } });
    expect(turnedContentSize(box, 90)).toEqual({ width: 2, height: 4 });
    expect(uprightTurn(90)).toBe(270);
    expect(uprightTurn(0)).toBe(0);
    // A frame for content of the box's own (turned) size is a pure turn: no stretch.
    const frame = turnedFrame(box, 90, turnedContentSize(box, 90));
    expect(Math.hypot(frame[0], frame[1])).toBeCloseTo(1);
    expect(Math.hypot(frame[2], frame[3])).toBeCloseTo(1);
  });

  // A 1000 × 1400 master, and the same page turned a quarter clockwise in Edit pages.
  const upright = pixelSpace('master', { width: 1000, height: 1400 });
  const turned = pixelSpace('master', { width: 1000, height: 1400, rotation: 90 });
  const measure = (line: string, size: number) => line.length * size * 0.5;

  it('on an unturned page a text box is laid out as before, with no turn', () => {
    const placed = textBoxOn(upright, 'Name', { x: 100, y: 200 }, 40, measure);
    expect(placed.turn).toBe(0);
    expect(placed.box).toMatchObject({ left: 100, top: 200, height: 48 });
    expect(placed.box.width).toBeCloseTo(4 * 20 + 6);
    expect(textCorner(placed.box, placed.turn)).toEqual({ x: 100, y: 200 });
    expect(textSizeOn(upright, 'medium')).toBeCloseTo(1000 / 45);
  });

  it('on a turned page it reads upright as shown: wide across the shown page, turned back in the space', () => {
    // The shown page is 1400 wide; sizes are shares of that.
    expect(textSizeOn(turned, 'medium')).toBeCloseTo(1400 / 45);
    const at = { x: 500, y: 700 };
    const placed = textBoxOn(turned, 'A long line of text', at, 40, measure);
    expect(placed.turn).toBe(270);
    // Upright on the shown page it is wider than tall; in the page's own space, taller than wide.
    expect(placed.box.height).toBeGreaterThan(placed.box.width);
    expect(turnedContentSize(placed.box, placed.turn).height).toBeCloseTo(48);
    // The text's own corner stays where the tap was, so the same box comes back for new words.
    const corner = textCorner(placed.box, placed.turn);
    expect(corner.x).toBeCloseTo(at.x);
    expect(corner.y).toBeCloseTo(at.y);
    const again = textBoxOn(turned, 'A long line of text', corner, 40, measure, placed.turn);
    expect(again.box.left).toBeCloseTo(placed.box.left);
    expect(again.box.top).toBeCloseTo(placed.box.top);
    expect(again.box.width).toBeCloseTo(placed.box.width);
  });

  it('a box is kept on the page', () => {
    const placed = textBoxOn(turned, 'Some words here', { x: 990, y: 1390 }, 40, measure);
    expect(placed.box.left).toBeGreaterThanOrEqual(0);
    expect(placed.box.top).toBeGreaterThanOrEqual(0);
    expect(placed.box.left + placed.box.width).toBeLessThanOrEqual(1000 + 1e-6);
    expect(placed.box.top + placed.box.height).toBeLessThanOrEqual(1400 + 1e-6);
  });
});
