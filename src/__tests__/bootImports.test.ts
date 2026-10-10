import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import ts from 'typescript';
import { chooseStartScreen } from '../bootstrap/startScreen';

// §16 G3: what runs before the first usable screen. Walks the static import graph from the app's
// entry, and from each screen the app can start on (AppNavigator loads screens lazily, but the
// start screen is required during boot), and fails if anything on it imports a heavy library
// that only later screens need. A `require` inside a function is lazy (that's how those
// libraries are loaded on first use) and isn't followed; neither are type-only imports, which
// are erased. Skia is allowed: the splash intro (§15 V5) draws with it.
//
// The parser is TypeScript's, so an import inside a comment or a string can't count. It's a
// little stricter than Babel: an `import { X }` used only as a type is elided at build time but
// counted here. Write `import type` for those.

const ROOT = join(__dirname, '../..');
const ENTRY = 'index.ts';
const NAVIGATOR = 'src/bootstrap/AppNavigator.tsx';

const HEAVY_PACKAGES = ['pdf-lib', 'xlsx', 'mammoth', 'react-native-webview', 'react-native-pdf-jsi'];
const HEAVY_FILES = ['src/services/enhance/filters/registry.ts'];

// `file -> import` pairs that may stay. Empty on purpose: a new static import of a heavy library
// on the boot path has to become a lazy require, not an entry here.
const ALLOWED = new Set<string>([]);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const rel = (path: string) => relative(ROOT, path).split('\\').join('/');
const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

// The module specifiers a file loads as soon as it is evaluated.
function staticImports(text: string, fileName = 'file.tsx'): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (!clause.name &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      const typeOnly =
        node.isTypeOnly ||
        (node.exportClause !== undefined &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((element) => element.isTypeOnly));
      if (!typeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
      return;
    }
    // A function's body runs when it's called, not when the file loads.
    if (ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const loads = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
      const [specifier] = node.arguments;
      if (loads && specifier && ts.isStringLiteralLike(specifier)) found.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// A relative import's file (under the repo: src/, modules/, App.tsx), or null for an asset. A
// package import is returned as written.
function resolveImport(fromFile: string, specifier: string): { file: string } | { pkg: string } | null {
  if (!specifier.startsWith('.')) return { pkg: specifier };
  const base = resolve(dirname(fromFile), specifier);
  if (isFile(base)) return SOURCE_EXTENSIONS.some((ext) => base.endsWith(ext)) ? { file: base } : null;
  for (const ext of SOURCE_EXTENSIONS) if (isFile(base + ext)) return { file: base + ext };
  for (const ext of SOURCE_EXTENSIONS) if (isFile(join(base, `index${ext}`))) return { file: join(base, `index${ext}`) };
  throw new Error(`bootImports: can't resolve '${specifier}' from ${rel(fromFile)}`);
}

type Graph = {
  // Each reached file with the file that first imported it (null for a root).
  parents: Map<string, string | null>;
  // "root -> ... -> file -> heavy import" for every heavy import found.
  heavy: string[];
};

function walk(roots: readonly string[]): Graph {
  const parents = new Map<string, string | null>(roots.map((root) => [join(ROOT, root), null]));
  const queue = [...parents.keys()];
  const heavy: string[] = [];
  const chain = (file: string): string => {
    const steps: string[] = [];
    for (let at: string | null | undefined = file; at; at = parents.get(at)) steps.unshift(rel(at));
    return steps.join(' -> ');
  };
  for (let file = queue.shift(); file; file = queue.shift()) {
    for (const specifier of staticImports(readFileSync(file, 'utf8'), file)) {
      const target = resolveImport(file, specifier);
      if (!target) continue;
      const name = 'pkg' in target ? target.pkg : rel(target.file);
      const isHeavy = 'pkg' in target ? HEAVY_PACKAGES.some((pkg) => name === pkg || name.startsWith(`${pkg}/`)) : HEAVY_FILES.includes(name);
      if (isHeavy) {
        if (!ALLOWED.has(`${rel(file)} -> ${name}`)) heavy.push(`${chain(file)} -> ${name}`);
      } else if ('file' in target && !parents.has(target.file)) {
        parents.set(target.file, file);
        queue.push(target.file);
      }
    }
  }
  return { parents, heavy };
}

// AppNavigator's `lazyScreens({ home: () => require('../screens/HomeScreen')..., ... })`: each
// screen's name and the file its loader requires.
function lazyScreenFiles(): Map<string, string> {
  const navigator = join(ROOT, NAVIGATOR);
  const source = ts.createSourceFile(navigator, readFileSync(navigator, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const files = new Map<string, string>();
  const requiredIn = (node: ts.Node): string | undefined => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteralLike(specifier)) return specifier.text;
    }
    return ts.forEachChild(node, requiredIn);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'lazyScreens') {
      const [loaders] = node.arguments;
      if (loaders && ts.isObjectLiteralExpression(loaders)) {
        for (const property of loaders.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
          const specifier = requiredIn(property.initializer);
          const target = specifier ? resolveImport(navigator, specifier) : null;
          if (target && 'file' in target) files.set(property.name.text, rel(target.file));
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return files;
}

const screenFiles = lazyScreenFiles();
// Every screen chooseStartScreen can pick: Home, Capture (no course yet), Onboarding (new user).
const startScreens = [
  ...new Set([
    chooseStartScreen({ hasActiveCourse: true }),
    chooseStartScreen({ hasActiveCourse: false }),
    chooseStartScreen({ hasActiveCourse: false, showOnboarding: true }),
  ]),
];

describe('staticImports', () => {
  it('counts what loads with the file', () => {
    const text = `
      import a from 'pkg-default';
      import { b } from './named';
      import * as c from './namespace';
      import './side-effect';
      export { d } from './re-export';
      export * from './re-export-all';
      const e = require('./top-level-require');
    `;
    expect(staticImports(text)).toEqual(['pkg-default', './named', './namespace', './side-effect', './re-export', './re-export-all', './top-level-require']);
  });

  it('leaves out lazy requires and erased type imports', () => {
    const text = `
      import type { A } from './type-import';
      import { type B, type C } from './inline-type-import';
      export type { D } from './type-re-export';
      type E = typeof import('./type-query');
      // import f from './in-a-comment';
      const text = "require('./in-a-string')";
      function lazy() { return require('./lazy-require') as typeof import('./lazy-require'); }
      const arrow = () => require('./lazy-arrow');
      const later = async () => (await import('./lazy-dynamic')).default;
      class G { load() { return require('./lazy-method'); } }
    `;
    expect(staticImports(text)).toEqual([]);
  });

  it('counts a mixed import: one value binding is enough to load the module', () => {
    expect(staticImports(`import { type A, b } from './mixed';`)).toEqual(['./mixed']);
  });
});

describe('boot imports (§16 G3)', () => {
  it('loads every screen through a lazy require', () => {
    // 16 screens today; a screen imported at the top of AppNavigator would be missing here and
    // would put its imports on the boot path below.
    expect(screenFiles.size).toBeGreaterThanOrEqual(16);
    const direct = staticImports(readFileSync(join(ROOT, NAVIGATOR), 'utf8'), NAVIGATOR).filter((specifier) => /\/(screens|dev)\//.test(specifier));
    expect(direct).toEqual([]);
  });

  it('knows the file of every start screen', () => {
    expect([...startScreens].sort()).toEqual(['capture', 'home', 'onboarding']);
    for (const screen of startScreens) expect(screenFiles.get(screen)).toMatch(/^src\/screens\/\w+Screen\.tsx$/);
  });

  it('walks the real boot path', () => {
    const { parents } = walk([ENTRY]);
    const reached = [...parents.keys()].map(rel);
    expect(reached).toEqual(
      expect.arrayContaining(['App.tsx', NAVIGATOR, 'src/bootstrap/AppProviders.tsx', 'src/store/appReducer.ts', 'src/navigation/ScreenStack.tsx', 'src/components/brand/SplashIntro.tsx'])
    );
    // The screens aren't on it.
    expect(reached.filter((file) => file.startsWith('src/screens/'))).toEqual([]);
  });

  it('loads no heavy library before the first screen', () => {
    expect(walk([ENTRY]).heavy).toEqual([]);
  });

  it.each(startScreens)('loads no heavy library with the %s start screen', (screen) => {
    expect(walk([screenFiles.get(screen)!]).heavy).toEqual([]);
  });
});
