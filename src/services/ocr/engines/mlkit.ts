import MlkitOcr, { type DetectorType } from 'rn-mlkit-ocr';
import type { OcrBlock } from '../../../types/models';
import type { OcrEngine } from './types';

// rn-mlkit-ocr wraps Google ML Kit's on-device text recognizer: one model per script (Latin,
// Chinese, Devanagari, Japanese, Korean), named by the registry entry's `model`. This is the only
// file that imports it.
export const mlkitEngine: OcrEngine = {
  id: 'mlkit',
  // The models are bundled into the app at build time (app.json's rn-mlkit-ocr `ocrModels`, with
  // `ocrUseBundled`), and a test keeps that list equal to the registry's ready ML Kit entries, so
  // a ready ML Kit script always has its model.
  isAvailable: async () => true,
  recognize: async (uri, script) => {
    const result = await MlkitOcr.recognizeText(uri, script.model as DetectorType);
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
  },
};
