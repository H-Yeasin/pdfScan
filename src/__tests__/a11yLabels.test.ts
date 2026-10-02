import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §9 O4a: every button has a name a screen reader can say. Scans each .tsx under src for
// `<Pressable` / `<TouchableOpacity` elements and fails on any that has neither an
// `accessibilityLabel` nor a `<Text>` inside it (TalkBack reads a button's text as its name), or
// that has no `accessibilityRole` (without one TalkBack doesn't say "button"). Elements that only
// swallow taps (a sheet's body inside its backdrop) are `accessible={false}`. Run with
// A11Y_REPORT=1 to print every hit.

const SRC = join(__dirname, '..');
const EXEMPT_DIRS = ['dev'];

// `file:line` of buttons that are deliberately unnamed. Keep this short, with a reason each.
const ALLOWED = new Set<string>([]);

const BUTTON = /<(Pressable|TouchableOpacity)\b/g;

// The index just past the opening tag's '>' (and whether it self-closes), skipping braces and
// strings so `onPress={() => a > b}` doesn't end the tag early.
function openingTagEnd(source: string, from: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { end: i + 1, selfClosing: source[i - 1] === '/' };
  }
  return { end: source.length, selfClosing: true };
}

// The element's children with nested buttons cut out: a nested button's text names it, not us.
function ownBody(source: string, start: number, tag: string): string {
  const open = new RegExp(`<${tag}\\b`, 'g');
  const close = `</${tag}>`;
  let depth = 1;
  let i = start;
  let body = '';
  let nestedFrom = -1;
  while (i < source.length) {
    open.lastIndex = i;
    const nextOpen = open.exec(source);
    const nextClose = source.indexOf(close, i);
    if (nextClose === -1) break;
    if (nextOpen && nextOpen.index < nextClose) {
      const { end, selfClosing } = openingTagEnd(source, nextOpen.index + 1);
      if (depth === 1) body += source.slice(i, nextOpen.index);
      if (!selfClosing) {
        if (depth === 1) nestedFrom = nextOpen.index;
        depth++;
      }
      i = end;
    } else {
      depth--;
      if (depth === 0) {
        body += source.slice(i, nextClose);
        break;
      }
      if (depth === 1 && nestedFrom >= 0) nestedFrom = -1;
      i = nextClose + close.length;
    }
  }
  return body;
}

export function unnamedButtons(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(BUTTON)) {
    const tag = match[1];
    const { end, selfClosing } = openingTagEnd(source, match.index! + 1);
    const opening = source.slice(match.index!, end);
    // Hidden from screen readers on purpose (decorative, or a duplicate of a named control).
    if (/\baccessible=\{false\}/.test(opening) || /importantForAccessibility="no/.test(opening)) continue;
    const named = /\baccessibilityLabel\b/.test(opening) || (!selfClosing && /<Text\b/.test(ownBody(source, end, tag)));
    const hasRole = /\baccessibilityRole\b/.test(opening);
    if (named && hasRole) continue;
    lines.push(source.slice(0, match.index).split('\n').length);
  }
  return lines;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'test' || EXEMPT_DIRS.includes(name) ? [] : tsxFiles(path);
    }
    return name.endsWith('.tsx') ? [path] : [];
  });
}

describe('button names and roles', () => {
  it('finds icon-only buttons and accepts labelled or texted ones', () => {
    const source = `
      <Pressable accessibilityRole="button" onPress={() => a > b && go()}>
        <Ionicons name="close" />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={go} accessibilityLabel={t('common.close')}>
        <Ionicons name="close" />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={go}>
        <Text>{t('common.edit')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={go}>
        <View><Pressable accessibilityRole="button" onPress={x}><Text>Inner</Text></Pressable></View>
      </Pressable>
      <Pressable accessibilityRole="button" style={s} onPress={go} />
      <Pressable accessible={false} onPress={go} />
      <Pressable onPress={go}>
        <Text>{t('common.edit')}</Text>
      </Pressable>
    `;
    expect(unnamedButtons(source)).toEqual([2, 11, 14, 16]);
  });

  it('every button in the app has a name and a role', () => {
    const hits = tsxFiles(SRC).flatMap((file) =>
      unnamedButtons(readFileSync(file, 'utf8'))
        .map((line) => `${relative(SRC, file)}:${line}`)
        .filter((where) => !ALLOWED.has(where))
    );
    if (process.env.A11Y_REPORT) console.log(hits.join('\n'));
    expect(hits).toEqual([]);
  });
});
