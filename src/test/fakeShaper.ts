import { setTextShaper, type TextShaper } from '../services/pdf/visibleText';
import { makePng } from './png';

// Skia can't run under Jest, so tests shape text with this: every character is 0.6 em wide, with
// a 0.8 em ascent and 0.25 em descent, rasterized as a blank PNG of the right size. Enough to check
// where visibleText puts the image and the searchable text, not what the glyphs look like.
export const FAKE_EM = { advance: 0.6, ascent: 0.8, descent: 0.25 };

export function makeFakeShaper(): TextShaper & { rasterize: jest.Mock; measure: jest.Mock } {
  const run = (text: string, size: number) => ({
    width: [...text].length * FAKE_EM.advance * size,
    ascent: FAKE_EM.ascent * size,
    descent: FAKE_EM.descent * size,
  });
  return {
    measure: jest.fn((text: string, size: number) => run(text, size)),
    rasterize: jest.fn((text: string, size: number, _bold: boolean, pxPerUnit: number) => {
      const r = run(text, size);
      return { png: makePng(Math.ceil(r.width * pxPerUnit), Math.ceil((r.ascent + r.descent) * pxPerUnit)), run: r };
    }),
  };
}

// Installs a fake shaper; call the returned function (e.g. in afterEach) to undo.
export function installFakeShaper() {
  const shaper = makeFakeShaper();
  const uninstall = setTextShaper(shaper);
  return { shaper, uninstall };
}
