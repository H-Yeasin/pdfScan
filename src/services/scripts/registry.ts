import type { OcrScript } from '../../types/models';

// Every writing system the app knows about, in one place. Settings lists the 'ready' ones; adding a
// script later means adding an entry here (plus its OCR engine/model), not touching screens.
// The PDF text layer needs nothing per script: the glyphless font (pdf/textLayer.ts) carries any
// BMP text.
export type ScriptStatus = 'ready' | 'planned';

export type ScriptEntry = {
  id: OcrScript;
  label: string;
  // Which on-device recognizer model handles it (rn-mlkit-ocr's model names today).
  ocrModel: OcrScript;
  status: ScriptStatus;
};

export const SCRIPTS: ScriptEntry[] = [
  { id: 'latin', label: 'English / Western (Latin)', ocrModel: 'latin', status: 'ready' },
  { id: 'devanagari', label: 'Hindi · Marathi · Nepali (Devanagari)', ocrModel: 'devanagari', status: 'ready' },
  { id: 'chinese', label: 'Chinese', ocrModel: 'chinese', status: 'ready' },
  { id: 'japanese', label: 'Japanese', ocrModel: 'japanese', status: 'ready' },
  { id: 'korean', label: 'Korean', ocrModel: 'korean', status: 'ready' },
  // Bengali needs a second OCR engine (ML Kit has no Bengali model) - planned for §6:
  // { id: 'bengali', label: 'Bangla (Bengali)', ocrModel: 'tesseract:ben', status: 'planned' },
];

export const READY_SCRIPTS = SCRIPTS.filter((s) => s.status === 'ready');
