import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import {
  COVER_TEMPLATES,
  coverDefaults,
  helveticaWidth,
  layoutCover,
  normalizeCoverConfig,
  withCoverDefaults,
  wrapText,
  type CoverItem,
  type CoverValues,
} from '../coverTemplates';
import { buildPdfFromPages } from '../pdfService';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const A4 = { width: 595.28, height: 841.89 };

const FULL: CoverValues = {
  institution: 'Shahjalal University of Science and Technology',
  title: 'Binary search trees',
  docLabel: 'Assignment 3',
  courseCode: 'CSE 101',
  courseName: 'Data Structures',
  teacher: 'Dr. Karim Ahmed',
  name: 'Rahim Uddin',
  roll: '2021331045',
  section: 'B',
  date: '2 October 2026',
  experimentNo: '2',
  experimentName: "Verification of Ohm's law",
};

type Text = Extract<CoverItem, { kind: 'text' }>;
const texts = (items: CoverItem[]) => items.filter((i): i is Text => i.kind === 'text');

function bounds(item: Text) {
  const width = helveticaWidth(item.text, item.size, item.bold);
  const left = item.align === 'center' ? item.x - width / 2 : item.x;
  return { left, right: left + width, top: item.y - item.size * 0.75, bottom: item.y + item.size * 0.22 };
}

function expectNoOverlap(items: CoverItem[]) {
  const boxes = texts(items).map(bounds);
  boxes.forEach((a, i) =>
    boxes.slice(i + 1).forEach((b) => {
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlaps).toBe(false);
    })
  );
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(A4.width);
    expect(box.bottom).toBeLessThanOrEqual(A4.height);
  }
}

describe('layoutCover', () => {
  it.each(COVER_TEMPLATES.map((t) => t.id))('%s: nothing overlaps or leaves the page', (id) => {
    expectNoOverlap(layoutCover(id, FULL, A4));
  });

  it.each(COVER_TEMPLATES.map((t) => t.id))('%s: long values wrap to at most 2 lines and still fit', (id) => {
    const long = 'Muhammad Abdur Rahim Uddin Chowdhury Talukder Bhuiyan Sarkar Mia';
    const items = layoutCover(id, { ...FULL, name: long, teacher: long, institution: `${long} ${long}` }, A4);
    expectNoOverlap(items);
    const all = texts(items);
    if (id === 'simple') {
      // The name is the only 14 pt regular line on the Simple cover.
      expect(all.filter((t) => t.size === 14 && !t.bold).length).toBe(2);
    } else {
      const nameAt = all.findIndex((t) => t.text.startsWith('Name:'));
      const rollAt = all.findIndex((t) => t.text.startsWith('Roll:'));
      expect(rollAt - nameAt).toBe(2);
      expect(all.filter((t) => t.bold && t.size === 18)).toHaveLength(2);
      expect(all.some((t) => t.text.endsWith('…'))).toBe(true);
    }
  });

  it('leaves out empty fields', () => {
    const items = layoutCover('assignment', { docLabel: 'Assignment 3', name: 'Rahim' }, A4);
    const all = texts(items).map((t) => t.text);
    expect(all).toEqual(['Assignment 3', 'Submitted by', 'Name: Rahim']);
    // No institution: no rule under it.
    expect(items.some((i) => i.kind === 'line')).toBe(false);
  });

  it('leaves out the submission box when it would be empty', () => {
    const items = layoutCover('assignment', { docLabel: 'Assignment 3' }, A4);
    expect(items.some((i) => i.kind === 'box')).toBe(false);
  });

  it('uses the type and number as the Simple heading when there is no title', () => {
    const first = texts(layoutCover('simple', { docLabel: 'Lab 2', name: 'Rahim' }, A4))[0];
    expect(first).toMatchObject({ text: 'Lab 2', bold: true, size: 24 });
  });

  it("shows '?' for characters Helvetica can't draw", () => {
    expect(texts(layoutCover('simple', { title: 'রহিম Rahim' }, A4))[0].text).toBe('???? Rahim');
  });
});

describe('wrapText', () => {
  it('breaks a word wider than the line and ends an overflow with an ellipsis', () => {
    const lines = wrapText('x'.repeat(200), 12, false, 100, 2, helveticaWidth);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    lines.forEach((line) => expect(helveticaWidth(line, 12, false)).toBeLessThanOrEqual(100));
  });
});

describe('cover config', () => {
  it('reads the pre-S4 shape as the Simple template', () => {
    expect(normalizeCoverConfig({ mode: 'template', title: 'HW', studentName: 'Rahim', courseCode: 'CSE 101' })).toEqual({
      mode: 'template',
      templateId: 'simple',
      values: { title: 'HW', name: 'Rahim', courseCode: 'CSE 101' },
    });
    expect(normalizeCoverConfig({ mode: 'template', templateId: 'nope', values: {} })).toMatchObject({ templateId: 'simple' });
    expect(normalizeCoverConfig({ mode: 'imported_image', importedUri: 'file:///a.jpg' })).toEqual({
      mode: 'imported_image',
      importedUri: 'file:///a.jpg',
    });
    expect(normalizeCoverConfig(null)).toBeUndefined();
  });

  it('fills defaults from the profile, course and type, and keeps edits (including cleared fields)', () => {
    const defaults = coverDefaults({
      profile: { name: 'Rahim', roll: '2021331045', section: 'B', institution: 'SUST' },
      course: { name: 'Data Structures', code: 'CSE 101', teacher: 'Dr. Karim' },
      docType: 'assignment',
      n: 3,
      date: new Date(2026, 9, 2),
    });
    expect(defaults).toMatchObject({ docLabel: 'Assignment 3', courseCode: 'CSE 101', teacher: 'Dr. Karim', date: '2 October 2026' });
    const cover = withCoverDefaults({ mode: 'template', templateId: 'assignment', values: { teacher: '', title: 'Trees' } }, defaults);
    expect(cover).toMatchObject({ values: { name: 'Rahim', teacher: '', title: 'Trees', docLabel: 'Assignment 3' } });
  });
});

describe('Assignment cover in the PDF', () => {
  it('shows the student, course, teacher and "Assignment 3" as real text', async () => {
    const image = new File(Paths.cache, 'cover_page.png');
    image.write(makePng(20, 28));
    const defaults = coverDefaults({
      profile: { name: 'Rahim Uddin', roll: '2021331045', section: '', institution: '' },
      course: { name: 'Data Structures', code: 'CSE 101', teacher: 'Dr. Karim' },
      docType: 'assignment',
      n: 3,
      date: new Date(2026, 9, 2),
    });
    const { uri } = await buildPdfFromPages('doc_cover', [{ uri: image.uri, width: 20, height: 28 }], 'as-is', {
      enableBorder: false,
      coverPage: withCoverDefaults({ mode: 'template', templateId: 'assignment', values: {} }, defaults),
    });
    const doc = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
    expect(doc.numPages).toBe(2);
    const content = await (await doc.getPage(1)).getTextContent();
    const text = (content.items as { str: string }[]).map((i) => i.str).join(' ').replace(/\s+/g, ' ');
    for (const expected of ['Assignment 3', 'CSE 101 · Data Structures', 'Name: Rahim Uddin', 'Roll: 2021331045', 'Teacher: Dr. Karim', 'Date of submission: 2 October 2026']) {
      expect(text).toContain(expected);
    }
  });
});
