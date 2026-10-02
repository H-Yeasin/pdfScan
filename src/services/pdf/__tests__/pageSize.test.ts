import { File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { makePng } from '../../../test/png';
import { buildPdfFromPages, fillPageNumbers, pageSizeOfPdf, type PageSizeId } from '../pdfService';
import { defaultPageSize } from '../pageSize';
import { footerPresetOf, footerPresetText } from '../../submit/footerPresets';
import { renderText } from '../../submit/naming';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

function page() {
  const image = new File(Paths.cache, `ps_${Math.random()}.png`);
  image.write(makePng(20, 28));
  return { uri: image.uri, width: 2000, height: 2800 };
}

async function sizes(uri: string) {
  const doc = await PDFDocument.load(await new File(uri).bytes());
  return doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

describe('page size', () => {
  it.each<[PageSizeId, number[]]>([
    ['A4', [595, 842]],
    ['Letter', [612, 792]],
  ])('%s: standard pages are portrait and 2-up sheets are the same paper in landscape', async (size, [w, h]) => {
    const standard = await buildPdfFromPages(`std_${size}`, [page(), page()], 'as-is', undefined, 'standard', size);
    expect(await sizes(standard.uri)).toEqual([
      [w, h],
      [w, h],
    ]);
    const twoUp = await buildPdfFromPages(`two_${size}`, [page(), page(), page()], 'as-is', undefined, '2_in_1', size);
    expect(await sizes(twoUp.uri)).toEqual([
      [h, w],
      [h, w],
    ]);
  });

  it('gives the cover the same paper as the content', async () => {
    const { uri } = await buildPdfFromPages(
      'cover_letter',
      [page()],
      'as-is',
      { enableBorder: false, coverPage: { mode: 'template', templateId: 'simple', values: { title: 'HW 3' } } },
      'standard',
      'Letter'
    );
    expect(await sizes(uri)).toEqual([
      [612, 792],
      [612, 792],
    ]);
  });

  it('reads the paper size back from a built PDF, so rebuilds keep it', async () => {
    const letter = await buildPdfFromPages('read_letter', [page()], 'as-is', undefined, 'standard', 'Letter');
    const twoUp = await buildPdfFromPages('read_two', [page()], 'as-is', undefined, '2_in_1', 'Letter');
    const a4 = await buildPdfFromPages('read_a4', [page()], 'as-is', undefined, 'standard', 'A4');
    expect(await pageSizeOfPdf(letter.uri)).toBe('Letter');
    expect(await pageSizeOfPdf(twoUp.uri)).toBe('Letter');
    expect(await pageSizeOfPdf(a4.uri)).toBe('A4');
    expect(await pageSizeOfPdf(undefined)).toBe('A4');
    expect(await pageSizeOfPdf('file:///missing.pdf')).toBe('A4');
  });

  it('defaults to Letter only in the US and Canada', () => {
    expect(defaultPageSize('en-US')).toBe('Letter');
    expect(defaultPageSize('fr-CA')).toBe('Letter');
    expect(defaultPageSize('en_US')).toBe('Letter');
    expect(defaultPageSize('bn-BD')).toBe('A4');
    expect(defaultPageSize('en-GB')).toBe('A4');
    expect(defaultPageSize('zh-Hans-CN')).toBe('A4');
    expect(defaultPageSize('en')).toBe('A4');
    expect(defaultPageSize('')).toBe('A4');
  });
});

const ctx = {
  profile: { name: 'Rahim Uddin', roll: '2021331045', section: '', institution: '' },
  course: { name: 'Data Structures', code: 'CSE 101' },
  docType: 'assignment' as const,
  n: 3,
  date: new Date(2026, 9, 2),
};

describe('header and footer text', () => {
  it('fills the S2 tokens and keeps {X}/{Y} for the builder', () => {
    expect(renderText(footerPresetText('namePages'), ctx)).toBe('RahimUddin · 2021331045 · {X}/{Y}');
    expect(renderText('{course} — {type}{n}', ctx)).toBe('CSE101 — HW3');
  });

  it('drops an empty token with its separator, and keeps characters a file name could not have', () => {
    const noRoll = { ...ctx, profile: { ...ctx.profile, roll: '' } };
    expect(renderText(footerPresetText('namePages'), noRoll)).toBe('RahimUddin · {X}/{Y}');
    expect(renderText('{roll} | {name}', noRoll)).toBe('RahimUddin');
    expect(renderText('Q: {name}?', ctx)).toBe('Q: RahimUddin?');
  });

  it('fills every {X} and {Y}', () => {
    expect(fillPageNumbers('{X}/{Y} ({X} of {Y})', 2, 9)).toBe('2/9 (2 of 9)');
  });

  it('recognises the presets', () => {
    expect(footerPresetOf('')).toBe('none');
    expect(footerPresetOf(undefined)).toBe('none');
    expect(footerPresetOf('Page {X} of {Y}')).toBe('pages');
    expect(footerPresetOf('{name} · {roll} · {X}/{Y}')).toBe('namePages');
    expect(footerPresetOf('Page {X}')).toBe('custom');
  });

  it('shows the Name + pages footer on every content page but not on the cover', async () => {
    const { uri } = await buildPdfFromPages(
      'footer_doc',
      [page(), page(), page()],
      'as-is',
      {
        enableBorder: false,
        footerText: renderText(footerPresetText('namePages'), ctx),
        coverPage: { mode: 'template', templateId: 'simple', values: { title: 'HW 3' } },
      },
      'standard',
      'Letter'
    );
    const doc = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      texts.push((content.items as { str: string }[]).map((item) => item.str).join(' ').replace(/\s+/g, ' '));
    }
    expect(texts[0]).not.toContain('2021331045');
    expect(texts.slice(1)).toEqual([
      expect.stringContaining('RahimUddin · 2021331045 · 1/3'),
      expect.stringContaining('RahimUddin · 2021331045 · 2/3'),
      expect.stringContaining('RahimUddin · 2021331045 · 3/3'),
    ]);
  });
});
