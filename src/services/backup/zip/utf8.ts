// §8 B2: UTF-8 for zip entry names and JSON entries. Written out rather than TextEncoder/
// TextDecoder, which Hermes doesn't fully provide on every React Native version this app runs on.

export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

// Invalid sequences become U+FFFD rather than throwing: a name is still shown, just imperfectly.
export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let code = 0xfffd;
    let len = 1;
    if (b < 0x80) {
      code = b;
    } else if (b >= 0xc2 && b < 0xe0 && i + 1 < bytes.length) {
      code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      len = 2;
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
      code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      len = 3;
    } else if (b >= 0xf0 && b < 0xf5 && i + 3 < bytes.length) {
      code = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      len = 4;
    }
    out += String.fromCodePoint(code);
    i += len;
  }
  return out;
}
