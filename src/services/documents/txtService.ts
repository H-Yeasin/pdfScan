import { File, FileMode } from 'expo-file-system';

export type TextReadResult = { text: string; fallbackUsed: boolean };
// `truncated`: the file is longer than the cap, and `text` is only its start.
export type TextPrefixResult = TextReadResult & { truncated: boolean };

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const LATIN1_CHUNK = 8192;

function startsWithBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && UTF8_BOM.every((b, i) => bytes[i] === b);
}

// Shared by TxtView, SheetView's CSV path, and promoteExternalToLibrary's CSV/TXT import - reads
// raw bytes (not File.text(), which gives no encoding control) and decodes as UTF-8. Falls back to
// a permissive single-byte (Latin-1/Windows-1252-ish) decode on invalid UTF-8 rather than throwing
// or silently mangling into replacement characters - callers surface fallbackUsed as a small
// "may not display correctly" disclosure, per the plan's explicit "fallback path, not a full
// encoding-detection subsystem" scoping.
function decode(bytes: Uint8Array): TextReadResult {
  const body = startsWithBom(bytes) ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), fallbackUsed: false };
  } catch {
    // In pieces: one `+=` per byte makes millions of short strings for a file of a few MB.
    let text = '';
    for (let i = 0; i < body.length; i += LATIN1_CHUNK) {
      text += String.fromCharCode.apply(null, body.subarray(i, i + LATIN1_CHUNK) as unknown as number[]);
    }
    return { text, fallbackUsed: true };
  }
}

export async function readTextWithEncodingFallback(uri: string): Promise<TextReadResult> {
  return decode(await new File(uri).bytes());
}

// §18 W4: the preview's cap. A text file had none (sheets stop at 10 MB, DOCX at 20 MB), so a
// 50 MB log was read, decoded and cut into list items in one go, on the JS thread.
export const TXT_MAX_BYTES = 4 * 1024 * 1024;

// Where to cut `bytes` at or before `max` so that no UTF-8 character is split: a cut in the middle
// of a character would make the strict decoder fail and the whole file fall back to Latin-1. A
// character is a lead byte and up to three continuation bytes (10xxxxxx), so the cut steps back
// over at most three of those and then drops a lead byte whose character doesn't fit. Bytes that
// aren't UTF-8 at all are left where they are (the fallback decode takes any byte).
export function utf8Boundary(bytes: Uint8Array, max: number): number {
  if (max >= bytes.length) return bytes.length;
  let cut = max;
  let back = 0;
  while (cut > 0 && back < 3 && (bytes[cut] & 0xc0) === 0x80) {
    cut -= 1;
    back += 1;
  }
  // bytes[cut] now starts a character (which is cut off, so it goes) or isn't UTF-8.
  return (bytes[cut] & 0xc0) === 0x80 ? max : cut;
}

// The start of a text file: at most `maxBytes` of it, read through a file handle so a huge file is
// never loaded whole. For TxtView and promoteExternalToLibrary (the search text of a text file is
// its preview). The editor and the converters read the whole file, as before.
export async function readTextPrefix(uri: string, maxBytes = TXT_MAX_BYTES): Promise<TextPrefixResult> {
  const file = new File(uri);
  if ((file.size ?? 0) <= maxBytes) return { ...(await readTextWithEncodingFallback(uri)), truncated: false };
  const handle = file.open(FileMode.ReadOnly);
  let bytes: Uint8Array;
  try {
    // One byte more than the cap: the byte after the cut says whether a character was split.
    bytes = handle.readBytes(maxBytes + 1);
  } finally {
    handle.close();
  }
  return { ...decode(bytes.subarray(0, utf8Boundary(bytes, maxBytes))), truncated: true };
}
