// The code points Helvetica (a standard PDF font, WinAnsi encoding) can draw: printable ASCII,
// Latin-1 from U+00A0, and the 0x80–0x9F extras WinAnsi maps to typographic characters. It must
// match `font.getCharacterSet()` for Helvetica, which pdfService.toWinAnsiSafe uses (a test
// checks this). This copy exists to check text synchronously, without embedding a font:
// visibleText.needsShaping (§6 L3) uses it to pick Helvetica or Skia for each run.
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const WIN_ANSI = new Set<number>();
for (let cp = 0x20; cp <= 0x7e; cp++) WIN_ANSI.add(cp);
for (let cp = 0xa0; cp <= 0xff; cp++) WIN_ANSI.add(cp);
for (const ch of WIN_ANSI_EXTRAS) WIN_ANSI.add(ch.codePointAt(0)!);

export const WIN_ANSI_CODE_POINTS: ReadonlySet<number> = WIN_ANSI;

// True when every character can be drawn with Helvetica as is, i.e. toWinAnsiSafe would leave
// the text unchanged.
export function isWinAnsiSafe(text: string): boolean {
  for (const ch of text) if (!WIN_ANSI.has(ch.codePointAt(0) ?? 0)) return false;
  return true;
}
