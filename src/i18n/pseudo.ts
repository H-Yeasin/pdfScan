import type { CatalogShape } from './types';

// The developer pseudo-locale 'en-XA' (§6 L4): every English string with its letters accented and
// padded to about 140% of its length, in brackets. Text that shows up plain is hard-coded (not
// from the catalog), and text that gets cut off or overlaps won't survive a longer language.
// `{param}` placeholders are kept as they are, so t() still fills them in.

const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const EXPANSION = 0.4;

export function pseudoString(text: string): string {
  // Split out {param} placeholders so only the words around them change.
  const parts = text.split(/(\{[^}]+\})/);
  const out = parts
    .map((part) => {
      if (/^\{[^}]+\}$/.test(part)) return part;
      return [...part].map((ch) => ACCENTS[ch] ?? ch).join('');
    })
    .join('');
  const padding = '·'.repeat(Math.max(1, Math.ceil(text.length * EXPANSION)));
  return `[${out} ${padding}]`;
}

function pseudoValue(value: unknown): unknown {
  if (typeof value === 'string') return pseudoString(value);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, pseudoValue(inner)]));
  }
  return value;
}

// The whole catalog, pseudo-translated; meta is kept apart (its plural rule is a function).
export function pseudoCatalog<C extends CatalogShape>(catalog: C): C {
  const { meta, ...areas } = catalog;
  return { ...(pseudoValue(areas) as object), meta: { ...meta, locale: 'en-XA', nativeName: pseudoString(meta.nativeName) } } as C;
}
