export type PageSizeId = 'A4' | 'Letter';

// Paper in the US and Canada is Letter; everywhere else A4 is the norm.
const LETTER_REGIONS = new Set(['US', 'CA']);

// The paper size a new export starts with, from the phone's locale region (e.g. "en-US" → Letter).
// Read through Intl, which Hermes has, rather than expo-localization, so it needs no native
// module; a locale without a region, or no Intl at all, gives A4.
export function defaultPageSize(locale: string | undefined = currentLocale()): PageSizeId {
  const region = locale
    ?.split(/[-_]/)
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part))
    ?.toUpperCase();
  return region && LETTER_REGIONS.has(region) ? 'Letter' : 'A4';
}

function currentLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}
