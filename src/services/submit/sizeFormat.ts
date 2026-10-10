import { formatNumber, t } from '../../i18n';

// §16 G3: the size units and their formatting, on their own: preset.summarizePreset needs them,
// and presets load with the store at boot, while sizeTarget brings pdfService (pdf-lib) and Skia.
// sizeTarget re-exports both.

// Upload forms count a megabyte as 1,000,000 bytes, so the limits here do too (unlike
// utils/format.formatBytes, which divides by 1024 for storage sizes).
export const MB = 1_000_000;

// "2 MB", "1.5 MB", "800 KB": a limit or a result, in the units the limit was given in.
// Rounded up, so a file just over a 2 MB limit reads "2.01 MB", never "2 MB".
export function formatLimit(bytes: number): string {
  if (bytes < MB) return t('common.bytes.kb', { size: formatNumber(Math.ceil(bytes / 1000)) });
  return t('common.bytes.mb', { size: formatNumber(Math.ceil((bytes / MB) * 100) / 100) });
}
