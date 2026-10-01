import { PDFDocument, StandardFonts } from 'pdf-lib';
import { toWinAnsiSafe } from '../pdfService';
import { isWinAnsiSafe, WIN_ANSI_CODE_POINTS } from '../winAnsi';

describe('isWinAnsiSafe', () => {
  it("matches Helvetica's character set", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    // Only the printable ones: the set pdf-lib reports may also include control codes, which a
    // typed name never contains.
    const helvetica = new Set(font.getCharacterSet().filter((cp) => cp >= 0x20));
    expect([...WIN_ANSI_CODE_POINTS].sort((a, b) => a - b)).toEqual([...helvetica].sort((a, b) => a - b));
  });

  it('agrees with toWinAnsiSafe', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const text of ['Rahim Uddin', 'Café – “Zoë”', 'রহিম', 'Ana 数学', '']) {
      expect(isWinAnsiSafe(text)).toBe(toWinAnsiSafe(text, font) === text);
    }
  });
});
