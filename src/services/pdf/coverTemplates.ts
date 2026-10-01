import { StandardFontEmbedder, StandardFonts } from 'pdf-lib';
import { getDocType } from '../courses/docTypes';
import { WIN_ANSI_CODE_POINTS } from './winAnsi';
import type { Course, DocType, PageOcr, StudentProfile } from '../../types/models';

// Cover page templates (§4 S4). layoutCover turns a template and its values into positioned items
// in PDF points, top-left origin; pdfService.buildCoverPage draws them with pdf-lib (vector text)
// and academicRasterService.renderCoverPageImage with Skia (the library's display copy). Line
// breaks are decided here, once, with Helvetica's metrics, so both come out the same.

export type CoverTemplateId = 'simple' | 'assignment' | 'lab';

export type CoverFieldKey =
  | 'institution'
  | 'title'
  | 'docLabel'
  | 'courseCode'
  | 'courseName'
  | 'teacher'
  | 'name'
  | 'roll'
  | 'section'
  | 'date'
  | 'experimentNo'
  | 'experimentName';

export type CoverValues = Partial<Record<CoverFieldKey, string>>;

export type CoverTemplate = { id: CoverTemplateId; label: string; fields: readonly CoverFieldKey[] };

export const COVER_TEMPLATES: readonly CoverTemplate[] = [
  { id: 'simple', label: 'Simple', fields: ['title', 'docLabel', 'name', 'roll', 'courseCode', 'courseName', 'date'] },
  {
    id: 'assignment',
    label: 'Assignment',
    fields: ['institution', 'docLabel', 'title', 'courseCode', 'courseName', 'name', 'roll', 'section', 'teacher', 'date'],
  },
  {
    id: 'lab',
    label: 'Lab report',
    fields: ['institution', 'experimentNo', 'experimentName', 'courseCode', 'courseName', 'name', 'roll', 'section', 'teacher', 'date'],
  },
];

export const COVER_FIELD_LABELS: Record<CoverFieldKey, string> = {
  institution: 'Institution',
  title: 'Title',
  docLabel: 'Type and number',
  courseCode: 'Course code',
  courseName: 'Course name',
  teacher: 'Teacher',
  name: 'Name',
  roll: 'Roll / ID',
  section: 'Section',
  date: 'Date',
  experimentNo: 'Experiment no.',
  experimentName: 'Experiment name',
};

export function getCoverTemplate(id: string | undefined): CoverTemplate {
  return COVER_TEMPLATES.find((t) => t.id === id) ?? COVER_TEMPLATES[0];
}

// A cover page: a template with its values, or a photo of a printed cover sheet. In
// deliver.academicConfig a template's `values` are only the student's edits (overrides);
// withCoverDefaults fills in the rest before anything is drawn.
export type CoverPageConfig =
  | { mode: 'template'; templateId: CoverTemplateId; values: CoverValues }
  | { mode: 'imported_image'; importedUri?: string };

// Before S4 a template cover was { mode: 'template', title?, studentName?, courseCode? }, drawn
// as what is now the Simple template. Anything saved in that shape is read as Simple.
export function normalizeCoverConfig(raw: unknown): CoverPageConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const cover = raw as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
  if (cover.mode === 'imported_image') return { mode: 'imported_image', importedUri: str(cover.importedUri) };
  if (cover.mode !== 'template') return undefined;
  if (typeof cover.templateId === 'string') {
    const values = cover.values && typeof cover.values === 'object' ? (cover.values as CoverValues) : {};
    return { mode: 'template', templateId: getCoverTemplate(cover.templateId).id, values };
  }
  const values: CoverValues = {};
  if (str(cover.title)) values.title = str(cover.title);
  if (str(cover.studentName)) values.name = str(cover.studentName);
  if (str(cover.courseCode)) values.courseCode = str(cover.courseCode);
  return { mode: 'template', templateId: 'simple', values };
}

// --- Defaults -------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2 October 2026": spelled out, so no reader mixes up day and month. English, like the rest of
// the cover (Helvetica can't show other scripts yet).
export function formatCoverDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export type CoverContext = {
  profile: StudentProfile;
  course?: Pick<Course, 'name' | 'code' | 'teacher'>;
  docType: DocType;
  // The number this document gets for its course and type (docTypes.nextTypeNumber).
  n: number;
  date: Date;
};

// What a cover shows before the student types anything: profile, course, "Assignment 3", today.
// The title and the experiment fields have no source, so they start empty.
export function coverDefaults(ctx: CoverContext): CoverValues {
  return {
    institution: ctx.profile.institution.trim(),
    name: ctx.profile.name.trim(),
    roll: ctx.profile.roll.trim(),
    section: ctx.profile.section.trim(),
    courseCode: ctx.course?.code?.trim() ?? '',
    courseName: ctx.course?.name.trim() ?? '',
    teacher: ctx.course?.teacher?.trim() ?? '',
    docLabel: `${getDocType(ctx.docType).label} ${ctx.n}`,
    date: formatCoverDate(ctx.date),
    experimentNo: ctx.docType === 'lab' ? String(ctx.n) : '',
  };
}

// The student's edits win; a field they cleared stays empty (and is left out of the cover).
export function resolveCoverValues(defaults: CoverValues, overrides: CoverValues | undefined): CoverValues {
  return { ...defaults, ...overrides };
}

// The cover as it will be drawn: a template's overrides on top of the defaults.
export function withCoverDefaults(cover: CoverPageConfig, defaults: CoverValues): CoverPageConfig {
  return cover.mode === 'template' ? { ...cover, values: resolveCoverValues(defaults, cover.values) } : cover;
}

// --- Layout ---------------------------------------------------------------------------------

export type PageSizePt = { width: number; height: number };

// Coordinates in points from the top-left corner. A text item's `y` is its baseline; `x` is its
// left edge, or its centre when `align` is 'center' (each renderer centres with its own font, so
// the text stays centred even where Skia's system font is a little wider than Helvetica).
export type CoverItem =
  | { kind: 'text'; text: string; x: number; y: number; size: number; bold: boolean; align: 'left' | 'center' }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: 'box'; x: number; y: number; width: number; height: number; borderWidth: number };

export type MeasureText = (text: string, size: number, bold: boolean) => number;

// pdf-lib types StandardFontEmbedder.for with @pdf-lib/standard-fonts' own enum, which has the
// same string values as the StandardFonts it exports.
type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const helvetica = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName);
const helveticaBold = StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as FontName);

export const helveticaWidth: MeasureText = (text, size, bold) => (bold ? helveticaBold : helvetica).widthOfTextAtSize(text, size);

// Characters Helvetica can't draw become '?', as pdfService.toWinAnsiSafe does, and here already
// so the Skia copy shows exactly what the PDF shows.
export function coverSafe(text: string): string {
  let out = '';
  for (const ch of text.replace(/\s+/g, ' ').trim()) out += WIN_ANSI_CODE_POINTS.has(ch.codePointAt(0) ?? 0) ? ch : '?';
  return out;
}

const ELLIPSIS = '…';

// Greedy word wrap into at most `maxLines`; a word wider than the line is broken by characters,
// and text that still doesn't fit ends in an ellipsis on the last line.
export function wrapText(text: string, size: number, bold: boolean, maxWidth: number, maxLines: number, measure: MeasureText): string[] {
  const fits = (s: string) => measure(s, size, bold) <= maxWidth;
  // Words, with any word wider than a line split into line-wide chunks.
  const pieces: string[] = [];
  for (const word of text.split(' ').filter(Boolean)) {
    let chunk = '';
    for (const ch of word) {
      if (chunk && !fits(chunk + ch)) {
        pieces.push(chunk);
        chunk = '';
      }
      chunk += ch;
    }
    if (chunk) pieces.push(chunk);
  }
  const lines: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const candidate = current ? `${current} ${piece}` : piece;
    if (fits(candidate)) {
      current = candidate;
    } else {
      lines.push(current);
      current = piece;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  let last = lines[maxLines - 1];
  while (last && !fits(last + ELLIPSIS)) last = last.slice(0, -1).trimEnd();
  return [...lines.slice(0, maxLines - 1), last + ELLIPSIS];
}

const MARGIN_PT = 56;
const LINE_GAP = 1.3; // line height as a multiple of the font size
const BOX_PADDING_PT = 14;
const RULE_WIDTH_PT = 1;

class Layout {
  readonly items: CoverItem[] = [];
  y: number;
  constructor(
    readonly page: PageSizePt,
    readonly measure: MeasureText,
    startY: number
  ) {
    this.y = startY;
  }
  get contentWidth() {
    return this.page.width - MARGIN_PT * 2;
  }
  // Wrapped, centred lines; moves the cursor below them. Empty text adds nothing.
  centered(raw: string | undefined, size: number, bold: boolean, maxLines = 2, gapAfter = 0) {
    const text = coverSafe(raw ?? '');
    if (!text) return;
    for (const line of wrapText(text, size, bold, this.contentWidth, maxLines, this.measure)) {
      this.y += size;
      this.items.push({ kind: 'text', text: line, x: this.page.width / 2, y: this.y, size, bold, align: 'center' });
      this.y += size * (LINE_GAP - 1);
    }
    this.y += gapAfter;
  }
  rule(gapAfter: number) {
    this.y += 6;
    this.items.push({ kind: 'line', x1: MARGIN_PT, y1: this.y, x2: this.page.width - MARGIN_PT, y2: this.y, width: RULE_WIDTH_PT });
    this.y += gapAfter;
  }
}

type Row = { label: string; value?: string };

// Left-aligned "Label: value" rows under a bold heading, wrapped to `width`; returns the items
// and the height they take. Rows with no value are left out, and so is a column with none.
function column(heading: string, rows: Row[], x: number, top: number, width: number, measure: MeasureText) {
  const items: CoverItem[] = [];
  const filled = rows.map((r) => ({ label: r.label, value: coverSafe(r.value ?? '') })).filter((r) => r.value);
  if (filled.length === 0) return { items, height: 0 };
  const headingSize = 13;
  const size = 12;
  let y = top + headingSize;
  items.push({ kind: 'text', text: heading, x, y, size: headingSize, bold: true, align: 'left' });
  y += headingSize * (LINE_GAP - 1) + 6;
  for (const row of filled) {
    for (const line of wrapText(`${row.label}: ${row.value}`, size, false, width, 2, measure)) {
      y += size;
      items.push({ kind: 'text', text: line, x, y, size, bold: false, align: 'left' });
      y += size * (LINE_GAP - 1);
    }
  }
  return { items, height: y - top };
}

// "Submitted by" (the student) and "Submitted to" (the teacher) side by side in a box.
function submissionBox(layout: Layout, v: CoverValues) {
  const x = MARGIN_PT;
  const width = layout.contentWidth;
  const columnWidth = (width - BOX_PADDING_PT * 3) / 2;
  const top = layout.y + BOX_PADDING_PT;
  const by = column(
    'Submitted by',
    [
      { label: 'Name', value: v.name },
      { label: 'Roll', value: v.roll },
      { label: 'Section', value: v.section },
    ],
    x + BOX_PADDING_PT,
    top,
    columnWidth,
    layout.measure
  );
  const to = column(
    'Submitted to',
    [
      { label: 'Teacher', value: v.teacher },
      { label: 'Course', value: v.courseCode || v.courseName },
    ],
    x + BOX_PADDING_PT * 2 + columnWidth,
    top,
    columnWidth,
    layout.measure
  );
  const inner = Math.max(by.height, to.height);
  if (inner === 0) return;
  const height = inner + BOX_PADDING_PT * 2;
  layout.items.push({ kind: 'box', x, y: layout.y, width, height, borderWidth: RULE_WIDTH_PT }, ...by.items, ...to.items);
  layout.y += height;
}

const courseLine = (v: CoverValues) => [v.courseCode, v.courseName].map((s) => s?.trim()).filter(Boolean).join(' · ');

export function layoutCover(
  templateId: CoverTemplateId,
  values: CoverValues,
  page: PageSizePt,
  measure: MeasureText = helveticaWidth
): CoverItem[] {
  const v = values;
  if (templateId === 'simple') {
    const layout = new Layout(page, measure, page.height * 0.36);
    layout.centered(v.title?.trim() || v.docLabel, 24, true, 3, 10);
    if (v.title?.trim()) layout.centered(v.docLabel, 14, false, 1, 24);
    else layout.y += 14;
    layout.centered(v.name, 14, false, 2, 4);
    layout.centered(v.roll ? `Roll: ${v.roll}` : '', 12, false, 1, 4);
    layout.centered(courseLine(v), 12, false, 2, 4);
    layout.centered(v.date, 12, false, 1);
    return layout.items;
  }

  const layout = new Layout(page, measure, MARGIN_PT + 40);
  if (coverSafe(v.institution ?? '')) {
    layout.centered(v.institution, 18, true, 2);
    layout.rule(0);
  }
  layout.y = Math.max(layout.y, page.height * 0.24);
  if (templateId === 'lab') {
    layout.centered('Lab Report', 28, true, 1, 16);
    layout.centered(courseLine(v), 15, false, 2, 22);
    layout.centered(v.experimentNo ? `Experiment no. ${v.experimentNo}` : '', 14, true, 1, 6);
    layout.centered(v.experimentName, 16, false, 3);
  } else {
    layout.centered(v.docLabel, 28, true, 1, 16);
    layout.centered(courseLine(v), 15, false, 2, 22);
    layout.centered(v.title, 16, false, 3);
  }
  layout.y = Math.max(layout.y + 40, page.height * 0.6);
  submissionBox(layout, v);
  if (coverSafe(v.date ?? '')) {
    layout.y += 28;
    layout.centered(`Date of submission: ${v.date}`, 12, false, 1);
  }
  return layout.items;
}

// --- §5 T6: the exam pack's contents page ----------------------------------------------------

export type ContentsEntry = { document: string; sourcePages: number[]; packPages: [number, number] };

// "p. 2, 4–6, 9": 1-based page numbers with runs collapsed.
export function pageList(pages: readonly number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j;
  }
  return `p. ${runs.join(', ')}`;
}

// The pack's first page: its title, a subtitle (course and date), then where each run of pages
// came from: "Cell biology notes" / "p. 2, 4–6 · pack pages 2–5". Long lists wrap; a pack too
// long for one page is cut with "…" (the pages themselves are all there).
export function layoutContents(title: string, subtitle: string, entries: readonly ContentsEntry[], page: PageSizePt, measure: MeasureText = helveticaWidth): CoverItem[] {
  const layout = new Layout(page, measure, MARGIN_PT + 20);
  layout.centered(title, 22, true, 2, 4);
  layout.centered(subtitle, 12, false, 1, 10);
  layout.rule(18);
  layout.centered('Contents', 14, true, 1, 8);
  const bottom = page.height - MARGIN_PT;
  for (const entry of entries) {
    if (layout.y > bottom - 40) {
      layout.centered('…', 12, false, 1);
      break;
    }
    const [from, to] = entry.packPages;
    layout.centered(entry.document, 12.5, true, 2, 2);
    layout.centered(`${pageList(entry.sourcePages)} · pack ${from === to ? `page ${from}` : `pages ${from}–${to}`}`, 11, false, 2, 10);
  }
  return layout.items;
}

// OCR blocks for a page drawn from items, so a generated page (the contents page) is searchable
// like a scan: each text item becomes a line, in master pixels (`scale` = pixels per point).
export function itemsAsOcr(items: readonly CoverItem[], scale: number, measure: MeasureText = helveticaWidth): PageOcr {
  const blocks = items
    .filter((item): item is Extract<CoverItem, { kind: 'text' }> => item.kind === 'text')
    .map((item) => {
      const width = measure(item.text, item.size, item.bold);
      const left = item.align === 'center' ? item.x - width / 2 : item.x;
      const bounding = { left: left * scale, top: (item.y - item.size * 0.8) * scale, width: width * scale, height: item.size * scale };
      return { text: item.text, bounding, lines: [{ text: item.text, bounding }] };
    });
  return { text: blocks.map((b) => b.text).join('\n'), blocks };
}
