import { getLocales } from 'expo-localization';
import { en } from './en';
import { pseudoCatalog } from './pseudo';
import type { CatalogShape, DeepKeys, Plural, TParams } from './types';

// The app's small in-house i18n layer (§6 L4): a typed English catalog, t() with `{name}`
// parameters and per-language plurals, and Intl-based date/number formatting in the active
// locale. No library: about 250 strings, and TypeScript checks every catalog has every key.

export type Catalog = typeof en;
export type TKey = DeepKeys<Catalog>;

// Languages with a catalog. Adding Bangla later: `bn.ts` typed `Catalog`, and a line here.
const CATALOGS: { en: Catalog } = { en };
export type CatalogId = keyof typeof CATALOGS;
// The languages Settings offers (taken once, so a test's registerCatalog doesn't add to it).
export const CATALOG_IDS = Object.keys(CATALOGS) as CatalogId[];

// What Settings stores: follow the phone, a catalog, or (developer builds) the pseudo-locale.
export const PSEUDO_LOCALE = 'en-XA';
export type UiLanguage = 'system' | CatalogId | typeof PSEUDO_LOCALE;

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'system' || value === PSEUDO_LOCALE || (typeof value === 'string' && value in CATALOGS);
}

// Test hook: adds (or replaces) a catalog, e.g. an incomplete one to check the English fallback.
// Returns the undo. A real language is a line in CATALOGS.
export function registerCatalog(id: string, catalog: Catalog): () => void {
  const catalogs = CATALOGS as Record<string, Catalog>;
  const previous = catalogs[id];
  catalogs[id] = catalog;
  return () => {
    if (previous) catalogs[id] = previous;
    else delete catalogs[id];
    if (active === catalog) setUiLanguage('system');
  };
}

// A catalog's own language name, for the language picker.
export function catalogNativeName(id: CatalogId): string {
  return CATALOGS[id].meta.nativeName;
}

let pseudo: Catalog | null = null;

// The first of the phone's preferred languages that has a catalog, else English.
export function systemCatalogId(): CatalogId {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (code && code in CATALOGS) return code as CatalogId;
    }
  } catch {
    // No native module (or a broken locale list): English.
  }
  return 'en';
}

function catalogFor(language: UiLanguage): Catalog {
  if (language === PSEUDO_LOCALE) return (pseudo ??= pseudoCatalog(en));
  return CATALOGS[language === 'system' ? systemCatalogId() : language];
}

let language: UiLanguage = 'system';
let active: Catalog | null = null;
const listeners = new Set<() => void>();

function current(): Catalog {
  return (active ??= catalogFor(language));
}

export function getUiLanguage(): UiLanguage {
  return language;
}

// The active catalog's BCP 47 tag ('en', 'en-XA', ...), for Intl.
export function getLocale(): string {
  return current().meta.locale;
}

export function setUiLanguage(next: UiLanguage): void {
  const catalog = catalogFor(next);
  if (next === language && catalog === active) return;
  language = next;
  active = catalog;
  for (const listener of listeners) listener();
}

// For useT: called after every language change.
export function subscribeUiLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(catalog: CatalogShape, key: string): string | Plural | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && 'one' in node && 'other' in node) return node as Plural;
  return undefined;
}

function interpolate(text: string, params: TParams | undefined, locale: string): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value, undefined, locale) : value;
  });
}

function translate(catalog: Catalog, key: TKey, params: TParams | undefined): string {
  let value = lookup(catalog, key);
  if (value === undefined && catalog !== en) {
    if (__DEV__) console.warn(`i18n: '${key}' is missing from '${catalog.meta.locale}', using English`);
    value = lookup(en, key);
  }
  if (value === undefined) return key;
  const locale = intlTag(catalog.meta.locale);
  if (typeof value === 'string') return interpolate(value, params, locale);
  const count = typeof params?.count === 'number' ? params.count : 0;
  return interpolate(value[catalog.meta.plural(count)], params, locale);
}

// The string for `key` in the active language, with `{name}` parameters filled in; a plural picks
// its form from `params.count` by the language's rule. A key missing from a translation falls back
// to English (TypeScript makes that rare: only a catalog loaded at runtime could miss one); in
// development it also warns, so it gets noticed.
export function t(key: TKey, params?: TParams): string {
  return translate(current(), key, params);
}

// --- Document language ---------------------------------------------------------------------------
//
// Text that goes INTO documents (cover labels, footers, the `{type}` file name token, the exam
// pack's contents page) has its own language, so a Bangla UI can still make the English cover a
// teacher expects. 'ui' (the default) follows the UI language, pseudo-locale included.

export type DocumentLanguage = 'ui' | CatalogId;
let documentLanguage: DocumentLanguage = 'ui';

export function isDocumentLanguage(value: unknown): value is DocumentLanguage {
  return value === 'ui' || (typeof value === 'string' && value in CATALOGS);
}

export function setDocumentLanguage(next: DocumentLanguage): void {
  documentLanguage = next;
}

function documentCatalog(): Catalog {
  return documentLanguage === 'ui' ? current() : (CATALOGS[documentLanguage] ?? en);
}

// t() for document text: keys under `document.*`, in the document language.
export function tDoc(key: TKey & `document.${string}`, params?: TParams): string {
  return translate(documentCatalog(), key, params);
}

export function getDocumentLocale(): string {
  return intlTag(documentCatalog().meta.locale);
}

// --- Formatting in the active locale ------------------------------------------------------------

// The pseudo-locale formats like English; Intl doesn't know 'en-XA' everywhere.
function intlTag(locale: string): string {
  return locale === PSEUDO_LOCALE ? 'en' : locale;
}

function intlLocale(): string {
  return intlTag(getLocale());
}

// §16 G6: one Intl formatter per locale + options, kept. Building one is slow in Hermes, and a
// library row needs three (its page count, its size, its date) on every render. The options are
// a handful of literals, so the caches stay small. Exported for the tests.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function formatKey(locale: string, options: object | undefined): string {
  return options ? `${locale}|${JSON.stringify(options)}` : locale;
}

export function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = formatKey(locale, options);
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

export function dateFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = formatKey(locale, options);
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

// `locale`: the UI's by default; document text passes getDocumentLocale().
export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale: string = intlLocale()): string {
  try {
    return numberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions, locale: string = intlLocale()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  try {
    return dateFormat(locale, options).format(d);
  } catch {
    return d.toDateString();
  }
}

// "340 KB", "1.4 MB": the same steps as utils/format.formatBytes, in the active locale.
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return t('common.bytes.kb', { size: formatNumber(0) });
  if (bytes < 1024 * 1024) return t('common.bytes.kb', { size: formatNumber(Math.max(1, Math.round(bytes / 1024))) });
  if (bytes < 1024 * 1024 * 1024) {
    return t('common.bytes.mb', { size: formatNumber(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  }
  // §8 B1: free space on the phone and big libraries.
  return t('common.bytes.gb', { size: formatNumber(bytes / (1024 * 1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
}
