// Shapes for the translation catalogs (§6 L4). `en.ts` is the source of truth: every other
// catalog is typed `Catalog`, so one missing a key (or with a plural where English has a plain
// string) fails `tsc`.

// A string that changes with a count: `{ one: '{count} doc', other: '{count} docs' }`. Which form
// a count takes is the language's own rule (CatalogMeta.plural). Languages that need more forms
// (CLDR few/many) add them here when one is added.
export type Plural = { one: string; other: string };
export type PluralForm = keyof Plural;

export type CatalogMeta = {
  // BCP 47 tag for Intl (dates, numbers): 'en', 'bn', and 'en-XA' for the pseudo-locale.
  locale: string;
  // The language's own name, as the language picker shows it.
  nativeName: string;
  plural: (count: number) => PluralForm;
};

type Leaf = string | Plural;
type Section = { [key: string]: Leaf | Section };

export type CatalogShape = { meta: CatalogMeta } & { [area: string]: Section | CatalogMeta };

// 'home.title', 'settings.theme.dark', ...: every leaf's dotted path, `meta` left out.
type KeysOf<T, Prefix extends string> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${Prefix}${K}` : KeysOf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
export type DeepKeys<T> = KeysOf<Omit<T, 'meta'>, ''>;

// `{name}`-style values; `count` also picks the plural form.
export type TParams = Record<string, string | number>;
