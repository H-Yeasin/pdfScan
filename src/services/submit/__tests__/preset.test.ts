import {
  defaultSubmitPreset,
  parseSubmitPreset,
  presetAcademicConfig,
  presetFromDeliver,
  presetsEqual,
  serializeSubmitPreset,
  summarizePreset,
  type SubmitPreset,
} from '../preset';
import { MB } from '../sizeTarget';

const FULL: SubmitPreset = {
  sizeLimitBytes: 2 * MB,
  coverTemplateId: 'assignment',
  footerPreset: 'custom',
  footerText: '{name} p. {X}',
  border: true,
  pageSize: 'Letter',
  layout: '2_in_1',
  nameTemplate: '{course}_{type}{n}',
};

describe('preset JSON', () => {
  it('round-trips', () => {
    expect(parseSubmitPreset(serializeSubmitPreset(FULL))).toEqual(FULL);
  });

  it('reads a missing or broken preset as none', () => {
    expect(parseSubmitPreset(null)).toBeUndefined();
    expect(parseSubmitPreset('')).toBeUndefined();
    expect(parseSubmitPreset('{nope')).toBeUndefined();
    expect(parseSubmitPreset('3')).toBeUndefined();
    expect(serializeSubmitPreset(undefined)).toBeNull();
  });

  it('falls back field by field', () => {
    const parsed = parseSubmitPreset(JSON.stringify({ sizeLimitBytes: -1, coverTemplateId: 'fancy', footerPreset: 'x', pageSize: 'A5', layout: '?', footerText: 'kept?' }));
    expect(parsed).toMatchObject({ sizeLimitBytes: null, coverTemplateId: null, footerPreset: 'pages', border: false, layout: 'standard' });
    expect(parsed?.footerText).toBeUndefined();
    expect(['A4', 'Letter']).toContain(parsed?.pageSize);
  });
});

describe('defaults', () => {
  it('numbers the pages of course work but not of unsorted scans', () => {
    expect(defaultSubmitPreset('course_1')).toMatchObject({ sizeLimitBytes: null, coverTemplateId: null, footerPreset: 'pages', border: false });
    expect(defaultSubmitPreset(null).footerPreset).toBe('none');
    expect(presetAcademicConfig(defaultSubmitPreset(null))).toBeNull();
  });
});

describe('Deliver options <-> preset', () => {
  it('a preset applied to Deliver reads back as the same preset', () => {
    for (const preset of [FULL, defaultSubmitPreset('c'), { ...FULL, footerPreset: 'namePages' as const, footerText: undefined, nameTemplate: undefined }]) {
      const back = presetFromDeliver({
        sizeLimitBytes: preset.sizeLimitBytes,
        academicConfig: presetAcademicConfig(preset),
        pageSize: preset.pageSize,
        layoutMode: preset.layout,
        nameTemplate: preset.nameTemplate,
      });
      expect(presetsEqual(back, preset)).toBe(true);
    }
  });

  it("does not remember a photo cover or a header: the course keeps its cover template", () => {
    const fields = {
      sizeLimitBytes: null,
      academicConfig: { enableBorder: false, headerText: 'Mine', coverPage: { mode: 'imported_image' as const, importedUri: 'file:///c.jpg' } },
      pageSize: 'A4' as const,
      layoutMode: 'standard' as const,
    };
    expect(presetFromDeliver(fields)).toMatchObject({ coverTemplateId: null, footerPreset: 'none' });
    expect(presetFromDeliver(fields, FULL).coverTemplateId).toBe('assignment');
  });

  it('summarizes for the collapsed options line', () => {
    expect(summarizePreset({ ...FULL, footerPreset: 'namePages', border: false, layout: 'standard', pageSize: 'A4' })).toBe(
      'Under 2 MB · Assignment cover · Name + pages · A4'
    );
    expect(summarizePreset(defaultSubmitPreset(null))).toMatch(/^Original size · (A4|Letter)$/);
  });
});
