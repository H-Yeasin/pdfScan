import { File, Paths } from 'expo-file-system';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { installFakeShaper } from '../../../test/fakeShaper';
import { makePng } from '../../../test/png';
import { FAKE_SCRIPT_ID, FAKE_TEXT, installFakeScript } from '../../../test/fakeScript';
import { buildPdfFromPages } from '../../pdf/pdfService';
import { READY_SCRIPTS, resolveOcrScript } from '../../scripts/registry';
import { runOcr } from '../ocrService';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// §6 "done when": a script added only as a registry entry plus its engine works everywhere with no
// other code change: Settings, OCR, the PDF text layer and (L3) visible cover/footer text.
describe('a new script needs only the registry and its engine', () => {
  let uninstall: () => void;
  let uninstallShaper: () => void;
  beforeEach(() => {
    ({ uninstall } = installFakeScript());
    // Skia stand-in: visible text in an unknown script goes through the same shaping as any other.
    ({ uninstall: uninstallShaper } = installFakeShaper());
  });
  afterEach(() => {
    uninstall();
    uninstallShaper();
  });

  it('is offered in Settings and can be chosen for a course', () => {
    expect(READY_SCRIPTS.map((s) => s.id)).toContain(FAKE_SCRIPT_ID);
    expect(resolveOcrScript({ course: { ocrScript: FAKE_SCRIPT_ID }, settings: { ocrScript: 'latin' } })).toBe(FAKE_SCRIPT_ID);
  });

  it('is recognised by its engine and searchable in the built PDF', async () => {
    const image = new File(Paths.cache, `page_${Math.random()}.png`);
    image.write(makePng(20, 28));
    const ocr = await runOcr(image.uri, FAKE_SCRIPT_ID);
    expect(ocr?.text).toBe(FAKE_TEXT.join('\n'));

    const { uri } = await buildPdfFromPages(
      `doc_${Math.random().toString(36).slice(2)}`,
      [{ uri: image.uri, width: 1000, height: 1400, ocr }],
      'as-is'
    );
    const doc = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
    const content = await (await doc.getPage(1)).getTextContent();
    const text = (content.items as { str: string }[]).map((item) => item.str).join(' ');
    for (const line of FAKE_TEXT) {
      for (const word of line.split(' ')) expect(text).toContain(word);
    }
  });

  it('prints on a cover and a footer, searchable', async () => {
    const image = new File(Paths.cache, `page_${Math.random()}.png`);
    image.write(makePng(20, 28));
    const [name, footer] = FAKE_TEXT;
    const { uri } = await buildPdfFromPages(
      `doc_${Math.random().toString(36).slice(2)}`,
      [{ uri: image.uri, width: 1000, height: 1400 }],
      'as-is',
      { enableBorder: false, footerText: footer, coverPage: { mode: 'template', templateId: 'simple', values: { name } } }
    );
    const doc = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
    const textOf = async (n: number) =>
      ((await (await doc.getPage(n)).getTextContent()).items as { str: string }[]).map((item) => item.str).join(' ').replace(/\s+/g, ' ');
    expect(await textOf(1)).toContain(name);
    expect(await textOf(2)).toContain(footer);
  });
});

// The other half of L2's "done when": ML Kit is reached only through its engine.
it('imports rn-mlkit-ocr only from services/ocr/engines/', () => {
  const src = join(__dirname, '../../..');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== '__tests__' && name !== 'test') walk(path);
      } else if (/\.tsx?$/.test(name) && /from 'rn-mlkit-ocr'/.test(readFileSync(path, 'utf8'))) {
        offenders.push(relative(src, path));
      }
    }
  };
  walk(src);
  expect(offenders).toEqual(['services/ocr/engines/mlkit.ts']);
});
