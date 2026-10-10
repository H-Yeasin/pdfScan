import { File, Paths } from 'expo-file-system';
import { readTextPrefix, readTextWithEncodingFallback, TXT_MAX_BYTES, utf8Boundary } from '../txtService';

function write(name: string, bytes: Uint8Array | string): string {
  const file = new File(Paths.cache, 'txt', name);
  file.write(bytes);
  return file.uri;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('utf8Boundary (§18 W4)', () => {
  it('cuts at the cap when no character is split', () => {
    expect(utf8Boundary(utf8('abcdef'), 4)).toBe(4);
    expect(utf8Boundary(utf8('abc'), 10)).toBe(3);
  });

  it('steps back to the start of a split character (2, 3 and 4 bytes)', () => {
    // 'é' is 2 bytes, 'ক' 3, '😀' 4; each starts at byte 1.
    for (const char of ['é', 'ক', '😀']) {
      const bytes = utf8(`a${char}b`);
      const length = utf8(char).length;
      for (let max = 2; max < 1 + length; max++) expect(utf8Boundary(bytes, max)).toBe(1);
      expect(utf8Boundary(bytes, 1 + length)).toBe(1 + length);
    }
  });

  it("leaves bytes that aren't UTF-8 where they are", () => {
    const bytes = new Uint8Array(10).fill(0x80);
    expect(utf8Boundary(bytes, 6)).toBe(6);
  });
});

describe('readTextPrefix (§18 W4)', () => {
  it('reads a file under the cap whole', async () => {
    const uri = write('small.txt', 'short notes');
    expect(await readTextPrefix(uri)).toEqual({ text: 'short notes', fallbackUsed: false, truncated: false });
  });

  it('cuts a longer file at the cap, on a character boundary, still as UTF-8', async () => {
    // 'ক' is 3 bytes, so a cap of 10 bytes falls inside the 4th one.
    const uri = write('bangla.txt', 'ক'.repeat(8));
    expect(await readTextPrefix(uri, 10)).toEqual({ text: 'ককক', fallbackUsed: false, truncated: true });
    expect(await readTextPrefix(uri, 9)).toEqual({ text: 'ককক', fallbackUsed: false, truncated: true });
  });

  it('drops a byte-order mark, which counts towards the cap', async () => {
    const uri = write('bom.txt', new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('hello world')]));
    expect(await readTextPrefix(uri, 8)).toEqual({ text: 'hello', fallbackUsed: false, truncated: true });
    expect((await readTextPrefix(uri)).text).toBe('hello world');
  });

  it('falls back to single bytes for a file that is not UTF-8', async () => {
    const uri = write('latin1.txt', new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x61, 0x75, 0x20, 0x6c, 0x61, 0x69, 0x74]));
    expect(await readTextPrefix(uri, 6)).toEqual({ text: 'café a', fallbackUsed: true, truncated: true });
  });

  it('caps at 4 MB by default', async () => {
    expect(TXT_MAX_BYTES).toBe(4 * 1024 * 1024);
    const uri = write('big.txt', new Uint8Array(TXT_MAX_BYTES + 1000).fill(0x61));
    const result = await readTextPrefix(uri);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(TXT_MAX_BYTES);
  });
});

describe('readTextWithEncodingFallback', () => {
  it('decodes a large non-UTF-8 file without changing a byte', async () => {
    const bytes = new Uint8Array(20000).map((_, i) => (i % 2 ? 0xe9 : 0x61));
    const { text, fallbackUsed } = await readTextWithEncodingFallback(write('long-latin1.txt', bytes));
    expect(fallbackUsed).toBe(true);
    expect(text.length).toBe(20000);
    expect(text.slice(0, 4)).toBe('aéaé');
  });
});
