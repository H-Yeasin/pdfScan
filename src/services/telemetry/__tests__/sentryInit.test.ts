import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §16 G1: the Sentry wizard once added an unconditional Sentry.init to App.tsx, with session replay
// and sendDefaultPii, which went around the opt-in in crash.ts and would have sent scanned pages.
// This scans the source (like i18n/__tests__/hardcodedStrings.test.ts) so it can't come back.

const ROOT = join(__dirname, '../../../..');
const CRASH = 'src/services/telemetry/crash.ts';

// Native projects, build output, dependencies, docs and tests (which mock Sentry) aren't app source.
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.expo', '.claude', '.github', '.vscode', 'android', 'ios', 'build', 'dist',
  'docs', 'assets', 'AppIcons', 'patches', '__tests__', 'test',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : sourceFiles(path);
    return /\.(?:tsx?|[cm]?js)$/.test(name) ? [path] : [];
  });
}

const sources = sourceFiles(ROOT).map((path) => ({
  file: relative(ROOT, path).split('\\').join('/'),
  text: readFileSync(path, 'utf8'),
}));

function filesMatching(pattern: RegExp): string[] {
  return sources.filter(({ text }) => pattern.test(text)).map(({ file }) => file);
}

describe('Sentry starts only through the opt-in path (§16 G1)', () => {
  it('scans the app entry and crash.ts', () => {
    const files = sources.map(({ file }) => file);
    expect(files).toEqual(expect.arrayContaining(['App.tsx', 'index.ts', CRASH]));
  });

  it('calls Sentry.init only in crash.ts', () => {
    expect(filesMatching(/\bSentry\.init\(/)).toEqual([CRASH]);
  });

  // The SDK itself (not its /metro or /expo build helpers), so a named `init` import can't slip by.
  it('imports @sentry/react-native only in crash.ts', () => {
    expect(filesMatching(/from\s+['"]@sentry\/react-native['"]|require\(\s*['"]@sentry\/react-native['"]\s*\)/)).toEqual([CRASH]);
  });

  it.each(['mobileReplayIntegration', 'replaysSessionSampleRate', 'replaysOnErrorSampleRate'])('never uses %s', (name) => {
    expect(filesMatching(new RegExp(`\\b${name}\\b`))).toEqual([]);
  });

  it('never turns on sendDefaultPii', () => {
    expect(filesMatching(/\bsendDefaultPii\s*:\s*true\b/)).toEqual([]);
  });

  it('typechecks App.tsx', () => {
    expect(readFileSync(join(ROOT, 'App.tsx'), 'utf8')).not.toMatch(/@ts-nocheck/);
  });
});
