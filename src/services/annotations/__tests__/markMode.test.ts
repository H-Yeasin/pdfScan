import { makeDoc, makePage } from '../../../test/fixtures';
import { libraryIdxFor, pdfPageFor } from '../../documents/pageMap';
import {
  clampView,
  columnLayout,
  contentToMaster,
  currentPage,
  DEFAULT_MARK,
  markWindow,
  normalizeMark,
  pageAtY,
  screenToContent,
  viewForPage,
  zoomAbout,
} from '../markMode';

describe('§12 D3 Mark mode window', () => {
  it('keeps the page on screen and its neighbours', () => {
    expect(markWindow(0, 10)).toEqual([0, 1]);
    expect(markWindow(4, 10)).toEqual([3, 4, 5]);
    expect(markWindow(9, 10)).toEqual([8, 9]);
    expect(markWindow(0, 1)).toEqual([0]);
    expect(markWindow(5, 10, 2)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('§12 D3 Mark mode column', () => {
  // Two A4-ish pages and a landscape one, at a 400 pt wide screen, 10 pt apart.
  const pages = [makePage({ width: 1000, height: 1400 }), makePage({ width: 1000, height: 1400 }), makePage({ width: 2000, height: 1000 })];
  const layout = columnLayout(pages, 400, 10);
  const viewport = { width: 400, height: 800 };

  it('stacks pages at the column width', () => {
    expect(layout.heights).toEqual([560, 560, 200]);
    expect(layout.tops).toEqual([10, 580, 1150]);
    expect(layout.total).toBe(1360);
  });

  it('finds the page under a point and in the middle of the screen', () => {
    expect(pageAtY(layout, 0)).toBe(0);
    expect(pageAtY(layout, 575)).toBe(0);
    expect(pageAtY(layout, 600)).toBe(1);
    expect(pageAtY(layout, 5000)).toBe(2);
    expect(currentPage(layout, { scale: 1, tx: 0, ty: 0 }, 800)).toBe(0);
    expect(currentPage(layout, { scale: 1, tx: 0, ty: -400 }, 800)).toBe(1);
  });

  it('maps a touch to master pixels through the zoom', () => {
    const view = { scale: 2, tx: -100, ty: -1200 };
    const content = screenToContent(view, 300, 400);
    expect(content).toEqual({ x: 200, y: 800 });
    // Page 2 starts at 580; 400 pt wide is 1000 px, so 2.5 px per point.
    expect(contentToMaster(layout, pages[1], 1, content.x, content.y)).toEqual({ x: 500, y: 550 });
  });

  it('keeps the column on screen', () => {
    expect(clampView(layout, { scale: 1, tx: 30, ty: 50 }, viewport)).toEqual({ scale: 1, tx: 0, ty: 0 });
    // The end: the last page's bottom at the screen's bottom.
    expect(clampView(layout, { scale: 1, tx: 0, ty: -5000 }, viewport)).toEqual({ scale: 1, tx: 0, ty: -560 });
    // Zoomed in, it can move sideways as far as the zoomed width allows.
    expect(clampView(layout, { scale: 2, tx: -1000, ty: 0 }, viewport).tx).toBe(-400);
    expect(clampView(layout, { scale: 0.5, tx: 0, ty: 0 }, viewport).scale).toBe(1);
  });

  it('opens on a page, and zooms about the pinch', () => {
    const short = { width: 400, height: 400 };
    expect(viewForPage(layout, 1, { scale: 1, tx: 0, ty: 0 }, short).ty).toBe(-580);
    // The last page can't come to the top: the column stops at its end.
    expect(viewForPage(layout, 2, { scale: 1, tx: 0, ty: 0 }, short).ty).toBe(-960);
    expect(viewForPage(layout, 1, { scale: 1, tx: 0, ty: 0 }, viewport).ty).toBe(-560);
    const zoomed = zoomAbout({ scale: 1, tx: 0, ty: -100 }, 2, 200, 300);
    // The content under the fingers stays under them.
    expect(screenToContent(zoomed, 200, 300)).toEqual(screenToContent({ scale: 1, tx: 0, ty: -100 }, 200, 300));
  });
});

describe('§12 D3 page position between Read and Mark mode', () => {
  it('opens Mark mode on the page being read and returns to the page last marked', () => {
    // A cover, then 2-in-1 sheets: PDF page 3 holds library pages 3 and 4.
    const doc = makeDoc({ coverKind: 'template', pdfLayout: '2_in_1', pages: Array.from({ length: 6 }, (_, i) => makePage({ id: `p${i}` })) });
    const reading = 3;
    const startIdx = libraryIdxFor(doc, reading);
    expect(startIdx).toBe(3);
    // Marking the right-hand page of that sheet goes back to the same sheet.
    expect(pdfPageFor(doc, 4).page).toBe(reading);
    // Every library page comes back to the PDF page it is on.
    for (let idx = 0; idx < doc.pages.length; idx++) expect(libraryIdxFor(doc, pdfPageFor(doc, idx).page, pdfPageFor(doc, idx).slot === 'right' ? 1 : 0)).toBe(idx);
  });
});

describe('§12 D3 remembered tool', () => {
  it('reads what was stored, field by field', () => {
    expect(normalizeMark(undefined)).toEqual(DEFAULT_MARK);
    expect(normalizeMark({ tool: 'strike', highlightColor: 'green', lineColor: 'purple', penWidth: 'thick' })).toEqual({
      ...DEFAULT_MARK,
      tool: 'strike',
      highlightColor: 'green',
      penWidth: 'thick',
    });
  });
});
