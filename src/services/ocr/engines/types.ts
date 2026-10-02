import type { OcrEngineId, ScriptEntry } from '../../scripts/registry';
import type { PageOcr } from '../../../types/models';

export type { OcrEngineId } from '../../scripts/registry';

// One on-device recognizer (§6 L2). The registry entry says which engine a script uses and which
// of that engine's models; ocrService.runOcr is the only caller, and keeps OCR best-effort around
// it, so an engine is free to throw.
export type OcrEngine = {
  id: OcrEngineId;
  // Is the script's model on this phone? ML Kit's are bundled with the app; Tesseract's will be
  // downloaded packs (L6), so this is what tells "not downloaded" apart from "OCR failed".
  isAvailable(script: ScriptEntry): Promise<boolean>;
  // Throws on failure. An empty page gives { text: '', blocks: [] }.
  recognize(uri: string, script: ScriptEntry): Promise<PageOcr>;
};
