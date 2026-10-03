import { t } from '../../i18n';
import type { DocFormat } from '../../types/models';
import { canConvertToPdf } from '../documents/formatCapabilities';
import { registerProTaskRunner, type ProTaskParams } from '../pro/proTask';
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
