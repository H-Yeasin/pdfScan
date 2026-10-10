import { SHEET_ZOOM_MAX, SHEET_ZOOM_MIN, sheetLineHeight, sheetRowHeight, sheetZoom } from '../SheetView';

describe('sheet pinch zoom (§12 D11)', () => {
  it('scales from where the pinch started, in steps of 0.1, within the limits', () => {
    expect(sheetZoom(1, 1.33)).toBe(1.3);
    expect(sheetZoom(1.5, 0.5)).toBe(0.8);
    expect(sheetZoom(1, 10)).toBe(SHEET_ZOOM_MAX);
    expect(sheetZoom(1, 0.1)).toBe(SHEET_ZOOM_MIN);
  });
});

describe('sheet row height (§18 W4)', () => {
  it('is the line, the padding above and below, and the line under the row', () => {
    expect(sheetRowHeight(1)).toBe(18 + 6 + 6 + 1);
    expect(sheetLineHeight(1)).toBe(18);
  });

  it('is a whole number at every zoom step, so row offsets never drift', () => {
    for (let step = Math.round(SHEET_ZOOM_MIN * 10); step <= Math.round(SHEET_ZOOM_MAX * 10); step++) {
      const zoom = step / 10;
      const height = sheetRowHeight(zoom);
      expect(Number.isInteger(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(sheetLineHeight(zoom) + 1);
    }
  });

  it('grows with the zoom', () => {
    expect(sheetRowHeight(2)).toBeGreaterThan(sheetRowHeight(1));
    expect(sheetRowHeight(1)).toBeGreaterThan(sheetRowHeight(SHEET_ZOOM_MIN));
  });
});
