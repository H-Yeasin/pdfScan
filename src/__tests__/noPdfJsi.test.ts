import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §18 W18: react-native-pdf-jsi is gone. PDFs and scans are read on the page surface
// (components/reader/surface), which draws through modules/pdf-native. This fails if the package
// comes back: as an import anywhere in the app, as a dependency, or as a config plugin.

const ROOT = join(__dirname, '../..');
const PACKAGE = 'react-native-pdf-jsi';
// `from '…'`, `require('…')` and `import('…')` of the package or a path inside it.
const LOADS = new RegExp(`(?:from\\s*|require\\(\\s*|import\\(\\s*)['"]${PACKAGE}(?:/[^'"]*)?['"]`);
const SOURCE_ROOTS = ['App.tsx', 'index.ts', 'src', 'modules', 'plugins'];
const SKIPPED_DIRS = new Set(['node_modules', 'build', 'android', 'ios']);

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return /\.(?:[jt]sx?|mjs)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => (SKIPPED_DIRS.has(name) ? [] : sourceFiles(join(path, name))));
}

describe('react-native-pdf-jsi is removed (§18 W18)', () => {
  it('is imported nowhere', () => {
    const importers = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(ROOT, root)))
      .filter((path) => LOADS.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path).split('\\').join('/'));
    expect(importers).toEqual([]);
  });

  it('is not a dependency or a config plugin', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      expect(Object.keys(pkg[group] ?? {})).not.toContain(PACKAGE);
    }
    const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as { expo: { plugins?: (string | [string, unknown])[] } };
    const plugins = (app.expo.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
    expect(plugins).not.toContain(PACKAGE);
  });
});
