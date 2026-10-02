// A JPEG-shaped file for tests: SOI, a baseline SOF0 header with the given size, `padBytes` of
// entropy-coded filler and EOI. pdf-lib's embedJpg only reads the SOF header, so it embeds this
// like a real photo; nothing in the tests decodes the pixels.
export function makeJpeg(width: number, height: number, padBytes = 64): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const bytes = new Uint8Array(2 + sof.length + padBytes + 2);
  bytes.set([0xff, 0xd8], 0);
  bytes.set(sof, 2);
  bytes.fill(0x55, 2 + sof.length, 2 + sof.length + padBytes);
  bytes.set([0xff, 0xd9], bytes.length - 2);
  return bytes;
}
