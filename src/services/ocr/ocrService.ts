import { getScript } from '../scripts/registry';
import type { OcrScript, PageOcr } from '../../types/models';
import { getEngine } from './engines';

// Why a page has no OCR. 'model-missing': the script's engine is fine but its model isn't on the
// phone (a language pack not downloaded yet, §6 L6), so the UI can offer the download instead of
// saying "OCR failed". 'unsupported': no ready script or no engine for it. 'error': the engine
// threw.
export type OcrFailureReason = 'model-missing' | 'unsupported' | 'error';
export type OcrOutcome = { ocr: PageOcr; ocrFailed?: undefined } | { ocr?: undefined; ocrFailed: true; reason: OcrFailureReason };

// Looks the script up in the registry and hands the page to its engine (§6 L2). Never throws:
// OCR is a best-effort enhancement, not load-bearing.
export async function recognizePage(uri: string, script: OcrScript): Promise<OcrOutcome> {
  // Callers pass a resolveOcrScript result, which is always a ready script; a planned one (Bangla
  // until its engine is built) is refused here rather than reaching an engine without it.
  const entry = getScript(script);
  const engine = entry?.status === 'ready' ? getEngine(entry.engine) : undefined;
  if (!entry || !engine) return { ocrFailed: true, reason: 'unsupported' };
  try {
    if (!(await engine.isAvailable(entry))) return { ocrFailed: true, reason: 'model-missing' };
    return { ocr: await engine.recognize(uri, entry) };
  } catch (error) {
    console.warn('OCR failed', error);
    return { ocrFailed: true, reason: 'error' };
  }
}

// What every caller uses today: the page's text and boxes, or undefined for "no OCR" (they store
// that as ocrFailed). An empty page is { text: '', blocks: [] }, not a failure.
export async function runOcr(uri: string, script: OcrScript): Promise<PageOcr | undefined> {
  return (await recognizePage(uri, script)).ocr;
}
