import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import { encodedBytes, renderPage } from '../../enhance/skiaEnhance';
import { buildPdfFromPages } from '../../pdf/pdfService';
import { SIZE_LADDER } from '../../capture/imageSpec';
import type { OcrBlock, PageOcr } from '../../../types/models';
import {
  buildPdfUnderLimit,
  buildUnderLimit,
  findLevel,
  formatLimit,
  MB,
  pdfOverheadBytes,
  predictLevel,
  samplePageIndexes,
  tooLargeMessage,
} from '../sizeTarget';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn(), encodedBytes: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Sampled page sizes for 9 levels, shrinking down the ladder like real JPEGs.
const SAMPLES = [900, 600, 300, 220, 150, 100, 65, 45, 30].map((kb) => [kb * 1000, kb * 1000]);

describe('predictLevel', () => {
  it('picks the best level that fits with the 5 % margin', () => {
    // 10 pages at 150 KB + 20 KB overhead = 1.52 MB, under 1.9 MB (2 MB less 5 %).
    expect(predictLevel(SAMPLES, 10, 20_000, 2 * MB)).toBe(4);
  });

  it('counts an exact fit only inside the margin', () => {
    // Level 2: 3 pages at 300 KB + 0 = 900 KB.
    expect(predictLevel(SAMPLES, 3, 0, 900_000 / 0.95)).toBe(2);
    expect(predictLevel(SAMPLES, 3, 0, 900_000)).toBe(3);
  });

  it('returns the lowest level when nothing fits', () => {
    expect(predictLevel(SAMPLES, 100, 0, 1 * MB)).toBe(8);
  });

  it('keeps one small page at full quality', () => {
    expect(predictLevel(SAMPLES, 1, 10_000, 2 * MB)).toBe(0);
  });

  it('uses the mean of the samples', () => {
    expect(predictLevel([[100_000, 900_000], [50_000, 150_000]], 2, 0, 1 * MB)).toBe(1);
  });
});

describe('findLevel', () => {
  it('agrees with predictLevel while measuring at most 4 levels', async () => {
    for (const [pages, limit] of [[10, 2 * MB], [3, 1 * MB], [1, 10 * MB], [100, 1 * MB], [40, 5 * MB]]) {
      const measure = jest.fn(async (level: number) => SAMPLES[level]);
      expect(await findLevel(measure, pages, 20_000, limit)).toBe(predictLevel(SAMPLES, pages, 20_000, limit));
      expect(measure.mock.calls.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('samplePageIndexes', () => {
  it('takes the first, the middle and the largest page once each', () => {
    expect(samplePageIndexes([5, 1, 1, 9, 1])).toEqual([0, 2, 3]);
    expect(samplePageIndexes([9, 1, 1])).toEqual([0, 1]);
    expect(samplePageIndexes([4])).toEqual([0]);
    expect(samplePageIndexes([])).toEqual([]);
  });
});

describe('buildUnderLimit', () => {
  it('steps down one level when the first build overshoots', async () => {
    const sizes = [2_400_000, 2_100_000, 1_700_000];
    const build = jest.fn(async (level: number) => ({ uri: `file:///l${level}.pdf`, sizeBytes: sizes[level - 3] }));
    const result = await buildUnderLimit(build, 4, 2 * MB);
    expect(build.mock.calls.map(([level]) => level)).toEqual([4, 5]);
    expect(result).toEqual({ uri: 'file:///l5.pdf', sizeBytes: 1_700_000, level: 5, fits: true, builds: 2 });
  });

  it('gives up after 3 builds and returns the smallest file', async () => {
    const build = jest.fn(async (level: number) => ({ uri: `file:///l${level}.pdf`, sizeBytes: 5_000_000 - level * 100_000 }));
    const result = await buildUnderLimit(build, 2, 1 * MB);
    expect(build).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ level: 4, sizeBytes: 4_600_000, fits: false });
  });

  it('stops at the lowest level', async () => {
    const build = jest.fn(async () => ({ uri: 'file:///x.pdf', sizeBytes: 3 * MB }));
    const result = await buildUnderLimit(build, 8, 1 * MB);
    expect(build).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ level: 8, fits: false });
  });
});

describe('messages', () => {
  it('formats limits the way upload forms count', () => {
    expect(formatLimit(2 * MB)).toBe('2 MB');
    expect(formatLimit(1_500_000)).toBe('1.5 MB');
    expect(formatLimit(2_000_001)).toBe('2.01 MB');
    expect(formatLimit(800_000)).toBe('800 KB');
  });

  it('says whether the lowest quality was reached', () => {
    expect(tooLargeMessage({ sizeBytes: 1_300_000, level: 8 }, 1 * MB)).toBe(
      'This scan is too large for 1 MB even at the lowest quality (1.3 MB). Remove pages or choose a bigger limit.'
    );
    expect(tooLargeMessage({ sizeBytes: 1_300_000, level: 5 }, 1 * MB)).toMatch(/^Couldn't get this scan under 1 MB \(1.3 MB\)/);
  });
});

function ocrFor(lineCount: number): PageOcr {
  const blocks: OcrBlock[] = Array.from({ length: lineCount }, (_, i) => {
    const text = `Line ${i}: the quick brown fox jumps over the lazy dog, twice over`;
    const bounding = { left: 100, top: 40 + i * 45, width: 1800, height: 30 };
    return { text, bounding, lines: [{ text, bounding }] };
  });
  return { text: blocks.map((b) => b.text).join('\n'), blocks };
}

function pngPage(): string {
  const image = new File(Paths.cache, `page_${Math.random()}.png`);
  image.write(makePng(20, 28));
  return image.uri;
}

describe('PDF overhead', () => {
  it('stays under the stored constants, with OCR text, a cover and a footer', async () => {
    for (const pageCount of [1, 10]) {
      const uri = pngPage();
      const imageBytes = new File(uri).size * pageCount;
      const pages = Array.from({ length: pageCount }, () => ({ uri, width: 2000, height: 2800, ocr: ocrFor(60) }));
      const { sizeBytes } = await buildPdfFromPages(`doc_overhead_${pageCount}`, pages, 'as-is', {
        enableBorder: true,
        footerText: 'Page {X} of {Y}',
        coverPage: {
          mode: 'template',
          templateId: 'assignment',
          values: { institution: 'SUST', docLabel: 'Assignment 3', name: 'Rahim Uddin', roll: '2021331045', courseCode: 'CSE 101', teacher: 'Dr. Karim', date: '2 October 2026' },
        },
      });
      expect(sizeBytes - imageBytes).toBeLessThan(pdfOverheadBytes(pageCount));
    }
  });
});

describe('a PDF built at a ladder level', () => {
  it('keeps its OCR text layer', async () => {
    // The real renderPage re-encodes at the preset; here it just hands back another small image.
    (renderPage as jest.Mock).mockImplementation(async () => ({ uri: pngPage(), width: 20, height: 28 }));
    const { uri } = await buildPdfFromPages('doc_ladder', [{ uri: pngPage(), width: 2000, height: 2800, ocr: ocrFor(3) }], SIZE_LADDER[6]);
    expect(renderPage).toHaveBeenCalledWith(expect.any(String), {}, SIZE_LADDER[6]);

    const doc = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
    const content = await (await doc.getPage(1)).getTextContent();
    const text = (content.items as { str: string }[]).map((item) => item.str).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Line 2');
    expect(text).toContain('lazy dog');
  });
});

describe('buildPdfUnderLimit', () => {
  it('samples, builds at the predicted level and keeps the result under the limit', async () => {
    // A page encodes to 50 bytes per pixel of its long side.
    (encodedBytes as jest.Mock).mockImplementation(async (_uri: string, _edits: unknown, preset: { maxDim: number }) =>
      preset.maxDim * 50
    );
    (renderPage as jest.Mock).mockImplementation(async () => ({ uri: pngPage(), width: 20, height: 28 }));
    const pages = Array.from({ length: 10 }, () => {
      const uri = pngPage();
      return { uri, width: 2000, height: 2800 };
    });
    // Pretend the masters are 1 MB each, so level 0 can't fit.
    const big = new Uint8Array(1_000_000);
    pages.forEach((page) => new File(page.uri).write(big));

    const result = await buildPdfUnderLimit('doc_fit', pages, 1 * MB);
    // 1800 px x 50 = 90 KB a page: 900 KB + 28 KB overhead fits under 950 KB (1 MB less 5 %);
    // 2200 px would be 1.1 MB.
    expect(SIZE_LADDER[result.level].maxDim).toBe(1800);
    expect(result.fits).toBe(true);
    expect(result.builds).toBe(1);
    // 3 sampled pages (first, middle, largest = first) -> 2 distinct, at no more than 4 levels.
    expect((encodedBytes as jest.Mock).mock.calls.length).toBeLessThanOrEqual(8);
  });
});
