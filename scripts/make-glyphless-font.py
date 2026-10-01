#!/usr/bin/env python3
"""Generates assets/fonts/glyphless.ttf: a tiny TrueType font whose only real glyph is blank.

The OCR text layer (src/services/pdf/textLayer.ts) embeds this font as a CIDFontType2 whose
CIDToGIDMap sends every CID to glyph 1, so one ~1 KB font can carry invisible, searchable text in
any script (Latin, CJK, Devanagari, Bengali, ...). Same idea as Tesseract's PDF renderer. Written
from scratch here, so there's no third-party font licence involved.

Usage: pip install fonttools && python3 scripts/make-glyphless-font.py
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS_PER_EM = 1000
ADVANCE = 500  # Must match GLYPH_ADVANCE in textLayer.ts.
OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "glyphless.ttf"


def empty_glyph():
    return TTGlyphPen(None).glyph()


def main() -> None:
    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    glyph_order = [".notdef", "blank"]
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap({0x20: "blank"})
    fb.setupGlyf({name: empty_glyph() for name in glyph_order})
    fb.setupHorizontalMetrics({name: (ADVANCE, 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=UNITS_PER_EM, descent=0)
    fb.setupNameTable({"familyName": "GlyphLessFont", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=UNITS_PER_EM, sTypoDescender=0, usWinAscent=UNITS_PER_EM, usWinDescent=0)
    fb.setupPost()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(OUT))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
