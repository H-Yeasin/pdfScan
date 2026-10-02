import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §6 L4: UI text comes from the catalog (en.ts), never string literals in components. This scans
// every .tsx under src for JSX text and for string literals in the props and calls that show text.
// Converted files must have none; the rest are listed (I18N_REPORT=1 npm test -- hardcoded) until
// L4d turns this into a failure for every file.

const SRC = join(__dirname, '../..');

// Converted so far (L4a: Settings, Home; L4b: Capture, Review). L4c-d add theirs; L4d replaces
// this with "every file".
const CONVERTED = [
  'screens/SettingsScreen.tsx',
  'screens/HomeScreen.tsx',
  'components/settings/LanguageRow.tsx',
  'components/settings/NameTemplateSection.tsx',
  'components/settings/ProfileSection.tsx',
  'components/settings/SettingRow.tsx',
  'screens/CaptureScreen.tsx',
  'screens/ReviewScreen.tsx',
  'components/capture/CaptureControls.tsx',
  'components/capture/CaptureModePicker.tsx',
  'components/review/AdjustPanel.tsx',
  'components/review/AdjustSlider.tsx',
  'components/review/ContextBar.tsx',
  'components/review/CropOverlay.tsx',
  'components/review/FilterOptionsPanel.tsx',
  'components/review/FilterStrip.tsx',
  'components/review/FilteredPreview.tsx',
  'components/review/GridPagesModal.tsx',
  'components/review/PagePeekCarousel.tsx',
  'components/review/PreviewControls.tsx',
  'components/review/ProcessingProgress.tsx',
  'components/review/ThumbnailStrip.tsx',
];

// Literals that aren't language: the app's name, example values in a fixed format.
const ALLOWED = new Set(['PDF Scan', 'PHY 101']);

const PATTERNS: RegExp[] = [
  // JSX text: after a tag's closing '>' (never '=>' or a spaced comparison), up to a closing tag.
  /(?<=[\w"'}/])>\s*([A-Za-z][^<>{}=;]*?)\s*<\//g,
  // Props that are shown or read aloud.
  /\b(?:label|title|placeholder|subtitle|trailing|submitLabel|accessibilityLabel|accessibilityHint)=["']([A-Za-z][^"']*)["']/g,
  // Snack messages and Alert buttons/titles.
  /\b(?:msg|text):\s*["'`]([A-Za-z][^"'`]*)["'`]/g,
  /Alert\.alert\(\s*["'`]([A-Za-z][^"'`]*)["'`]/g,
];

export function hardcodedStrings(source: string): string[] {
  const found: string[] = [];
  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const text = match[1].replace(/\s+/g, ' ').trim();
      if (text && !ALLOWED.has(text)) found.push(text);
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
    `;
    expect(hardcodedStrings(source).sort()).toEqual(
      ['Cancel', 'Class times', 'Delete?', 'Due soon', 'Each scan gets filed', 'No folder selected'].sort()
    );
  });

  it.each(CONVERTED)('%s reads all its text from the catalog', (file) => {
    expect(hardcodedStrings(readFileSync(join(SRC, file), 'utf8'))).toEqual([]);
  });

  it('lists what is left to convert', () => {
    const left = tsxFiles(SRC)
      .map((path) => relative(SRC, path))
      .filter((file) => !CONVERTED.includes(file))
      .map((file) => ({ file, strings: hardcodedStrings(readFileSync(join(SRC, file), 'utf8')) }))
      .filter((entry) => entry.strings.length > 0);
    if (process.env.I18N_REPORT) {
      const total = left.reduce((sum, entry) => sum + entry.strings.length, 0);
      console.info(`${total} hard-coded strings in ${left.length} files:\n${left.map((e) => `  ${e.file}: ${e.strings.join(' | ')}`).join('\n')}`);
    }
    // A warning list until L4d: it only has to be readable, not empty.
    expect(Array.isArray(left)).toBe(true);
  });
});
