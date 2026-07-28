import MlkitOcr from 'react-native-mlkit-ocr';
import type { OcrBlock, PageOcr } from '../../types/models';

// react-native-mlkit-ocr wraps Google ML Kit's on-device text recognizer, which only
// supports Latin-script text. Callers should treat a failed/empty result as "no text
// found" rather than a hard error — OCR is a best-effort enhancement, not load-bearing.
export async function runOcr(uri: string): Promise<PageOcr | undefined> {
  try {
    const result = await MlkitOcr.detectFromUri(uri);
    if (!result || result.length === 0) return { text: '', blocks: [] };

    const blocks: OcrBlock[] = result.map((block) => ({
      text: block.text,
      bounding: block.bounding,
      lines: block.lines.map((line) => ({ text: line.text, bounding: line.bounding })),
    }));

    return { text: blocks.map((b) => b.text).join('\n'), blocks };
  } catch (error) {
    console.warn('OCR failed', error);
    return undefined;
  }
}
