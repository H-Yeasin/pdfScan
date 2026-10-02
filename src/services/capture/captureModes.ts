import type { Ionicons } from '@expo/vector-icons';
import type { TKey } from '../../i18n';
import type { CaptureMode, EnhanceMode } from '../../types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Single source of truth for what each capture mode means. The mode is picked on our Capture
// screen *before* Google's scanner opens (we can't change the scanner's own UI), so every
// mode-specific behaviour hangs off this table: scanner options, our post-processing, the
// default filter, and the document type used for naming.
export type CaptureModeSpec = {
  id: CaptureMode;
  // Catalog keys (§6 L4): the mode's name, and the hint shown under it on the Capture screen.
  labelKey: TKey;
  icon: IoniconName;
  hintKey: TKey;
  // Filter every new page starts with, unless the user has set their own for this mode
  // (settingsSlice.defaultEnhanceFor).
  defaultEnhance: EnhanceMode;
  // Max pages per scanner session (maxNumDocuments).
  pageLimit: number;
  // What happens to pages after ingest: Book splits two-page spreads (C3), ID card composes
  // front + back onto one page (C4).
  postProcess: 'none' | 'splitSpread' | 'idCard';
  docType: 'notes' | 'document' | 'board' | 'book' | 'id';
};

// Display order of the picker.
export const CAPTURE_MODES: readonly CaptureModeSpec[] = [
  {
    id: 'notes',
    labelKey: 'capture.modes.notes.label',
    icon: 'create-outline',
    hintKey: 'capture.modes.notes.hint',
    defaultEnhance: 'ink',
    pageLimit: 50,
    postProcess: 'none',
    docType: 'notes',
  },
  {
    id: 'doc',
    labelKey: 'capture.modes.doc.label',
    icon: 'document-text-outline',
    hintKey: 'capture.modes.doc.hint',
    defaultEnhance: 'auto',
    pageLimit: 50,
    postProcess: 'none',
    docType: 'document',
  },
  {
    id: 'board',
    labelKey: 'capture.modes.board.label',
    icon: 'easel-outline',
    hintKey: 'capture.modes.board.hint',
    defaultEnhance: 'board',
    pageLimit: 20,
    postProcess: 'none',
    docType: 'board',
  },
  {
    id: 'book',
    labelKey: 'capture.modes.book.label',
    icon: 'book-outline',
    hintKey: 'capture.modes.book.hint',
    defaultEnhance: 'auto',
    pageLimit: 50,
    postProcess: 'splitSpread',
    docType: 'book',
  },
  {
    id: 'id',
    labelKey: 'capture.modes.id.label',
    icon: 'card-outline',
    hintKey: 'capture.modes.id.hint',
    defaultEnhance: 'color',
    pageLimit: 2,
    postProcess: 'idCard',
    docType: 'id',
  },
];

export const DEFAULT_CAPTURE_MODE: CaptureMode = 'doc';

const BY_ID = new Map(CAPTURE_MODES.map((spec) => [spec.id, spec]));

// Unknown ids (e.g. a corrupted setting) fall back to Document rather than crashing capture.
export function getCaptureModeSpec(mode: CaptureMode | string | undefined): CaptureModeSpec {
  return BY_ID.get(mode as CaptureMode) ?? BY_ID.get(DEFAULT_CAPTURE_MODE)!;
}

export function isCaptureMode(value: unknown): value is CaptureMode {
  return typeof value === 'string' && BY_ID.has(value as CaptureMode);
}

// The neighbouring mode for swipe navigation; stays put at either end.
export function adjacentCaptureMode(mode: CaptureMode, step: 1 | -1): CaptureMode {
  const index = CAPTURE_MODES.findIndex((spec) => spec.id === mode);
  const next = CAPTURE_MODES[Math.min(CAPTURE_MODES.length - 1, Math.max(0, index + step))];
  return next.id;
}
