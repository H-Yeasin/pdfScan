import { crc32 } from './crc32';
import { decodeUtf8 } from './utf8';
import {
  ByteReader,
  CENTRAL_HEADER_SIZE,
  EOCD_SIZE,
  LOCAL_HEADER_SIZE,
  METHOD_STORE,
  SIG_CENTRAL,
  SIG_EOCD,
  SIG_LOCAL,
  SIG_ZIP64_EOCD,
  SIG_ZIP64_LOCATOR,
  ZIP64_EXTRA_ID,
  ZIP64_LOCATOR_SIZE,
  ZipError,
  type ReadableHandle,
  type WritableHandle,
} from './zipFormat';
import { CHUNK_BYTES, ZipAbortedError } from './zipWriter';

// §8 B2: reads zips written by zipWriter (and any other STORE-only zip): the central directory,
// Zip64 included, and each entry streamed out in chunks with its CRC checked. A compressed or
// encrypted entry means the zip was re-made by another program; that fails as UNSUPPORTED_ZIP
// as soon as the zip is opened, before anything is copied.

export type ZipEntry = {
  name: string;
  size: number;
  crc: number;
  // Where the entry's local header starts.
  headerOffset: number;
};

const MAX_COMMENT = 0xffff;

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function readAt(handle: ReadableHandle, offset: number, length: number): Uint8Array {
  handle.offset = offset;
  const bytes = handle.readBytes(length);
  if (bytes.length < length) throw new ZipError('NOT_A_ZIP', 'zip: unexpected end of file');
  return bytes;
}

export class ZipReader {
  readonly entries: ZipEntry[];
  private byName: Map<string, ZipEntry>;

  private constructor(
    private readonly handle: ReadableHandle,
    entries: ZipEntry[]
  ) {
    this.entries = entries;
    this.byName = new Map(entries.map((entry) => [entry.name, entry]));
  }

  static open(handle: ReadableHandle): ZipReader {
    try {
      return new ZipReader(handle, readCentralDirectory(handle));
    } catch (error) {
      handle.close();
      if (error instanceof ZipError) throw error;
      throw new ZipError('NOT_A_ZIP', `zip: ${String(error)}`);
    }
  }

  entry(name: string): ZipEntry | undefined {
    return this.byName.get(name);
  }

  // Copies an entry into `dest` in chunks, checking its CRC at the end (CRC_MISMATCH: the caller
  // throws the partial file away).
  async extract(
    entry: ZipEntry,
    dest: WritableHandle,
    options: { signal?: AbortSignal; onProgress?: (bytesCopied: number) => void } = {}
  ): Promise<void> {
    let offset = this.dataOffset(entry);
    let copied = 0;
    let crc = 0;
    while (copied < entry.size) {
      if (options.signal?.aborted) throw new ZipAbortedError();
      const chunk = readAt(this.handle, offset, Math.min(CHUNK_BYTES, entry.size - copied));
      crc = crc32(chunk, crc);
      dest.writeBytes(chunk);
      copied += chunk.length;
      offset += chunk.length;
      options.onProgress?.(copied);
      await breathe();
    }
    if (crc !== entry.crc) throw new ZipError('CRC_MISMATCH', `zip: ${entry.name} is damaged`);
  }

  // A small entry (manifest.json, library.json) read whole, CRC checked.
  readBytes(entry: ZipEntry): Uint8Array {
    const bytes = entry.size === 0 ? new Uint8Array(0) : readAt(this.handle, this.dataOffset(entry), entry.size);
    if (crc32(bytes) !== entry.crc) throw new ZipError('CRC_MISMATCH', `zip: ${entry.name} is damaged`);
    return bytes;
  }

  readJson<T>(entry: ZipEntry): T {
    return JSON.parse(decodeUtf8(this.readBytes(entry))) as T;
  }

  close(): void {
    this.handle.close();
  }

  // The local header repeats the name and may carry a different extra field, so the data's start
  // is read from it rather than assumed from the central record.
  private dataOffset(entry: ZipEntry): number {
    const header = new ByteReader(readAt(this.handle, entry.headerOffset, LOCAL_HEADER_SIZE));
    if (header.u32() !== SIG_LOCAL) throw new ZipError('NOT_A_ZIP', `zip: bad local header for ${entry.name}`);
    header.pos = 26;
    const nameLength = header.u16();
    const extraLength = header.u16();
    return entry.headerOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
  }
}

function readCentralDirectory(handle: ReadableHandle): ZipEntry[] {
  const fileSize = handle.size ?? 0;
  if (fileSize < EOCD_SIZE) throw new ZipError('NOT_A_ZIP', 'zip: too small');

  // The end record is the last thing in the file, followed only by an optional comment.
  const tailLength = Math.min(fileSize, EOCD_SIZE + MAX_COMMENT);
  const tailStart = fileSize - tailLength;
  const tail = readAt(handle, tailStart, tailLength);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - EOCD_SIZE; i >= 0; i--) {
    if (tailView.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('NOT_A_ZIP', 'zip: no end of central directory');

  const end = new ByteReader(tail, eocd + 10);
  let count = end.u16();
  let centralSize = end.u32();
  let centralOffset = end.u32();

  // Zip64: a locator just before the end record points at the Zip64 end record.
  const locatorAt = tailStart + eocd - ZIP64_LOCATOR_SIZE;
  if (locatorAt >= 0) {
    const locator = new ByteReader(readAt(handle, locatorAt, ZIP64_LOCATOR_SIZE));
    if (locator.u32() === SIG_ZIP64_LOCATOR) {
      locator.u32();
      const recordOffset = locator.u64();
      const record = new ByteReader(readAt(handle, recordOffset, 56));
      if (record.u32() !== SIG_ZIP64_EOCD) throw new ZipError('NOT_A_ZIP', 'zip: bad Zip64 end record');
      record.pos = 32;
      count = record.u64();
      centralSize = record.u64();
      centralOffset = record.u64();
    }
  }

  const central = new ByteReader(readAt(handle, centralOffset, centralSize));
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const start = central.pos;
    if (central.u32() !== SIG_CENTRAL) throw new ZipError('NOT_A_ZIP', 'zip: bad central directory');
    central.pos = start + 8;
    const flags = central.u16();
    const method = central.u16();
    central.pos = start + 16;
    const crc = central.u32();
    let compressedSize = central.u32();
    let size = central.u32();
    const nameLength = central.u16();
    const extraLength = central.u16();
    const commentLength = central.u16();
    central.pos = start + 42;
    let headerOffset = central.u32();
    central.pos = start + CENTRAL_HEADER_SIZE;
    const name = decodeUtf8(central.slice(nameLength));
    const extra = new ByteReader(central.slice(extraLength));
    central.slice(commentLength);

    while (extra.pos + 4 <= extra.bytes.length) {
      const id = extra.u16();
      const length = extra.u16();
      const next = extra.pos + length;
      if (id === ZIP64_EXTRA_ID) {
        if (size === 0xffffffff) size = extra.u64();
        if (compressedSize === 0xffffffff) compressedSize = extra.u64();
        if (headerOffset === 0xffffffff) headerOffset = extra.u64();
      }
      extra.pos = next;
    }

    // Bit 0: encrypted. Anything but STORE: compressed by another program.
    if (method !== METHOD_STORE || flags & 1 || compressedSize !== size) {
      throw new ZipError('UNSUPPORTED_ZIP', `zip: ${name} is compressed or encrypted`);
    }
    // Folder entries (other tools add them) carry nothing.
    if (name.endsWith('/') && size === 0) continue;
    entries.push({ name, size, crc, headerOffset });
  }
  return entries;
}
