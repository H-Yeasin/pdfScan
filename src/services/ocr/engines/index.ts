import type { OcrEngineId } from '../../scripts/registry';
import { mlkitEngine } from './mlkit';
import type { OcrEngine } from './types';

// Engine id (a registry entry's `engine`) → implementation. Tesseract (§6 L5) isn't built yet; its
// only script (Bangla) is 'planned', so nothing asks for it, and an engine missing here reads as
// "not supported" in runOcr rather than a crash.
const engines = new Map<OcrEngineId, OcrEngine>([[mlkitEngine.id, mlkitEngine]]);

export function getEngine(id: OcrEngineId): OcrEngine | undefined {
  return engines.get(id);
}

// Test hook, like registry.registerScript: plugs in an engine (the fake one in
// src/test/fakeScript.ts, or a stand-in for a real one) and returns the undo, which puts back
// whatever was registered under that id before.
export function registerEngine(engine: OcrEngine): () => void {
  const previous = engines.get(engine.id);
  engines.set(engine.id, engine);
  return () => {
    if (previous) engines.set(engine.id, previous);
    else engines.delete(engine.id);
  };
}
