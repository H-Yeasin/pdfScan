import {
  cellAddress,
  cellMatches,
  columnAt,
  columnLetter,
  columnOffsets,
  columnWindow,
  firstCellFrom,
  focalColumnScroll,
  focalScroll,
  gutterWidth,
  matchedColumns,
  rowHeight,
  sameWindow,
  scrollIntoView,
} from '../sheetWindow';

describe('columns', () => {
  const offsets = columnOffsets([60, 100, 80, 60, 120]);

  it('adds up where each column starts', () => {
    expect(offsets).toEqual([0, 60, 160, 240, 300, 420]);
    expect(columnOffsets([])).toEqual([0]);
  });

  it('finds the column at a point', () => {
    expect(columnAt(offsets, 0)).toBe(0);
    expect(columnAt(offsets, 59)).toBe(0);
    expect(columnAt(offsets, 60)).toBe(1);
    expect(columnAt(offsets, 299)).toBe(3);
    expect(columnAt(offsets, 9999)).toBe(4);
    expect(columnAt(offsets, -5)).toBe(0);
    expect(columnAt([0], 10)).toBe(0);
  });

  it('draws only the columns near the screen', () => {
    const wide = columnOffsets(new Array<number>(150).fill(100));
    expect(columnWindow(wide, 0, 360)).toEqual({ first: 0, last: 7 });
    const middle = columnWindow(wide, 5000, 360);
    expect(middle.first).toBeLessThanOrEqual(50 - 3);
    expect(middle.last).toBeGreaterThanOrEqual(53 + 3);
    expect(middle.last - middle.first).toBeLessThan(14);
    expect(columnWindow(wide, 14_900, 360).last).toBe(149);
    expect(columnWindow([0], 0, 360)).toEqual({ first: 0, last: -1 });
  });

  it('keeps the same window through a small scroll', () => {
    const wide = columnOffsets(new Array<number>(150).fill(100));
    expect(sameWindow(columnWindow(wide, 5000, 360), columnWindow(wide, 5060, 360))).toBe(true);
    expect(sameWindow(columnWindow(wide, 5000, 360), columnWindow(wide, 5400, 360))).toBe(false);
  });

  it('names columns and cells as a spreadsheet does', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(cellAddress(11, 2)).toBe('C12');
    expect(cellAddress(0, 0)).toBe('A1');
  });

  it('makes room for the last row number', () => {
    expect(gutterWidth(5000, 1)).toBeGreaterThan(gutterWidth(50, 1));
    expect(gutterWidth(5, 1)).toBe(gutterWidth(50, 1));
    expect(gutterWidth(50, 2)).toBe(2 * gutterWidth(50, 1));
  });
});

describe('focalScroll', () => {
  it('keeps the point under the fingers where it was', () => {
    // 1000 into the content, 200 down the view; the content doubles.
    const next = focalScroll(800, 200, 2);
    expect(next).toBe(1800);
    expect((next + 200) / 2).toBe(800 + 200);
  });

  it('allows for what lies before the content', () => {
    // 80 of frozen rows before, 96 after: the same row stays under the fingers.
    const before = 400 + 300 - 80;
    const next = focalScroll(400, 300, 1.2, 80, 96);
    expect(next + 300 - 96).toBeCloseTo(before * 1.2);
  });

  it('never scrolls before the start', () => {
    expect(focalScroll(0, 300, 0.5)).toBe(0);
  });

  it('keeps the column under the fingers, though each column is rounded by itself', () => {
    const before = columnOffsets([60, 100, 80]);
    const after = columnOffsets([78, 130, 104]);
    // Half way into the second column, 150 from the left edge, 40 of row numbers.
    const scrollX = 60 + 50 - (150 - 40);
    const next = focalColumnScroll(before, after, Math.max(0, scrollX), 150, 40, 52);
    expect(next + 150 - 52).toBeCloseTo(78 + 65);
    expect(focalColumnScroll([0], [0], 0, 100, 40, 52)).toBe(0);
  });
});

describe('scrollIntoView', () => {
  it('leaves a cell that is in view alone', () => {
    expect(scrollIntoView(100, 300, 150, 60)).toBe(100);
  });
  it('moves just far enough either way', () => {
    expect(scrollIntoView(100, 300, 40, 60)).toBe(40);
    expect(scrollIntoView(100, 300, 380, 60)).toBe(140);
  });
  it('shows the start of a cell wider than the view', () => {
    expect(scrollIntoView(0, 300, 500, 400)).toBe(500);
  });
});

describe('cellMatches', () => {
  const rows = [
    ['Name', 'Total', 'Note'],
    ['Asha', '91', 'subtotal ok'],
    ['Rafi', '78', ''],
    ['TOTAL', '169', 'total'],
  ];

  it('counts cells, row by row and left to right', () => {
    expect(cellMatches(rows, 'total')).toEqual({
      cells: [
        { row: 0, col: 1 },
        { row: 1, col: 2 },
        { row: 3, col: 0 },
        { row: 3, col: 2 },
      ],
      partial: false,
    });
    expect(cellMatches(rows, '  ')).toEqual({ cells: [], partial: false });
    expect(cellMatches(rows, 'zebra').cells).toEqual([]);
  });

  it('searches only the columns that are shown', () => {
    expect(cellMatches(rows, 'total', 2).cells).toEqual([
      { row: 0, col: 1 },
      { row: 3, col: 0 },
    ]);
  });

  it('stops at the cap and says there are more', () => {
    expect(cellMatches(rows, 'total', 200, 2)).toMatchObject({ partial: true, cells: { length: 2 } });
    expect(cellMatches(rows, 'total', 200, 4).partial).toBe(false);
  });

  it('finds the first match from a row, and a row\'s matches', () => {
    const { cells } = cellMatches(rows, 'total');
    expect(firstCellFrom(cells, { row: 0, col: 0 })).toBe(0);
    expect(firstCellFrom(cells, { row: 1, col: 0 })).toBe(1);
    expect(firstCellFrom(cells, { row: 2, col: 0 })).toBe(2);
    expect(firstCellFrom(cells, { row: 3, col: 1 })).toBe(3);
    expect(firstCellFrom(cells, { row: 4, col: 0 })).toBe(4);
    expect(matchedColumns(cells, 3)).toEqual([0, 2]);
    expect(matchedColumns(cells, 2)).toEqual([]);
  });
});

describe('rowHeight', () => {
  it('is whole points at every zoom', () => {
    for (const zoom of [0.6, 0.7, 1, 1.3, 2.5]) expect(Number.isInteger(rowHeight(zoom))).toBe(true);
  });
});
