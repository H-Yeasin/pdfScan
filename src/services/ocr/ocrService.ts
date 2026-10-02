import MlkitOcr, { type DetectorType } from 'rn-mlkit-ocr';
import { getScript } from '../scripts/registry';
import type { OcrBlock, OcrScript, PageOcr } from '../../types/models';

// rn-mlkit-ocr wraps Google ML Kit's on-device text recognizer, which supports five
// script models (Latin, Chinese, Devanagari, Japanese, Korean) — the caller passes
// whichever one matches the document. Treat a failed/empty result as "no text found"
// rather than a hard error — OCR is a best-effort enhancement, not load-bearing.
export async function runOcr(uri: string, script: OcrScript): Promise<PageOcr | undefined> {
  // Callers pass a resolveOcrScript result, which is always a ready script; this guards the rest.
  // Only ML Kit exists until the OcrEngine interface (§6 L2), so a planned script (Bangla, on
  // Tesseract) gives "no OCR" rather than reaching ML Kit with a model it doesn't have.
  const entry = getScript(script);
  if (!entry || entry.status !== 'ready' || entry.engine !== 'mlkit') return undefined;
  try {
    const result = await MlkitOcr.recognizeText(uri, entry.model as DetectorType);
    if (!result || result.blocks.length === 0) return { text: '', blocks: [] };

    const blocks: OcrBlock[] = result.blocks.map((block) => ({
      text: block.text,
      bounding: { left: block.frame.x, top: block.frame.y, width: block.frame.width, height: block.frame.height },
      lines: block.lines.map((line) => ({
        text: line.text,
        bounding: { left: line.frame.x, top: line.frame.y, width: line.frame.width, height: line.frame.height },
        // Word boxes (§5 T1), for selecting and highlighting single words. A wrapper version
        // without `elements` just gives none.
        words: (line.elements ?? []).map((word) => ({
          text: word.text,
          bounding: { left: word.frame.x, top: word.frame.y, width: word.frame.width, height: word.frame.height },
        })),
      })),
    }));

    return { text: result.text, blocks };
  } catch (error) {
    console.warn('OCR failed', error);
    return undefined;
  }
}
