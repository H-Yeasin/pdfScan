// Every writing system the app knows about, in one place. Settings lists the 'ready' ones (and the
// 'planned' ones as "coming soon"), the course editor offers the 'ready' ones, and OCR looks the
// model up here. Adding a script later means adding an entry here (plus its OCR engine/model), not
// touching screens. The PDF text layer needs nothing per script: the glyphless font
// (pdf/textLayer.ts) carries any BMP text.
//
import type { TKey } from '../../i18n';

// No imports from types/models.ts: that file re-exports OcrScript from here, so the dependency
// only goes one way.
export type ScriptStatus = 'ready' | 'planned';
export type OcrEngineId = 'mlkit' | 'tesseract';

type ScriptDefinition = {
  id: string;
  // Catalog key of its name in the UI language, with the languages it covers when the script
  // name alone wouldn't say (§6 L4).
  labelKey: TKey;
  // The name in its own script, shown first so a student finds their language at a glance.
  nativeName: string;
  // Which on-device recognizer handles it, and that engine's model name (rn-mlkit-ocr's detector
  // types for ML Kit; a traineddata name such as 'ben' for Tesseract).
  engine: OcrEngineId;
  model: string;
  // 'planned' entries are shown as "coming soon" and never offered for OCR.
  status: ScriptStatus;
  // A few words in the script, shown in Settings so the student can recognise it.
  sampleText: string;
  // Only 'ltr' is supported. The field exists so a future RTL script (Arabic, Urdu) has to be an
  // explicit decision - its PDF text, OCR line order and UI all need work - not an accident.
  direction: 'ltr';
};

export const SCRIPTS = [
  {
    id: 'latin',
    labelKey: 'settings.scripts.latin',
    nativeName: 'English',
    engine: 'mlkit',
    model: 'latin',
    status: 'ready',
    sampleText: 'Aa Bb Éé Ññ',
    direction: 'ltr',
  },
  {
    id: 'devanagari',
    labelKey: 'settings.scripts.devanagari',
    nativeName: 'हिन्दी',
    engine: 'mlkit',
    model: 'devanagari',
    status: 'ready',
    sampleText: 'देवनागरी लिपि',
    direction: 'ltr',
  },
  {
    id: 'chinese',
    labelKey: 'settings.scripts.chinese',
    nativeName: '中文',
    engine: 'mlkit',
    model: 'chinese',
    status: 'ready',
    sampleText: '汉字 漢字',
    direction: 'ltr',
  },
  {
    id: 'japanese',
    labelKey: 'settings.scripts.japanese',
    nativeName: '日本語',
    engine: 'mlkit',
    model: 'japanese',
    status: 'ready',
    sampleText: 'ひらがな カタカナ',
    direction: 'ltr',
  },
  {
    id: 'korean',
    labelKey: 'settings.scripts.korean',
    nativeName: '한국어',
    engine: 'mlkit',
    model: 'korean',
    status: 'ready',
    sampleText: '한글',
    direction: 'ltr',
  },
  // ML Kit has no Bengali model, so Bangla waits for the Tesseract engine (§6 L5) and its
  // downloadable pack (L6). Until then it is listed, never offered.
  {
    id: 'bengali',
    labelKey: 'settings.scripts.bengali',
    nativeName: 'বাংলা',
    engine: 'tesseract',
    model: 'ben',
    status: 'planned',
    sampleText: 'বাংলা লিপি',
    direction: 'ltr',
  },
] as const satisfies readonly ScriptDefinition[];

export type OcrScript = (typeof SCRIPTS)[number]['id'];
export type ScriptEntry = ScriptDefinition & { id: OcrScript };

// The app's default when nothing else applies (fresh install, or a stored value that is no longer
// a ready script).
export const DEFAULT_OCR_SCRIPT: OcrScript = 'latin';

// The lists the app reads. They start as SCRIPTS and only ever change through registerScript
// (tests), so screens, OCR and parsing all see one registry.
const allScripts: ScriptEntry[] = [...SCRIPTS];
const readyScripts: ScriptEntry[] = allScripts.filter((s) => s.status === 'ready');
const plannedScripts: ScriptEntry[] = allScripts.filter((s) => s.status === 'planned');

export const READY_SCRIPTS: readonly ScriptEntry[] = readyScripts;
export const PLANNED_SCRIPTS: readonly ScriptEntry[] = plannedScripts;

export function getScript(id: string | null | undefined): ScriptEntry | undefined {
  return allScripts.find((s) => s.id === id);
}

// Test hook (§6 L2): adds an entry as if it were written in SCRIPTS above, so the fake-script test
// (src/test/fakeScript.ts) can prove a new script needs nothing outside the registry and its
// engine. Returns the undo. Not for app code: a real script goes in SCRIPTS, which also gives it
// its OcrScript id.
export function registerScript(entry: ScriptEntry): () => void {
  if (getScript(entry.id)) throw new Error(`Script '${entry.id}' is already registered`);
  const lists = [allScripts, entry.status === 'ready' ? readyScripts : plannedScripts];
  for (const list of lists) list.push(entry);
  return () => {
    for (const list of lists) list.splice(list.indexOf(entry), 1);
  };
}

// Narrows an untrusted value (a database column, stored settings) to a known script id. Planned
// ids are kept: a course set to one by a newer build should still say so, and resolveOcrScript
// won't use it until it is ready.
export function parseOcrScript(value: unknown): OcrScript | undefined {
  return typeof value === 'string' ? getScript(value)?.id : undefined;
}

export function isReadyScript(id: string | null | undefined): id is OcrScript {
  return getScript(id)?.status === 'ready';
}

// The one place that decides which script a page is recognised with: the course's own choice if it
// has one, otherwise the app setting, and never a script that isn't ready (a planned one, or one
// a later build removed), falling back to the default. Everything that runs OCR for a scan or a
// saved document calls this instead of reading settings.ocrScript.
export function resolveOcrScript({
  course,
  settings,
}: {
  course?: { ocrScript?: OcrScript } | null;
  settings: { ocrScript: OcrScript };
}): OcrScript {
  if (isReadyScript(course?.ocrScript)) return course.ocrScript;
  if (isReadyScript(settings.ocrScript)) return settings.ocrScript;
  return DEFAULT_OCR_SCRIPT;
}
