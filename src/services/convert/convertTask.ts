import { t } from '../../i18n';
import type { DocFormat } from '../../types/models';
import { canConvertToPdf } from '../documents/formatCapabilities';
import { registerProTaskRunner, type ProTaskParams } from '../pro/proTask';
import { resolveOcrScript } from '../scripts/registry';
import type { AppState } from '../../store/appReducer';
import { convertToWord, type WordSource } from './toDocx';
import { convertToPdf, type ConvertSource } from './toPdf';

// §12 D5: Office → PDF as a Pro task (D1). The Reader runs it with its own progress
// (components/reader/useConvertToPdf); if Android kills the app during the ad, the task is
// finished at the next start from these params alone. The source is a file the app owns (a
// library document's file, or the copy of an outside file in external-open/), so it's still there.

export const OFFICE_TO_PDF_KIND = 'officeToPdf';

export function convertParams(source: ConvertSource): ProTaskParams {
  return { uri: source.uri, name: source.name, format: source.format };
}

export function sourceFromParams(params: ProTaskParams): ConvertSource | null {
  const { uri, name, format } = params;
  if (typeof uri !== 'string' || !uri || typeof name !== 'string' || typeof format !== 'string') return null;
  if (!canConvertToPdf(format as DocFormat)) return null;
  return { uri, name, format: format as DocFormat };
}

// Imported at start by components/pro/ProTaskResumeHost, so the runner is there before a pending
// task is looked at.
registerProTaskRunner(OFFICE_TO_PDF_KIND, async (task, { store }) => {
  const source = sourceFromParams(task.params);
  if (!source) return;
  const doc = await convertToPdf(source);
  store.dispatch({ type: 'library/ADD_FILE', file: doc });
  store.dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.convert.doneInLibrary', { name: doc.name }) });
});

// §12 D6: scan/PDF → Word as a Pro task. A library document is looked up again by id at the
// restart (its pages may have changed, or it may be gone); a PDF opened from outside is its
// app-owned copy (external-open/), named as it was shown.
export const PDF_TO_WORD_KIND = 'pdfToWord';

export type WordTarget = { docId: string } | { uri: string; name: string };

export function wordParams(target: WordTarget): ProTaskParams {
  return 'docId' in target ? { docId: target.docId } : { uri: target.uri, name: target.name };
}

// The source to convert, with the OCR script for pages that have no text yet: the document's
// course decides it, like it did when the page was scanned (§6 L1), else the app setting.
export function wordSourceFor(target: WordTarget, state: Pick<AppState, 'library' | 'settings'>): WordSource | null {
  if ('docId' in target) {
    const doc = state.library.files.find((d) => d.id === target.docId);
    if (!doc) return null;
    const course = state.library.courses.find((c) => c.id === doc.courseId);
    return { kind: 'library', doc, script: resolveOcrScript({ course, settings: state.settings }) };
  }
  return { kind: 'pdfFile', uri: target.uri, name: target.name, script: resolveOcrScript({ settings: state.settings }) };
}

export function wordTargetFromParams(params: ProTaskParams): WordTarget | null {
  const { docId, uri, name } = params;
  if (typeof docId === 'string' && docId) return { docId };
  if (typeof uri === 'string' && uri && typeof name === 'string') return { uri, name };
  return null;
}

registerProTaskRunner(PDF_TO_WORD_KIND, async (task, { store }) => {
  const target = wordTargetFromParams(task.params);
  const source = target && wordSourceFor(target, store.getState());
  if (!source) return;
  const doc = await convertToWord(source);
  store.dispatch({ type: 'library/ADD_FILE', file: doc });
  store.dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.word.doneInLibrary', { name: doc.name }) });
});
