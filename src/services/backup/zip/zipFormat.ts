// §8 B2: the parts of the zip format (PKWARE APPNOTE 6.3) that zipWriter and zipReader share.
// Only what PDF Scan writes is supported: STORE (no compression), UTF-8 names, Zip64.

export const SIG_LOCAL = 0x04034b50;
export const SIG_CENTRAL = 0x02014b50;
export const SIG_EOCD = 0x06054b50;
export const SIG_ZIP64_EOCD = 0x06064b50;
export const SIG_ZIP64_LOCATOR = 0x07064b50;

export const LOCAL_HEADER_SIZE = 30;
export const CENTRAL_HEADER_SIZE = 46;
export const EOCD_SIZE = 22;
export const ZIP64_EOCD_SIZE = 56;
export const ZIP64_LOCATOR_SIZE = 20;
export const ZIP64_EXTRA_ID = 0x0001;

export const METHOD_STORE = 0;
// Bit 11: the name is UTF-8.
export const FLAG_UTF8 = 0x0800;
export const VERSION_DEFAULT = 20;
export const VERSION_ZIP64 = 45;

// Where a field no longer fits and its Zip64 counterpart takes over. Tests lower them to check the
// Zip64 paths without writing 4 GB or 65,535 entries.
export type ZipLimits = { maxSize32: number; maxEntries16: number };
export const DEFAULT_LIMITS: ZipLimits = { maxSize32: 0xffffffff, maxEntries16: 0xffff };

// The file-handle surface the zip code needs; expo-file-system's FileHandle has exactly this
// shape (File.open()), and tests pass in-memory ones.
export type ReadableHandle = {
  readBytes(length: number): Uint8Array;
  offset: number | null;
  size: number | null;
  close(): void;
};

export type WritableHandle = {
  writeBytes(bytes: Uint8Array): void;
  offset: number | null;
  close(): void;
};

export type ZipErrorCode =
  // Not a zip, or cut short.
  | 'NOT_A_ZIP'
  // A zip PDF Scan didn't write: compressed or encrypted entries (e.g. re-zipped on a computer).
  | 'UNSUPPORTED_ZIP'
  // An entry's bytes don't match its checksum.
  | 'CRC_MISMATCH';

export class ZipError extends Error {
  constructor(
    readonly code: ZipErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ZipError';
  }
}

// Little-endian writes into a buffer being built. 64-bit values go through two 32-bit halves:
// sizes stay below 2^53, so plain numbers are exact.
export class ByteWriter {
  readonly bytes: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(value: number): this {
    this.view.setUint16(this.pos, value, true);
    this.pos += 2;
    return this;
  }
  u32(value: number): this {
    this.view.setUint32(this.pos, value >>> 0, true);
    this.pos += 4;
    return this;
  }
  u64(value: number): this {
    this.u32(value % 0x100000000);
    return this.u32(Math.floor(value / 0x100000000));
  }
  raw(bytes: Uint8Array): this {
    this.bytes.set(bytes, this.pos);
    this.pos += bytes.length;
    return this;
  }
}

export class ByteReader {
  private view: DataView;
  constructor(
    readonly bytes: Uint8Array,
    public pos = 0
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u16(): number {
    const value = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return value;
  }
  u32(): number {
    const value = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return value;
  }
  u64(): number {
    const low = this.u32();
    return this.u32() * 0x100000000 + low;
  }
  slice(length: number): Uint8Array {
    const out = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }
}

// MS-DOS date and time, local time, 2-second resolution; dates before 1980 clamp to 1980.
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}
