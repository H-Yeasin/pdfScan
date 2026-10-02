import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { crc32 } from '../crc32';
import { addFileFromDisk, createZip, extractToFile, openZip } from '../index';
import { decodeUtf8, encodeUtf8 } from '../utf8';
import { ByteReader, ByteWriter, ZipError, type ReadableHandle, type WritableHandle } from '../zipFormat';
import { ZipReader } from '../zipReader';
import { ZipAbortedError, ZipWriter } from '../zipWriter';

// In-memory handles: a growable sink with a seekable offset, and a source over bytes.
class MemorySink implements WritableHandle {
  private buffer = new Uint8Array(1024);
  private length = 0;
  offset: number | null = 0;
  closed = false;
  writeBytes(bytes: Uint8Array): void {
    const at = this.offset ?? 0;
    const needed = at + bytes.length;
    if (needed > this.buffer.length) {
      const grown = new Uint8Array(Math.max(needed, this.buffer.length * 2));
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(bytes, at);
    this.length = Math.max(this.length, needed);
    this.offset = needed;
  }
  close(): void {
    this.closed = true;
  }
  get bytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

function source(bytes: Uint8Array): ReadableHandle {
  return {
    offset: 0,
    size: bytes.length,
    readBytes(length: number) {
      const at = this.offset ?? 0;
      const out = bytes.slice(at, at + length);
      this.offset = at + out.length;
      return out;
    },
    close() {},
  };
}

function writeToDisk(name: string, bytes: Uint8Array): string {
  const file = new File(Paths.cache, 'zips', name);
  file.write(bytes);
  return decodeURIComponent(file.uri.replace('file://', ''));
}

function hasTool(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const HAS_PYTHON = hasTool('python3', ['--version']);
const HAS_UNZIP = hasTool('unzip', ['-v']);

// Python's zipfile is an independent reader that understands Zip64 and checks every CRC.
function pythonList(path: string): { name: string; size: number }[] {
  const script = [
    'import json, sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    'assert z.testzip() is None',
    'print(json.dumps([{"name": i.filename, "size": i.file_size} for i in z.infolist()]))',
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script, path], { maxBuffer: 64 * 1024 * 1024 }).toString());
}

const bytesOf = (text: string) => encodeUtf8(text);
// Jest's toEqual walks typed arrays element by element: far too slow for megabytes.
const sameBytes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

describe('crc32', () => {
  it('matches the reference value and works in chunks', () => {
    const data = bytesOf('123456789');
    expect(crc32(data)).toBe(0xcbf43926);
    expect(crc32(data.subarray(4), crc32(data.subarray(0, 4)))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('utf8', () => {
  it('round-trips names in any script', () => {
    for (const text of ['notes.pdf', 'Café', 'নোট ১.pdf', '数学', '📄 scan']) expect(decodeUtf8(encodeUtf8(text))).toBe(text);
    expect(Buffer.from(encodeUtf8('নোট')).toString('utf8')).toBe('নোট');
  });
});

describe('ByteWriter/ByteReader', () => {
  it('writes 64-bit values above 4 GB exactly', () => {
    const big = 5 * 1024 ** 3 + 123;
    expect(new ByteReader(new ByteWriter(8).u64(big).bytes).u64()).toBe(big);
  });
});

describe('zip round trip', () => {
  async function build(entries: [string, Uint8Array][], options?: ConstructorParameters<typeof ZipWriter>[1]): Promise<Uint8Array> {
    const sink = new MemorySink();
    const writer = new ZipWriter(sink, options);
    for (const [name, bytes] of entries) await writer.addFile(name, source(bytes));
    writer.finish();
    expect(sink.closed).toBe(true);
    return sink.bytes;
  }

  const ENTRIES: [string, Uint8Array][] = [
    ['manifest.json', bytesOf('{"a":1}')],
    ['empty.txt', new Uint8Array(0)],
    ['Courses/গণিত/নোট ১.pdf', bytesOf('%PDF-1.4 bangla')],
    ['data/doc_1/page_1.jpg', Uint8Array.from({ length: 3 * 1024 * 1024 + 7 }, (_, i) => i % 251)],
  ];

  it('reads back every entry, byte for byte', async () => {
    const reader = ZipReader.open(source(await build(ENTRIES)));
    expect(reader.entries.map((e) => e.name)).toEqual(ENTRIES.map(([name]) => name));
    for (const [name, bytes] of ENTRIES) {
      const sink = new MemorySink();
      await reader.extract(reader.entry(name)!, sink);
      expect(sameBytes(sink.bytes, bytes)).toBe(true);
    }
  });

  it('writes JSON entries', async () => {
    const sink = new MemorySink();
    const writer = new ZipWriter(sink);
    writer.addJson('library.json', { name: 'নোট', n: 1 });
    writer.finish();
    const reader = ZipReader.open(source(sink.bytes));
    expect(reader.readJson(reader.entry('library.json')!)).toEqual({ name: 'নোট', n: 1 });
  });

  it('refuses duplicate names', async () => {
    const writer = new ZipWriter(new MemorySink());
    writer.addBytes('a.txt', bytesOf('1'));
    expect(() => writer.addBytes('a.txt', bytesOf('2'))).toThrow(/duplicate/);
  });

  it('opens with other zip tools', async () => {
    const path = writeToDisk('roundtrip.zip', await build(ENTRIES));
    const jszip = await JSZip.loadAsync(fs.readFileSync(path));
    expect(await jszip.file('Courses/গণিত/নোট ১.pdf')!.async('string')).toBe('%PDF-1.4 bangla');
    expect(Object.keys(jszip.files).sort()).toEqual(ENTRIES.map(([name]) => name).sort());
    if (HAS_PYTHON) expect(pythonList(path).map((e) => e.name)).toEqual(ENTRIES.map(([name]) => name));
    if (HAS_UNZIP) execFileSync('unzip', ['-tq', path]);
  });

  it('uses Zip64 for big entries and offsets (limits lowered to simulate 4 GB)', async () => {
    const limits = { maxSize32: 100, maxEntries16: 0xffff };
    const entries: [string, Uint8Array][] = [
      ['small.txt', bytesOf('hi')],
      ['big.bin', Uint8Array.from({ length: 500 }, (_, i) => i % 256)],
      ['after.txt', bytesOf('after the big one')],
    ];
    const zip = await build(entries, { limits });
    const reader = ZipReader.open(source(zip));
    expect(reader.entries.map((e) => [e.name, e.size])).toEqual(entries.map(([name, bytes]) => [name, bytes.length]));
    const sink = new MemorySink();
    await reader.extract(reader.entry('big.bin')!, sink);
    expect(sink.bytes).toEqual(entries[1][1]);
    // The 0xFFFFFFFF markers and Zip64 extras are standard; other readers must agree.
    if (HAS_PYTHON) expect(pythonList(writeToDisk('zip64.zip', zip))).toEqual(entries.map(([name, b]) => ({ name, size: b.length })));
  });

  it('writes Zip64 end records for more than 65,535 entries', async () => {
    const sink = new MemorySink();
    const writer = new ZipWriter(sink);
    for (let i = 0; i < 70_000; i++) writer.addBytes(`f/${i}`, i % 2 ? bytesOf(String(i)) : new Uint8Array(0));
    writer.finish();
    const reader = ZipReader.open(source(sink.bytes));
    expect(reader.entries).toHaveLength(70_000);
    expect(decodeUtf8(reader.readBytes(reader.entry('f/69999')!))).toBe('69999');
    if (HAS_PYTHON) expect(pythonList(writeToDisk('many.zip', sink.bytes))).toHaveLength(70_000);
  }, 60_000);

  it('detects a damaged entry', async () => {
    const zip = await build([['a.bin', bytesOf('hello world, this is a test')]]);
    const damaged = zip.slice();
    // Inside a.bin's data: local header (30) + name (5) + a few bytes.
    damaged[30 + 5 + 3] ^= 0xff;
    const reader = ZipReader.open(source(damaged));
    await expect(reader.extract(reader.entry('a.bin')!, new MemorySink())).rejects.toMatchObject({ code: 'CRC_MISMATCH' });
    expect(() => reader.readBytes(reader.entry('a.bin')!)).toThrow(ZipError);
  });

  it('refuses a zip that another program compressed', async () => {
    const other = new JSZip();
    other.file('manifest.json', '{"format":"pdfscan-backup","padding":"' + 'x'.repeat(200) + '"}');
    const bytes = await other.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(() => ZipReader.open(source(bytes))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_ZIP' }));
  });

  it('reads a STORE zip from another program, skipping folder entries', async () => {
    const other = new JSZip();
    other.folder('Courses')!.file('a.pdf', '%PDF');
    const bytes = await other.generateAsync({ type: 'uint8array', compression: 'STORE' });
    const reader = ZipReader.open(source(bytes));
    expect(reader.entries.map((e) => e.name)).toEqual(['Courses/a.pdf']);
    expect(decodeUtf8(reader.readBytes(reader.entries[0]))).toBe('%PDF');
  });

  it('says when a file is not a zip', () => {
    expect(() => ZipReader.open(source(bytesOf('%PDF-1.4 not a zip at all, just text')))).toThrow(
      expect.objectContaining({ code: 'NOT_A_ZIP' })
    );
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const writer = new ZipWriter(new MemorySink());
    await expect(writer.addFile('a', source(bytesOf('abc')), { signal: controller.signal })).rejects.toBeInstanceOf(ZipAbortedError);
  });
});

describe('zip on disk', () => {
  it('streams files in and out through expo-file-system handles', async () => {
    const input = new File(Paths.document, 'in', 'page_1.jpg');
    input.write(Uint8Array.from({ length: 2_500_000 }, (_, i) => (i * 7) % 256));
    const zipFile = new File(Paths.cache, 'out', 'backup.zip');
    const writer = createZip(zipFile);
    const progress: number[] = [];
    await addFileFromDisk(writer, 'data/doc/page_1.jpg', input, { onProgress: (n) => progress.push(n) });
    writer.addJson('manifest.json', { ok: true });
    const size = writer.finish();
    expect(zipFile.size).toBe(size);
    expect(progress[progress.length - 1]).toBe(2_500_000);

    const reader = openZip(zipFile);
    const out = new File(Paths.cache, 'extracted', 'page_1.jpg');
    await extractToFile(reader, reader.entry('data/doc/page_1.jpg')!, out);
    reader.close();
    expect(sameBytes(await out.bytes(), await input.bytes())).toBe(true);
  });

  it('deletes a partly extracted file when its CRC fails', async () => {
    const zipFile = new File(Paths.cache, 'out', 'bad.zip');
    const writer = createZip(zipFile);
    writer.addBytes('a.bin', bytesOf('hello world'));
    writer.finish();
    const path = decodeURIComponent(zipFile.uri.replace('file://', ''));
    const bytes = fs.readFileSync(path);
    bytes[30 + 5] ^= 0xff;
    fs.writeFileSync(path, bytes);

    const reader = openZip(zipFile);
    const out = new File(Paths.cache, 'extracted', 'a.bin');
    await expect(extractToFile(reader, reader.entry('a.bin')!, out)).rejects.toMatchObject({ code: 'CRC_MISMATCH' });
    expect(out.exists).toBe(false);
  });
});
