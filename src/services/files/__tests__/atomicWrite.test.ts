import { Directory, File, Paths } from 'expo-file-system';
import { interruptedWriteTarget, moveReplacing, writeFileReplacing } from '../atomicWrite';

const dir = () => new Directory(Paths.document, 'library', 'doc_atomic');
const names = () => dir().list().map((entry) => entry.name).sort();

beforeEach(() => {
  new Directory(Paths.document, 'library').delete();
});
afterEach(() => jest.restoreAllMocks());

describe('writeFileReplacing (§18 W3)', () => {
  it('writes a new file, creating its folder', async () => {
    const dest = new File(dir(), 'document.pdf');
    writeFileReplacing(dest, 'new');
    expect(await dest.text()).toBe('new');
    expect(names()).toEqual(['document.pdf']);
  });

  it('replaces the old file and leaves nothing else behind', async () => {
    const dest = new File(dir(), 'document.pdf');
    dest.write('old');
    writeFileReplacing(dest, new Uint8Array([110, 101, 119]));
    expect(await dest.text()).toBe('new');
    expect(names()).toEqual(['document.pdf']);
  });

  it('keeps the old bytes when the write throws', async () => {
    const dest = new File(dir(), 'document.pdf');
    dest.write('old');
    jest.spyOn(File.prototype, 'write').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => writeFileReplacing(dest, 'new')).toThrow('disk full');
    expect(await dest.text()).toBe('old');
    expect(names()).toEqual(['document.pdf']);
  });

  it('keeps the complete temporary file when the last move fails', async () => {
    const dest = new File(dir(), 'document.pdf');
    dest.write('old');
    jest.spyOn(File.prototype, 'moveSync').mockImplementation(() => {
      throw new Error('killed');
    });
    expect(() => writeFileReplacing(dest, 'new')).toThrow('killed');
    const left = names();
    expect(left).toHaveLength(1);
    expect(interruptedWriteTarget(left[0])).toBe('document.pdf');
    expect(await new File(dir(), left[0]).text()).toBe('new');
  });
});

describe('moveReplacing (§18 W3)', () => {
  it('moves a finished file over the old one', async () => {
    const dest = new File(dir(), 'document.pdf');
    dest.write('old');
    const src = new File(Paths.cache, 'pdf-ops', 'built.pdf');
    src.write('built');
    const srcUri = src.uri;
    moveReplacing(src, dest);
    expect(await dest.text()).toBe('built');
    expect(new File(srcUri).exists).toBe(false);
    expect(names()).toEqual(['document.pdf']);
  });

  it('keeps the old file when the source cannot be moved', async () => {
    const dest = new File(dir(), 'document.pdf');
    dest.write('old');
    const missing = new File(Paths.cache, 'pdf-ops', 'never-built.pdf');
    expect(() => moveReplacing(missing, dest)).toThrow();
    expect(await dest.text()).toBe('old');
    expect(names()).toEqual(['document.pdf']);
  });
});

describe('interruptedWriteTarget', () => {
  it('names the file a temporary file was for, and nothing else', () => {
    expect(interruptedWriteTarget('.document.pdf.tmp-w_abc_1')).toBe('document.pdf');
    expect(interruptedWriteTarget('document.pdf')).toBeNull();
    expect(interruptedWriteTarget('document.cover.tmp.pdf')).toBeNull();
    expect(interruptedWriteTarget('.trash')).toBeNull();
  });
});
