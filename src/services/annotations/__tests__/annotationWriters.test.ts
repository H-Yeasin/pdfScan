import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §18 W17 (A9): `document.pdf` never holds our marks or signatures. The Reader draws them from
// their rows, and they are written into a PDF only as it leaves the app: the export copy
// (exportPdf.annotatedPdfFor) and a submission's own build (submitDocument). This fails when any
// other file calls one of the writers, which is how a rebuild would put them back into the
// document's file (and, in an imported PDF, on screen twice).

const SRC = join(__dirname, '../../..');
const WRITERS = /\b(?:writeMarks|writeAnnotations|writeSignatures)\s*\(/;
const ALLOWED = new Set(['services/annotations/pdfAnnotations.ts', 'services/annotations/exportPdf.ts', 'services/submit/submitDocument.ts']);
// Tests, and the helpers only tests load.
const SKIPPED_DIRS = new Set(['__tests__', 'test']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('annotation writers (§18 W17)', () => {
  it('are called only where a PDF leaves the app', () => {
    const callers = sourceFiles(SRC)
      .filter((path) => WRITERS.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((path) => !ALLOWED.has(path));
    expect(callers).toEqual([]);
  });

  it('still finds the callers it allows', () => {
    for (const path of ALLOWED) expect(WRITERS.test(readFileSync(join(SRC, path), 'utf8'))).toBe(true);
  });
});
