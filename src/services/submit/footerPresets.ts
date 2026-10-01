// Footer presets in Academic options (§4 S5). The text goes through naming.renderText (`{name}`,
// `{roll}`, ...) before the build and pdfService.fillPageNumbers (`{X}`, `{Y}`) per page.
export type FooterPreset = 'none' | 'pages' | 'namePages' | 'custom';

export const FOOTER_PRESET_TEXT: Record<'pages' | 'namePages', string> = {
  pages: 'Page {X} of {Y}',
  namePages: '{name} · {roll} · {X}/{Y}',
};

// Which preset a stored footer text is: '' is none, a preset's exact text is that preset,
// anything else was typed (custom).
export function footerPresetOf(text: string | undefined): FooterPreset {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return 'none';
  if (trimmed === FOOTER_PRESET_TEXT.pages) return 'pages';
  if (trimmed === FOOTER_PRESET_TEXT.namePages) return 'namePages';
  return 'custom';
}
