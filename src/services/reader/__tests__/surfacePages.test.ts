import { makeDoc, makePage } from '../../../test/fixtures';
import { imagePlacement, pageDimensions } from '../../pdf/pdfService';
import { boxToSpace, invert, mapPoint, mapRect, matrix3, multiply, overlayMatrix, pixelSpace, pointsSpace, spaceScale, type PageSpace } from '../pageSpace';
import { surfacePagesFor } from '../surfacePages';

const near = (got: { x: number; y: number }, x: number, y: number) => {
  expect(got.x).toBeCloseTo(x, 6);
  expect(got.y).toBeCloseTo(y, 6);
};

describe('§18 W8 page space', () => {
  // A 1000 × 1400 master. `corner` is a point near its top-left corner: (100, 140), a tenth in.
  const master = { width: 1000, height: 1400 };

  it('unturned: a plain scale into the box', () => {
    const m = overlayMatrix({ x: 0, y: 50, width: 400, height: 560 }, pixelSpace('master', master));
    near(mapPoint(m, 0, 0), 0, 50);
    near(mapPoint(m, 1000, 1400), 400, 610);
    near(mapPoint(m, 100, 140), 40, 106);
    expect(matrix3(m)).toEqual([0.4, 0, 0, 0, 0.4, 50, 0, 0, 1]);
  });

  it('a quarter turn clockwise: the top-left corner goes top-right', () => {
    // Shown turned, the page is landscape: 400 × 285.7 on screen, say 560 × 400 here.
    const box = { x: 20, y: 50, width: 560, height: 400 };
    const m = overlayMatrix(box, pixelSpace('master', { ...master, rotation: 90 }));
    near(mapPoint(m, 0, 0), 580, 50);
    near(mapPoint(m, 1000, 0), 580, 450);
    near(mapPoint(m, 0, 1400), 20, 50);
    // A tenth in from the master's top-left: a tenth in from the box's top-right.
    near(mapPoint(m, 100, 140), 20 + 560 * 0.9, 50 + 40);
  });

  it('a half turn and three quarters', () => {
    const half = overlayMatrix({ x: 0, y: 0, width: 400, height: 560 }, pixelSpace('master', { ...master, rotation: 180 }));
    near(mapPoint(half, 0, 0), 400, 560);
    near(mapPoint(half, 100, 140), 360, 504);
    const three = overlayMatrix({ x: 0, y: 0, width: 560, height: 400 }, pixelSpace('master', { ...master, rotation: 270 }));
    // The top-left corner goes bottom-left.
    near(mapPoint(three, 0, 0), 0, 400);
    near(mapPoint(three, 1000, 0), 0, 0);
    near(mapPoint(three, 100, 140), 56, 360);
  });

  it('keeps shapes: one scale for strokes, on every turn', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const sideways = rotation % 180 !== 0;
      const box = { x: 0, y: 0, width: sideways ? 560 : 400, height: sideways ? 400 : 560 };
      expect(spaceScale(box, pixelSpace('master', { ...master, rotation }))).toBeCloseTo(0.4);
    }
  });

  it('a touch goes back to the space', () => {
    const box = { x: 20, y: 50, width: 560, height: 400 };
    const space = pixelSpace('master', { ...master, rotation: 90 });
    const there = mapPoint(overlayMatrix(box, space), 320, 777);
    near(mapPoint(boxToSpace(box, space), there.x, there.y), 320, 777);
    const m = overlayMatrix(box, space);
    expect(multiply(invert(m), m).map((n) => Math.round(n * 1e9) / 1e9 + 0)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('a word box turns with the page', () => {
    const m = overlayMatrix({ x: 0, y: 0, width: 560, height: 400 }, pixelSpace('master', { ...master, rotation: 90 }));
    // 200 × 50 px at (100, 140): sideways on the turned page.
    const box = mapRect(m, { left: 100, top: 140, width: 200, height: 50 });
    expect(box.width).toBeCloseTo(20);
    expect(box.height).toBeCloseTo(80);
    expect(box.left).toBeCloseTo(560 - (140 + 50) * 0.4);
    expect(box.top).toBeCloseTo(40);
  });

  it('a placement: master pixels cover only part of the page', () => {
    // The master sits in the middle half of the page, both ways.
    const space: PageSpace = { ...pixelSpace('master', master), placement: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } };
    const m = overlayMatrix({ x: 0, y: 0, width: 400, height: 560 }, space);
    near(mapPoint(m, 0, 0), 100, 140);
    near(mapPoint(m, 1000, 1400), 300, 420);
    // Turned, the placement turns with the page.
    const turned = overlayMatrix({ x: 0, y: 0, width: 560, height: 400 }, { ...space, turn: 90 });
    near(mapPoint(turned, 0, 0), 420, 100);
  });

  it('points of the shown page map straight on', () => {
    const m = overlayMatrix({ x: 0, y: 0, width: 400, height: 565.7 }, pointsSpace({ width: 595, height: 842 }));
    near(mapPoint(m, 595, 842), 400, 565.7);
  });
});

describe('§18 W8 surface pages', () => {
  it('a 2-in-1 scan with a cover reads as single pages in library numbering', () => {
    const doc = makeDoc({
      coverKind: 'template',
      pdfLayout: '2_in_1',
      pages: [
        makePage({ id: 'cover', thumbUri: 'thumb_0' }),
        makePage({ id: 'a', displayUri: 'display_1' }),
        makePage({ id: 'b', width: 1400, height: 1000 }),
        makePage({ id: 'c', rotation: 90 }),
        makePage({ id: 'd' }),
      ],
    });
    // The session isn't used: a scan's document.pdf (three sheets here) is not what is read.
    const pages = surfacePagesFor({ doc }, { pages: [{ width: 595, height: 842 }] });
    expect(pages.map((p) => p.id)).toEqual(['cover', 'a', 'b', 'c', 'd']);
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(pages.every((p) => p.source.kind === 'image' && p.words === 'ocr' && p.canMark)).toBe(true);
    expect(pages[0].thumbUri).toBe('thumb_0');
    // The stamped copy is shown when there is one.
    expect(pages[1].source).toMatchObject({ uri: 'display_1', pixelW: 1000, pixelH: 1400, imageTurn: 0 });
    expect(pages[2].source).toMatchObject({ uri: doc.pages[2].fileUri });
    expect([pages[2].shownW, pages[2].shownH]).toEqual([1400, 1000]);
    // A turned page: shown sideways, its data still in the unturned master.
    expect([pages[3].shownW, pages[3].shownH]).toEqual([1400, 1000]);
    expect(pages[3].source).toMatchObject({ imageTurn: 90, pixelW: 1000, pixelH: 1400 });
    expect(pages[3].space).toEqual({ unit: 'master', width: 1000, height: 1400, turn: 90 });
  });

  it('a PDF-level document: sizes from the session, a merged scan page placed in its page', () => {
    const a4 = pageDimensions('A4');
    const doc = makeDoc({
      sourceKind: 'imported_pdf',
      pages: [
        // Indexed, then turned a quarter: the session shows it landscape already.
        makePage({ id: 'imp', fileUri: '', thumbUri: 'thumb_1', width: 1697, height: 2400, rotation: 90 }),
        // A scan's page merged in.
        makePage({ id: 'scan', width: 1000, height: 1400, thumbUri: 'thumb_2' }),
        // Not indexed yet: a stub row.
        makePage({ id: 'stub', fileUri: '', width: 850, height: 1100 }),
      ],
    });
    expect(surfacePagesFor({ doc })).toEqual([]);
    const session = { pages: [{ width: a4.height, height: a4.width }, a4, { width: 612, height: 792 }, { width: 612, height: 792 }] };
    const pages = surfacePagesFor({ doc }, session);
    expect(pages.map((p) => p.id)).toEqual(['imp', 'scan', 'stub', 'ext:3']);
    expect(pages.map((p) => p.source)).toEqual([
      { kind: 'pdf', page: 0, pointsW: a4.height, pointsH: a4.width },
      { kind: 'pdf', page: 1, pointsW: a4.width, pointsH: a4.height },
      { kind: 'pdf', page: 2, pointsW: 612, pointsH: 792 },
      { kind: 'pdf', page: 3, pointsW: 612, pointsH: 792 },
    ]);

    // Imported: indexed pixels, turned onto the page as it shows now.
    expect(pages[0]).toMatchObject({ words: 'ocr', canMark: true, thumbUri: 'thumb_1', space: { unit: 'indexed', width: 1697, height: 2400, turn: 90 } });
    near(mapPoint(overlayMatrix({ x: 0, y: 0, width: pages[0].shownW, height: pages[0].shownH }, pages[0].space), 0, 0), a4.height, 0);

    // The merged scan page: a master pixel lands where the builder drew it.
    expect(pages[1]).toMatchObject({ words: 'ocr', canMark: true, space: { unit: 'master', width: 1000, height: 1400, turn: 0 } });
    const fit = imagePlacement(1000, 1400, 'full', a4);
    const m = overlayMatrix({ x: 0, y: 0, width: a4.width, height: a4.height }, pages[1].space);
    near(mapPoint(m, 0, 0), fit.origin.x, a4.height - fit.origin.y - fit.height);
    near(mapPoint(m, 1000, 1400), fit.origin.x + fit.width, a4.height - fit.origin.y);
    near(mapPoint(m, 500, 700), fit.origin.x + 500 * fit.scale, a4.height - fit.origin.y - fit.height + 700 * fit.scale);

    // The stub's own 850 × 1100 is never used: it reads like an outside page.
    expect(pages[2]).toMatchObject({ shownW: 612, shownH: 792, words: 'live', canMark: false, space: { unit: 'points', width: 612, height: 792, turn: 0 } });
    expect(pages[3]).toMatchObject({ words: 'live', canMark: false });
  });

  it('a merged scan page turned with its PDF page keeps its marks on the image', () => {
    const a4 = pageDimensions('A4');
    const doc = makeDoc({ sourceKind: 'imported_pdf', pages: [makePage({ id: 'scan', width: 1000, height: 1400, rotation: 90 })] });
    // /Rotate 90: the session shows the A4 page landscape.
    const [page] = surfacePagesFor({ doc }, { pages: [{ width: a4.height, height: a4.width }] });
    const fit = imagePlacement(1000, 1400, 'full', a4);
    const m = overlayMatrix({ x: 0, y: 0, width: page.shownW, height: page.shownH }, page.space);
    // The image's top-left corner, a margin in from the unturned page's top-left, is a margin in
    // from the shown page's top-right.
    const left = fit.origin.x;
    const top = a4.height - fit.origin.y - fit.height;
    near(mapPoint(m, 0, 0), a4.height - top, left);
  });

  it('an outside PDF: every session page, in shown points', () => {
    const pages = surfacePagesFor({ external: { format: 'PDF' } }, { pages: [{ width: 595, height: 842 }, { width: 842, height: 595 }] });
    expect(pages.map((p) => p.id)).toEqual(['ext:0', 'ext:1']);
    expect(pages[1]).toEqual({
      id: 'ext:1',
      index: 1,
      shownW: 842,
      shownH: 595,
      source: { kind: 'pdf', page: 1, pointsW: 842, pointsH: 595 },
      space: { unit: 'points', width: 842, height: 595, turn: 0 },
      words: 'live',
      canMark: false,
    });
    expect(surfacePagesFor({ external: { format: 'PDF' } })).toEqual([]);
  });

  it('formats with their own viewer have no pages', () => {
    expect(surfacePagesFor({ external: { format: 'DOCX' } }, { pages: [{ width: 1, height: 1 }] })).toEqual([]);
    expect(surfacePagesFor({ doc: makeDoc({ format: 'TXT', pages: [makePage()] }) })).toEqual([]);
  });
});
