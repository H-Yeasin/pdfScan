import { getCoverTemplate, type CoverTemplateId } from '../pdf/coverTemplates';
import { defaultPageSize, type PageSizeId } from '../pdf/pageSize';
import type { AcademicConfig, LayoutMode } from '../pdf/pdfService';
import { FOOTER_PRESET_TEXT, footerPresetOf, type FooterPreset } from './footerPresets';
import { formatLimit } from './sizeTarget';

// How a course's work is handed in (§4 S6), remembered on the course after the first submit so
// every later one is Review "Next", "Submit", pick the app.
export type SubmitPreset = {
  sizeLimitBytes: number | null;
  coverTemplateId: CoverTemplateId | null;
  footerPreset: FooterPreset;
  // Only for footerPreset 'custom'.
  footerText?: string;
  border: boolean;
  pageSize: PageSizeId;
  layout: LayoutMode;
  // Overrides settings.nameTemplate for this course. Undefined: the Settings template.
  nameTemplate?: string;
};

// A course without a preset yet: no limit, no cover, page numbers, the region's paper, one page
// per sheet. Unsorted scans (receipts, forms) get the plain one, without page numbers, so a
// quick Save isn't stamped.
export function defaultSubmitPreset(courseId: string | null): SubmitPreset {
  return {
    sizeLimitBytes: null,
    coverTemplateId: null,
    footerPreset: courseId === null ? 'none' : 'pages',
    border: false,
    pageSize: defaultPageSize(),
    layout: 'standard',
  };
}

const FOOTER_PRESETS: readonly FooterPreset[] = ['none', 'pages', 'namePages', 'custom'];
const COVER_IDS: readonly CoverTemplateId[] = ['simple', 'assignment', 'lab'];

// Reads courses.submit_preset. Each field is checked on its own and falls back to the default,
// so a preset written by a later version, or a damaged one, still loads. null/invalid JSON:
// no preset.
export function parseSubmitPreset(json: string | null | undefined): SubmitPreset | undefined {
  if (!json) return undefined;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return undefined;
    raw = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const fallback = defaultSubmitPreset('course');
  const limit = raw.sizeLimitBytes;
  const preset: SubmitPreset = {
    sizeLimitBytes: typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.round(limit) : null,
    coverTemplateId: COVER_IDS.includes(raw.coverTemplateId as CoverTemplateId) ? (raw.coverTemplateId as CoverTemplateId) : null,
    footerPreset: FOOTER_PRESETS.includes(raw.footerPreset as FooterPreset) ? (raw.footerPreset as FooterPreset) : fallback.footerPreset,
    border: raw.border === true,
    pageSize: raw.pageSize === 'Letter' || raw.pageSize === 'A4' ? raw.pageSize : fallback.pageSize,
    layout: raw.layout === '2_in_1' ? '2_in_1' : 'standard',
  };
  if (typeof raw.footerText === 'string' && preset.footerPreset === 'custom') preset.footerText = raw.footerText;
  if (typeof raw.nameTemplate === 'string' && raw.nameTemplate.trim()) preset.nameTemplate = raw.nameTemplate;
  return preset;
}

export function serializeSubmitPreset(preset: SubmitPreset | undefined): string | null {
  return preset ? JSON.stringify(preset) : null;
}

export function presetFooterText(preset: SubmitPreset): string {
  if (preset.footerPreset === 'none') return '';
  if (preset.footerPreset === 'custom') return preset.footerText ?? '';
  return FOOTER_PRESET_TEXT[preset.footerPreset];
}

// The academic options a preset gives (no header: that's per document). The cover starts with no
// edits; its fields come from the profile and course (coverTemplates.coverDefaults).
export function presetAcademicConfig(preset: SubmitPreset): AcademicConfig | null {
  const footerText = presetFooterText(preset) || undefined;
  const coverPage = preset.coverTemplateId ? { mode: 'template' as const, templateId: preset.coverTemplateId, values: {} } : undefined;
  if (!preset.border && !footerText && !coverPage) return null;
  return { enableBorder: preset.border, footerText, coverPage };
}

export type DeliverPresetFields = {
  sizeLimitBytes: number | null;
  academicConfig: AcademicConfig | null;
  pageSize: PageSizeId;
  layoutMode: LayoutMode;
  nameTemplate?: string;
};

// The preset that Deliver's current options amount to. A photo cover isn't remembered (it's this
// document's own sheet): the course keeps the cover template it had (`previous`). Neither are the
// header or the cover's typed values.
export function presetFromDeliver(deliver: DeliverPresetFields, previous?: SubmitPreset): SubmitPreset {
  const academic = deliver.academicConfig;
  const footerText = academic?.footerText?.trim() ?? '';
  const footerPreset = footerPresetOf(footerText);
  const cover = academic?.coverPage;
  const preset: SubmitPreset = {
    sizeLimitBytes: deliver.sizeLimitBytes,
    coverTemplateId: cover?.mode === 'template' ? cover.templateId : cover?.mode === 'imported_image' ? (previous?.coverTemplateId ?? null) : null,
    footerPreset,
    border: academic?.enableBorder ?? false,
    pageSize: deliver.pageSize,
    layout: deliver.layoutMode,
  };
  if (footerPreset === 'custom') preset.footerText = footerText;
  if (deliver.nameTemplate?.trim()) preset.nameTemplate = deliver.nameTemplate;
  return preset;
}

export function presetsEqual(a: SubmitPreset, b: SubmitPreset): boolean {
  return serializeSubmitPreset(normalizeKeys(a)) === serializeSubmitPreset(normalizeKeys(b));
}

// Same key order and no undefined fields, so JSON comparison is fair.
function normalizeKeys(p: SubmitPreset): SubmitPreset {
  const out: SubmitPreset = {
    sizeLimitBytes: p.sizeLimitBytes,
    coverTemplateId: p.coverTemplateId,
    footerPreset: p.footerPreset,
    border: p.border,
    pageSize: p.pageSize,
    layout: p.layout,
  };
  if (p.footerPreset === 'custom' && p.footerText !== undefined) out.footerText = p.footerText;
  if (p.nameTemplate) out.nameTemplate = p.nameTemplate;
  return out;
}

const FOOTER_SUMMARY: Record<FooterPreset, string | null> = {
  none: null,
  pages: 'Page numbers',
  namePages: 'Name + pages',
  custom: 'Custom footer',
};

// "Under 2 MB · Assignment cover · Name + pages · A4": the collapsed options line in Deliver.
export function summarizePreset(preset: SubmitPreset): string {
  const parts = [
    preset.sizeLimitBytes !== null ? `Under ${formatLimit(preset.sizeLimitBytes)}` : 'Original size',
    preset.coverTemplateId ? `${getCoverTemplate(preset.coverTemplateId).label} cover` : null,
    FOOTER_SUMMARY[preset.footerPreset],
    preset.border ? 'Border' : null,
    preset.layout === '2_in_1' ? '2 per sheet' : null,
    preset.pageSize,
  ];
  return parts.filter(Boolean).join(' · ');
}
