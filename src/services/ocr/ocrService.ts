import MlkitOcr from 'rn-mlkit-ocr';
import type { OcrBlock, OcrScript, PageOcr } from '../../types/models';

// rn-mlkit-ocr wraps Google ML Kit's on-device text recognizer, which supports five
// script models (Latin, Chinese, Devanagari, Japanese, Korean) — the caller passes
// whichever one matches the document. Treat a failed/empty result as "no text found"
// rather than a hard error — OCR is a best-effort enhancement, not load-bearing.
export async function runOcr(uri: string, script: OcrScript): Promise<PageOcr | undefined> {
  try {
    const result = await MlkitOcr.recognizeText(uri, script);
    if (!result || result.blocks.length === 0) return { text: '', blocks: [] };

    const blocks: OcrBlock[] = result.blocks.map((block) => ({
      text: block.text,
      bounding: { left: block.frame.x, top: block.frame.y, width: block.frame.width, height: block.frame.height },
      lines: block.lines.map((line) => ({
        text: line.text,
        bounding: { left: line.frame.x, top: line.frame.y, width: line.frame.width, height: line.frame.height },
      })),
    }));

    return { text: result.text, blocks };
  } catch (error) {
    console.warn('OCR failed', error);
    return undefined;
  }
}
