// The phone's preferred languages; tests change them with `mockLocales`.
type Locale = { languageTag: string; languageCode: string | null };

let locales: Locale[] = [{ languageTag: 'en-US', languageCode: 'en' }];

export function mockLocales(next: Locale[]) {
  locales = next;
}

export const getLocales = () => locales;
export const useLocales = () => locales;
