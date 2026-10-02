import appJson from '../../../../app.json';
import {
  DEFAULT_OCR_SCRIPT,
  PLANNED_SCRIPTS,
  READY_SCRIPTS,
  SCRIPTS,
  isReadyScript,
  parseOcrScript,
  resolveOcrScript,
} from '../registry';

describe('script registry', () => {
  it('never offers a planned script for OCR', () => {
    expect(READY_SCRIPTS.every((s) => s.status === 'ready')).toBe(true);
    expect(READY_SCRIPTS.map((s) => s.id)).not.toContain('bengali');
    expect(PLANNED_SCRIPTS.map((s) => s.id)).toEqual(['bengali']);
    expect(isReadyScript('bengali')).toBe(false);
  });

  it('has unique ids and only left-to-right scripts', () => {
    expect(new Set(SCRIPTS.map((s) => s.id)).size).toBe(SCRIPTS.length);
    expect(SCRIPTS.every((s) => s.direction === 'ltr')).toBe(true);
  });

  it("bundles exactly the ready ML Kit models in app.json (rn-mlkit-ocr's ocrModels)", () => {
    const plugins = appJson.expo.plugins as unknown[];
    const plugin = plugins.find((p) => Array.isArray(p) && p[0] === 'rn-mlkit-ocr') as [string, { ocrModels: string[] }];
    expect(plugin).toBeDefined();
    const bundled = [...plugin[1].ocrModels].sort();
    const ready = READY_SCRIPTS.filter((s) => s.engine === 'mlkit')
      .map((s) => s.model)
      .sort();
    expect(bundled).toEqual(ready);
  });

  it('parseOcrScript keeps known ids (planned too) and drops anything else', () => {
    expect(parseOcrScript('korean')).toBe('korean');
    expect(parseOcrScript('bengali')).toBe('bengali');
    expect(parseOcrScript('klingon')).toBeUndefined();
    expect(parseOcrScript(null)).toBeUndefined();
    expect(parseOcrScript(3)).toBeUndefined();
  });
});

describe('resolveOcrScript', () => {
  const settings = { ocrScript: 'devanagari' as const };

  it("uses the course's own script when it has one", () => {
    expect(resolveOcrScript({ course: { ocrScript: 'chinese' }, settings })).toBe('chinese');
  });

  it('falls back to the app setting without a course or a course script', () => {
    expect(resolveOcrScript({ settings })).toBe('devanagari');
    expect(resolveOcrScript({ course: null, settings })).toBe('devanagari');
    expect(resolveOcrScript({ course: {}, settings })).toBe('devanagari');
  });

  it('never resolves to a planned script', () => {
    expect(resolveOcrScript({ course: { ocrScript: 'bengali' }, settings })).toBe('devanagari');
    expect(resolveOcrScript({ settings: { ocrScript: 'bengali' } })).toBe(DEFAULT_OCR_SCRIPT);
  });

  it('ignores an unknown stored setting', () => {
    expect(resolveOcrScript({ settings: { ocrScript: 'klingon' as never } })).toBe(DEFAULT_OCR_SCRIPT);
  });
});
