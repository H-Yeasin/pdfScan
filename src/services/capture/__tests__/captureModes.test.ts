import { t } from '../../../i18n';
import type { CaptureMode } from '../../../types/models';
import { captureReducer, initialCaptureState } from '../../../store/slices/captureSlice';
import { initialSettingsState, settingsReducer } from '../../../store/slices/settingsSlice';
import {
  CAPTURE_MODES,
  adjacentCaptureMode,
  getCaptureModeSpec,
  isCaptureMode,
} from '../captureModes';

// Compile-time: adding a CaptureMode without listing it here fails the typecheck, and the
// runtime check below then fails until the registry has a spec for it.
const ALL_MODES: Record<CaptureMode, true> = { notes: true, doc: true, board: true, book: true, id: true };

describe('capture mode registry', () => {
  it('has exactly one spec per CaptureMode', () => {
    const ids = CAPTURE_MODES.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ALL_MODES).sort());
  });

  it('matches the planned table, in picker order', () => {
    expect(
      CAPTURE_MODES.map((s) => [t(s.labelKey), s.defaultEnhance, s.pageLimit, s.postProcess, s.docType])
    ).toEqual([
      ['Notes', 'ink', 50, 'none', 'notes'],
      ['Document', 'auto', 50, 'none', 'document'],
      ['Board', 'board', 20, 'none', 'board'],
      ['Book', 'auto', 50, 'splitSpread', 'book'],
      ['ID card', 'color', 2, 'idCard', 'id'],
    ]);
    CAPTURE_MODES.forEach((spec) => expect(t(spec.hintKey).length).toBeGreaterThan(0));
  });

  it('falls back to Document for unknown ids', () => {
    expect(getCaptureModeSpec('nope').id).toBe('doc');
    expect(getCaptureModeSpec(undefined).id).toBe('doc');
    expect(isCaptureMode('board')).toBe(true);
    expect(isCaptureMode('scan')).toBe(false);
    expect(isCaptureMode(3)).toBe(false);
  });

  it('steps to neighbouring modes and stops at the ends', () => {
    expect(adjacentCaptureMode('notes', 1)).toBe('doc');
    expect(adjacentCaptureMode('doc', -1)).toBe('notes');
    expect(adjacentCaptureMode('notes', -1)).toBe('notes');
    expect(adjacentCaptureMode('id', 1)).toBe('id');
  });
});

describe('mode reducers', () => {
  it('capture/SET_MODE sets the session mode', () => {
    const state = captureReducer(initialCaptureState, { type: 'capture/SET_MODE', mode: 'notes' });
    expect(state.mode).toBe('notes');
  });

  it('settings remembers the last mode and when settings have loaded', () => {
    let state = settingsReducer(initialSettingsState, { type: 'settings/SET_LAST_CAPTURE_MODE', mode: 'board' });
    expect(state.lastCaptureMode).toBe('board');
    expect(state.loaded).toBe(false);
    state = settingsReducer(state, { type: 'settings/SET_LOADED' });
    expect(state.loaded).toBe(true);
  });
});
