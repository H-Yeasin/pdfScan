import { File } from 'expo-file-system';

export type TextReadResult = { text: string; fallbackUsed: boolean };

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function startsWithBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && UTF8_BOM.every((b, i) => bytes[i] === b);
}

// Shared by TxtView, SheetView's CSV path, and promoteExternalToLibrary's CSV/TXT import - reads
// raw bytes (not File.text(), which gives no encoding control) and decodes as UTF-8. Falls back to
// a permissive single-byte (Latin-1/Windows-1252-ish) decode on invalid UTF-8 rather than throwing
// or silently mangling into replacement characters - callers surface fallbackUsed as a small
// "may not display correctly" disclosure, per the plan's explicit "fallback path, not a full
// encoding-detection subsystem" scoping.
export async function readTextWithEncodingFallback(uri: string): Promise<TextReadResult> {
  const bytes = await new File(uri).bytes();
  const body = startsWithBom(bytes) ? bytes.slice(3) : bytes;

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), fallbackUsed: false };
  } catch {
    let text = '';
    for (let i = 0; i < body.length; i++) text += String.fromCharCode(body[i]);
    return { text, fallbackUsed: true };
  }
}
