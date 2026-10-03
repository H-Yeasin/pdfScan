import { SHEET_ZOOM_MAX, SHEET_ZOOM_MIN, sheetZoom } from '../SheetView';

describe('sheet pinch zoom (§12 D11)', () => {
  it('scales from where the pinch started, in steps of 0.1, within the limits', () => {
    expect(sheetZoom(1, 1.33)).toBe(1.3);
    expect(sheetZoom(1.5, 0.5)).toBe(0.8);
    expect(sheetZoom(1, 10)).toBe(SHEET_ZOOM_MAX);
    expect(sheetZoom(1, 0.1)).toBe(SHEET_ZOOM_MIN);
  });
});
