import type { PageOcr } from '../../../types/models';
import { extractDocumentText, readingOrderTokens, selectBetween, selectionText, tokenAt } from '../textSelection';

const box = (left: number, top: number, width = 40, height = 20) => ({ left, top, width, height });

// Two blocks; the first has two lines with word boxes, the second a line without (pre-T1 OCR).
const OCR: PageOcr = {
  text: 'The quick fox\njumps over\nOld line',
  blocks: [
    {
      text: 'The quick fox jumps over',
      bounding: box(0, 0, 300, 60),
      lines: [
        { text: 'The quick fox', bounding: box(0, 0, 200, 20), words: [{ text: 'The', bounding: box(0, 0) }, { text: 'quick', bounding: box(50, 0) }, { text: 'fox', bounding: box(100, 0) }] },
        { text: 'jumps over', bounding: box(0, 30, 200, 20), words: [{ text: 'jumps', bounding: box(0, 30) }, { text: 'over', bounding: box(50, 30) }] },
      ],
    },
    { text: 'Old line', bounding: box(0, 100, 200, 20), lines: [{ text: 'Old line', bounding: box(0, 100, 200, 20) }] },
  ],
};

describe('text selection', () => {
  const tokens = readingOrderTokens(OCR);

  it('flattens blocks, lines and words in reading order; a line without words is one token', () => {
    expect(tokens.map((t) => t.text)).toEqual(['The', 'quick', 'fox', 'jumps', 'over', 'Old line']);
  });

  it('finds the token under a point, or the nearest one', () => {
    expect(tokenAt(tokens, 60, 10)?.text).toBe('quick');
    expect(tokenAt(tokens, 97, 10)?.text).toBe('fox'); // in the gap: 3 px from fox, 7 from quick
    expect(tokenAt([], 0, 0)).toBeNull();
  });

  it('selects across lines and blocks in reading order, whichever end is first', () => {
    const quick = tokens[1];
    const old = tokens[5];
    expect(selectionText(selectBetween(tokens, quick, old))).toBe('quick fox\njumps over\nOld line');
    expect(selectBetween(tokens, old, quick)).toEqual(selectBetween(tokens, quick, old));
  });

  it('selects whole lines on pages without word boxes', () => {
    const lineOnly = readingOrderTokens({
      text: 'a\nb',
      blocks: [{ text: 'a b', bounding: box(0, 0), lines: [{ text: 'First line', bounding: box(0, 0) }, { text: 'Second line', bounding: box(0, 30) }] }],
    });
    expect(selectionText(selectBetween(lineOnly, lineOnly[0], lineOnly[1]))).toBe('First line\nSecond line');
  });

  it('extracts a document with page separators', () => {
    const text = extractDocumentText({
      pages: [
        { id: 'a', fileUri: '', width: 1, height: 1, ocr: { text: ' Page one text \n', blocks: [] } },
        { id: 'b', fileUri: '', width: 1, height: 1 },
      ],
    });
    expect(text).toBe('--- Page 1 ---\nPage one text\n\n--- Page 2 ---\n(no text found)\n');
  });
});

describe('writeDocumentText', () => {
  it('writes the extract as a .txt file, replacing an earlier one', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File } = require('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeDocumentText } = require('../textExport');
    const doc = { id: 'doc_txt', pages: [{ id: 'a', fileUri: '', width: 1, height: 1, ocr: { text: 'Hello', blocks: [] } }] };
    writeDocumentText({ ...doc, pages: [] });
    const uri = writeDocumentText(doc);
    expect(uri).toMatch(/extract\/doc_txt\.txt$/);
    expect(new File(uri).textSync()).toBe('--- Page 1 ---\nHello\n');
  });
});
