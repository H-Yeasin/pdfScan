import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §16 G6: no list falls back from a library page's thumbnail to its 2400 px master. A component
// shows `PageThumb` / `useThumb` (components/shared/PageThumb.tsx), which shows the placeholder
// and has the missing thumbnail made. This fails on `thumbUri ?? …fileUri` (and `||`) in any
// component or screen. A session page's `thumbUri ?? uri` (Capture, Review) is fine: its
// thumbnail exists from ingest on, and the page is on screen at full size anyway.

const SRC = join(__dirname, '..');
const FALLBACK = /thumbUri\s*(\?\?|\|\|)\s*[\w.[\]?]*\bfileUri\b/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'dev' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

describe('thumbnails in lists', () => {
  it('never fall back to the master image', () => {
    const hits: string[] = [];
    for (const file of tsxFiles(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FALLBACK.test(line)) hits.push(`${relative(SRC, file)}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('knows the fallback when it sees one', () => {
    expect(FALLBACK.test('<Image source={{ uri: page.thumbUri ?? page.fileUri }} />')).toBe(true);
    expect(FALLBACK.test('const uri = cover.thumbUri || cover.fileUri;')).toBe(true);
    expect(FALLBACK.test('doc.pages[0].thumbUri ?? doc.pages[0].fileUri')).toBe(true);
    expect(FALLBACK.test('uri={page.thumbUri ?? page.uri}')).toBe(false);
  });
});
