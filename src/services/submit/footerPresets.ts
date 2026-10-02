import { en } from '../../i18n/en';
import { tDoc } from '../../i18n';

// Footer presets in Academic options (§4 S5). The text goes through naming.renderText (`{name}`,
// `{roll}`, ...) before the build and pdfService.fillPageNumbers (`{X}`, `{Y}`) per page.
export type FooterPreset = 'none' | 'pages' | 'namePages' | 'custom';

// A preset's text in the document language (§6 L4): it is printed on every page.
export function footerPresetText(preset: 'pages' | 'namePages'): string {
  return tDoc(`document.footer.${preset}`);
}

// Which preset a stored footer text is: '' is none, a preset's exact text is that preset,
// anything else was typed (custom). The English text counts too, so a footer chosen before the
// document language changed still reads as its preset.
export function footerPresetOf(text: string | undefined): FooterPreset {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return 'none';
  for (const preset of ['pages', 'namePages'] as const) {
    if (trimmed === footerPresetText(preset) || trimmed === en.document.footer[preset]) return preset;
  }
  return 'custom';
}
