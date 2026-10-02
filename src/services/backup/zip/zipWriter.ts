import { crc32 } from './crc32';
import { encodeUtf8 } from './utf8';
import {
  ByteWriter,
  CENTRAL_HEADER_SIZE,
  DEFAULT_LIMITS,
  dosDateTime,
  EOCD_SIZE,
  FLAG_UTF8,
  LOCAL_HEADER_SIZE,
  METHOD_STORE,
  SIG_CENTRAL,
  SIG_EOCD,
  SIG_LOCAL,
  SIG_ZIP64_EOCD,
  SIG_ZIP64_LOCATOR,
  VERSION_DEFAULT,
  VERSION_ZIP64,
  ZIP64_EOCD_SIZE,
  ZIP64_EXTRA_ID,
  ZIP64_LOCATOR_SIZE,
  type ReadableHandle,
  type WritableHandle,
  type ZipLimits,
} from './zipFormat';

// §8 B2: writes a zip one entry at a time, without compression (STORE). Backups are JPEGs and
// PDFs, already compressed, so deflating them would cost minutes for almost nothing - and STORE
// keeps this small enough to own, with no native dependency.
//
// Layout: each entry's local header is written with its real size (known before copying) and a
// blank CRC; the data streams through in 1 MB chunks while the CRC is computed, then the writer
// seeks back and fills the CRC in. That needs a seekable destination (a file:// file in the cache;
// B3 copies the finished zip to a SAF folder), but gives a plain zip without data descriptors,
// which every reader handles - Java's ZipInputStream, for one, rejects STORE entries that use them.
// Zip64 fields are added where a size, an offset or the entry count no longer fits.

export const CHUNK_BYTES = 1024 * 1024;

type CentralRecord = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
};

export type AddFileOptions = {
  signal?: AbortSignal;
  // Bytes of this entry copied so far.
  onProgress?: (bytesCopied: number) => void;
};

// Yields to the JS event loop between chunks, so a big copy never freezes the UI.
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export class ZipAbortedError extends Error {
  constructor() {
    super('Zip writing was cancelled');
    this.name = 'ZipAbortedError';
  }
}

export class ZipWriter {
  private position = 0;
  private records: CentralRecord[] = [];
  private names = new Set<string>();
  private finished = false;
  private readonly limits: ZipLimits;
  private readonly stamp: { time: number; date: number };

  constructor(
    private readonly handle: WritableHandle,
    options: { limits?: ZipLimits; modified?: Date } = {}
  ) {
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.stamp = dosDateTime(options.modified ?? new Date());
  }

  // Bytes written so far.
  get bytesWritten(): number {
    return this.position;
  }

  get entryCount(): number {
    return this.records.length;
  }

  async addFile(name: string, source: ReadableHandle, options: AddFileOptions = {}): Promise<void> {
    const size = source.size ?? 0;
    const headerOffset = this.beginEntry(name, size);
    let crc = 0;
    let copied = 0;
    source.offset = 0;
    while (copied < size) {
      if (options.signal?.aborted) throw new ZipAbortedError();
      const chunk = source.readBytes(Math.min(CHUNK_BYTES, size - copied));
      // The file shrank while it was being copied: the header already promised `size` bytes.
      if (chunk.length === 0) throw new Error(`zip: ${name} ended early`);
      crc = crc32(chunk, crc);
      this.write(chunk);
      copied += chunk.length;
      options.onProgress?.(copied);
      await breathe();
    }
    this.endEntry(headerOffset, crc, size);
  }

  addBytes(name: string, bytes: Uint8Array): void {
    const headerOffset = this.beginEntry(name, bytes.length);
    this.write(bytes);
    this.endEntry(headerOffset, crc32(bytes), bytes.length);
  }

  addJson(name: string, value: unknown): void {
    this.addBytes(name, encodeUtf8(JSON.stringify(value)));
  }

  // Writes the central directory and the end records, and closes the destination. Returns the
  // zip's size in bytes.
  finish(): number {
    if (this.finished) throw new Error('zip: already finished');
    const { maxSize32, maxEntries16 } = this.limits;
    const centralOffset = this.position;
    for (const record of this.records) this.write(this.centralHeader(record));
    const centralSize = this.position - centralOffset;
    const count = this.records.length;

    const zip64 = count >= maxEntries16 || centralOffset >= maxSize32 || centralSize >= maxSize32;
    if (zip64) {
      const recordOffset = this.position;
      this.write(
        new ByteWriter(ZIP64_EOCD_SIZE)
          .u32(SIG_ZIP64_EOCD)
          // Size of the rest of this record.
          .u64(ZIP64_EOCD_SIZE - 12)
          .u16(VERSION_ZIP64)
          .u16(VERSION_ZIP64)
          .u32(0)
          .u32(0)
          .u64(count)
          .u64(count)
          .u64(centralSize)
          .u64(centralOffset).bytes
      );
      this.write(new ByteWriter(ZIP64_LOCATOR_SIZE).u32(SIG_ZIP64_LOCATOR).u32(0).u64(recordOffset).u32(1).bytes);
    }
    const entries16 = count >= maxEntries16 ? 0xffff : count;
    this.write(
      new ByteWriter(EOCD_SIZE)
        .u32(SIG_EOCD)
        .u16(0)
        .u16(0)
        .u16(entries16)
        .u16(entries16)
        .u32(centralSize >= maxSize32 ? 0xffffffff : centralSize)
        .u32(centralOffset >= maxSize32 ? 0xffffffff : centralOffset)
        .u16(0).bytes
    );
    this.finished = true;
    this.handle.close();
    return this.position;
  }

  // Stops writing; the caller deletes the partial file.
  abort(): void {
    if (this.finished) return;
    this.finished = true;
    this.handle.close();
  }

  private write(bytes: Uint8Array): void {
    this.handle.writeBytes(bytes);
    this.position += bytes.length;
  }

  private needsZip64Size(size: number): boolean {
    return size >= this.limits.maxSize32;
  }

  private beginEntry(name: string, size: number): number {
    if (this.finished) throw new Error('zip: already finished');
    if (this.names.has(name)) throw new Error(`zip: duplicate entry ${name}`);
    this.names.add(name);
    const nameBytes = encodeUtf8(name);
    const zip64 = this.needsZip64Size(size);
    const extraLength = zip64 ? 20 : 0;
    const header = new ByteWriter(LOCAL_HEADER_SIZE + nameBytes.length + extraLength)
      .u32(SIG_LOCAL)
      .u16(zip64 ? VERSION_ZIP64 : VERSION_DEFAULT)
      .u16(FLAG_UTF8)
      .u16(METHOD_STORE)
      .u16(this.stamp.time)
      .u16(this.stamp.date)
      // CRC-32, filled in by endEntry.
      .u32(0)
      .u32(zip64 ? 0xffffffff : size)
      .u32(zip64 ? 0xffffffff : size)
      .u16(nameBytes.length)
      .u16(extraLength)
      .raw(nameBytes);
    if (zip64) header.u16(ZIP64_EXTRA_ID).u16(16).u64(size).u64(size);
    const offset = this.position;
    this.write(header.bytes);
    this.records.push({ name: nameBytes, crc: 0, size, offset });
    return offset;
  }

  private endEntry(headerOffset: number, crc: number, size: number): void {
    const record = this.records[this.records.length - 1];
    record.crc = crc;
    record.size = size;
    if (crc === 0) return;
    // Back to the header's CRC field (offset 14), then on to the end again.
    this.handle.offset = headerOffset + 14;
    this.handle.writeBytes(new ByteWriter(4).u32(crc).bytes);
    this.handle.offset = this.position;
  }

  private centralHeader(record: CentralRecord): Uint8Array {
    const sizeOverflows = this.needsZip64Size(record.size);
    const offsetOverflows = record.offset >= this.limits.maxSize32;
    // Zip64 extra: only the fields that overflowed, in this order.
    const extraFields = (sizeOverflows ? 2 : 0) + (offsetOverflows ? 1 : 0);
    const extraLength = extraFields ? 4 + extraFields * 8 : 0;
    const out = new ByteWriter(CENTRAL_HEADER_SIZE + record.name.length + extraLength)
      .u32(SIG_CENTRAL)
      .u16(VERSION_ZIP64)
      .u16(extraFields ? VERSION_ZIP64 : VERSION_DEFAULT)
      .u16(FLAG_UTF8)
      .u16(METHOD_STORE)
      .u16(this.stamp.time)
      .u16(this.stamp.date)
      .u32(record.crc)
      .u32(sizeOverflows ? 0xffffffff : record.size)
      .u32(sizeOverflows ? 0xffffffff : record.size)
      .u16(record.name.length)
      .u16(extraLength)
      // Comment length, disk number, internal and external attributes.
      .u16(0)
      .u16(0)
      .u16(0)
      .u32(0)
      .u32(offsetOverflows ? 0xffffffff : record.offset)
      .raw(record.name);
    if (extraFields) {
      out.u16(ZIP64_EXTRA_ID).u16(extraFields * 8);
      if (sizeOverflows) out.u64(record.size).u64(record.size);
      if (offsetOverflows) out.u64(record.offset);
    }
    return out.bytes;
  }
}
