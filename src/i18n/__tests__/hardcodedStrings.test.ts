import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §6 L4: UI text comes from the catalog (en.ts), never string literals in components. This scans
// every .tsx under src for JSX text and for string literals in the props and calls that show text,
// and fails on any it finds (L4d). Run with I18N_REPORT=1 to print every hit with its file.

const SRC = join(__dirname, '../..');

// §6 L4d: every file is converted. Only the developer tools in src/dev (the Filter Lab, never
// shipped to students) keep English literals.
const EXEMPT_DIRS = ['dev'];

// Literals that aren't language: the app's name, example values in a fixed format.
const ALLOWED = new Set(['PDF Scan', 'PHY 101', 'PDF', 'JPG', 'A4', 'DOCX', 'XLSX', 'CSV', 'TXT', 'OCR']);

const PATTERNS: RegExp[] = [
  // JSX text: after a tag's closing '>' (never '=>' or a spaced comparison), up to a closing tag.
  /(?<=[\w"'}/])>\s*([A-Za-z][^<>{}=;]*?)\s*<\//g,
  // Props that are shown or read aloud.
  /\b(?:label|title|placeholder|subtitle|trailing|submitLabel|accessibilityLabel|accessibilityHint)=["']([A-Za-z][^"']*)["']/g,
  // Snack messages and Alert buttons/titles.
  /\b(?:msg|text):\s*["'`]([A-Za-z][^"'`]*)["'`]/g,
  /Alert\.alert\(\s*["'`]([A-Za-z][^"'`]*)["'`]/g,
  // JSX text that runs into an expression ("Page 1 shows: {x}") or follows one ("{n} selected").
  /(?<=[\w"'}/])>[ \t]*([A-Za-z][^<>{}=;]*?)\s*\{/g,
  /\}([ \t]*[A-Za-z][^<>{}=;()]*?)\s*<\//g,
  // Object fields that are shown: { label: 'Rename' }, { title: '…' }.
  /\b(?:label|title|hint|subtitle|action|message|placeholder|description|plural|heading):\s*["'`]([A-Za-z][^"'`]*)["'`]/g,
  // Capitalised words picked by a condition: x ? 'Done' : 'Cancel', name ?? 'Untitled'.
  /(?:\?|\?\?|\|\||\s:)\s*["'`]([A-Z][a-z][^"'`]*)["'`]/g,
  // A list of sentences: [ 'Batch OCR and batch export', ... ].
  /^\s*["'`]([A-Z][a-z]+ [^"'`]*)["'`],?\s*$/gm,
  // Progress and error setters: setProgress('Building…'), setError(`Couldn't…`).
  /\bset(?:Progress|Error|Message|Status)\(\s*["'`]([A-Za-z][^"'`]*)["'`]/g,
];

// Catalog keys ('settings.profile.name') are what converted code passes around, not text.
const CATALOG_KEY = /^[a-z]\w*(\.\w+)+$/;

export function hardcodedStrings(source: string): string[] {
  // Comments are prose, not UI.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const found: string[] = [];
  for (const pattern of PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const text = match[1].replace(/\s+/g, ' ').trim();
      if (text && !ALLOWED.has(text) && !CATALOG_KEY.test(text)) found.push(text);
    }
  }
  return found;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'test' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

describe('hard-coded UI strings', () => {
  it('finds JSX text and shown string props, and skips code', () => {
    const source = `
      <Text style={s}>Due soon</Text>
      <Text>
        Each scan gets filed
      </Text>
      <SettingRow title="Class times" subtitle={t('x')} />
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'No folder selected' });
      Alert.alert('Delete?', undefined, [{ text: 'Cancel', style: 'cancel' }]);
      const ok = a > b && c < d; const f = () => <View />;
      <Text>{t('home.title')}</Text>
      <Text>PDF Scan</Text>
      const FEATURES = [
        'Batch OCR and batch export',
      ];
      const key = t('settings.profile.name'); // a comment with Words in it
    `;
    expect(hardcodedStrings(source).sort()).toEqual(
      ['Batch OCR and batch export', 'Cancel', 'Class times', 'Delete?', 'Due soon', 'Each scan gets filed', 'No folder selected'].sort()
    );
  });

  const files = tsxFiles(SRC)
    .map((path) => relative(SRC, path))
    .filter((file) => !EXEMPT_DIRS.includes(file.split('/')[0]));

  it('covers the whole app', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it.each(files)('%s reads all its text from the catalog', (file) => {
    const found = hardcodedStrings(readFileSync(join(SRC, file), 'utf8'));
    if (process.env.I18N_REPORT && found.length) console.info(`${file}: ${found.join(' | ')}`);
    expect(found).toEqual([]);
  });
});
