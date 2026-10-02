import { registerEngine } from '../services/ocr/engines';
import type { OcrEngine } from '../services/ocr/engines/types';
import { registerScript, type OcrEngineId, type ScriptEntry } from '../services/scripts/registry';
import type { OcrScript, PageOcr } from '../types/models';
import type { TKey } from '../i18n';

// §6 "done when": a new script touches only the registry plus one file for its engine. This is
// that branch, as a test fixture - a registry entry (what would be added to SCRIPTS) and an engine
// (what would be engines/<id>.ts) - plugged in through the test hooks, so tests can drive OCR
// dispatch, the Settings list and the PDF text layer with a script no code knows about. Cherokee
// letters stand in for its text: BMP, outside WinAnsi, and in no ML Kit model.
export const FAKE_SCRIPT_ID = 'fake' as OcrScript;
export const FAKE_ENGINE_ID = 'fake' as OcrEngineId;
export const FAKE_TEXT = ['ᏣᎳᎩ ᎦᏬᏂᎯᏍᏗ', 'ᎠᏍᎦᏯ'];

export const fakeScript: ScriptEntry = {
  id: FAKE_SCRIPT_ID,
  // Not in the catalog: t() shows the key, which is fine for a test script.
  labelKey: 'settings.scripts.fake' as TKey,
  nativeName: 'ᏣᎳᎩ',
  engine: FAKE_ENGINE_ID,
  model: 'fake-model',
  status: 'ready',
  sampleText: 'ᎠᏍᎦᏯ',
  direction: 'ltr',
};

// Every line of FAKE_TEXT, one block each, stacked down a 1000 x 1400 page.
export function fakeOcr(lines: string[] = FAKE_TEXT): PageOcr {
  return {
    text: lines.join('\n'),
    blocks: lines.map((text, i) => {
      const bounding = { left: 100, top: 100 + i * 150, width: 600, height: 60 };
      return { text, bounding, lines: [{ text, bounding, words: [] }] };
    }),
  };
}

export type FakeEngine = OcrEngine & {
  recognize: jest.Mock<Promise<PageOcr>, [string, ScriptEntry]>;
  isAvailable: jest.Mock<Promise<boolean>, [ScriptEntry]>;
};

export function makeFakeEngine(): FakeEngine {
  return {
    id: FAKE_ENGINE_ID,
    isAvailable: jest.fn(async (_script: ScriptEntry) => true),
    recognize: jest.fn(async (_uri: string, _script: ScriptEntry) => fakeOcr()),
  };
}

// Registers the fake script and engine; call the returned function (e.g. in afterEach) to undo.
export function installFakeScript(engine: FakeEngine = makeFakeEngine()): { engine: FakeEngine; uninstall: () => void } {
  const undoScript = registerScript(fakeScript);
  const undoEngine = registerEngine(engine);
  return {
    engine,
    uninstall: () => {
      undoEngine();
      undoScript();
    },
  };
}
