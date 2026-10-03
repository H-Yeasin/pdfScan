import { useCallback, useState, type ReactElement } from 'react';
import { Alert } from 'react-native';
import { useProTask } from '../pro/useProTask';
import { Converting } from './useConvertToPdf';
import { FormFillSheet, type FormFillRequest } from './FormFillSheet';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { formSourceFor, PdfFormLockedError, readPdfForm, saveFilledForm, type FormTarget, type FormValues } from '../../services/edit/pdfForm';
import { carryProTaskGrant, checkProTask } from '../../services/pro/proTaskFlow';
import { useAppDispatch } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';
import type { LibraryDocument } from '../../types/models';

// Pro task kinds for opening the form and for unlocking Mark mode's Text tool. Like D7's
// `editFile`, no restart runner: the session the ad unlocked is saved on the reward, so after a
// restart tapping either again opens it without another ad.
export const FILL_FORM_KIND = 'fillForm';
export const ADD_TEXT_KIND = 'addText';

// The grant's id: the library document, or an outside file's app-owned copy (as D5's).
function grantIdOf(target: FormTarget): string {
  return target.doc ? target.doc.id : target.external.uri;
}

// §12 D10: Fill in form and the Text tool, both `pdfForms` through D1's gate (one ad unlocks the
// document for `edit_unlock_minutes`). The form is read **before** the gate, so nobody watches an
// ad for a PDF with nothing to fill in. The filled form is a new library document; the Reader
// switches to it, and the session goes with it. Render `element` once.
export function useFillForm(opts: { preload: boolean }) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const gate = useProTask('pdfForms', { preload: opts.preload });
  const { start: startTask } = gate;
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<{ target: FormTarget; form: FormFillRequest } | null>(null);

  const start = useCallback(
    async (target: FormTarget) => {
      const source = formSourceFor(target);
      if (!source) return;
      setChecking(true);
      let fields;
      try {
        fields = await readPdfForm(source.uri);
      } catch (e) {
        console.warn('useFillForm: could not read the form', e);
        const msg = e instanceof PdfFormLockedError ? 'reader.form.locked' : e instanceof PreviewTooLargeError ? 'reader.form.tooLarge' : 'reader.form.readFailed';
        dispatch({ type: 'ui/SHOW_SNACK', msg: t(msg) });
        return;
      } finally {
        setChecking(false);
      }
      if (fields.length === 0) {
        Alert.alert(t('reader.form.noFieldsTitle'), t('reader.form.noFieldsBody'));
        return;
      }
      const form = { name: source.name, fields };
      await startTask({ kind: FILL_FORM_KIND, docId: grantIdOf(target), title: source.name, run: () => setOpen({ target, form }) }).catch((e: unknown) =>
        console.warn('useFillForm: could not open the form', e)
      );
    },
    [startTask, dispatch, t]
  );

  const save = useCallback(
    async (values: FormValues, saveOpts: { flatten: boolean }): Promise<boolean> => {
      if (!open) return false;
      try {
        const copy = await saveFilledForm(open.target, values, saveOpts);
        dispatch({ type: 'library/ADD_FILE', file: copy });
        await carryProTaskGrant('pdfForms', grantIdOf(open.target), copy.id);
        dispatch({ type: 'reader/SET_READER_ID', id: copy.id });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.form.saved') });
        setOpen(null);
        return true;
      } catch (e) {
        console.warn('useFillForm: saving failed', e);
        // An Alert, not a snack: the sheet is still open, over the snack.
        Alert.alert(t('reader.editFile.failedTitle'), t('reader.form.failed'));
        return false;
      }
    },
    [open, dispatch, t]
  );

  // Mark mode's Text tool on `doc`: `onUnlocked` runs once the gate lets it through (straight
  // away with Pro or a live session).
  const unlockText = useCallback(
    (doc: LibraryDocument, onUnlocked: () => void) => {
      startTask({ kind: ADD_TEXT_KIND, docId: doc.id, title: doc.name, run: onUnlocked }).catch((e: unknown) =>
        console.warn('useFillForm: could not unlock the Text tool', e)
      );
    },
    [startTask]
  );

  // Whether the Text tool is already open on `doc` (Pro, a live session, or ads off), without
  // asking: Mark mode can then open with a remembered Text tool.
  const isTextUnlocked = useCallback(async (doc: LibraryDocument) => (await checkProTask({ feature: 'pdfForms', docId: doc.id }, Date.now())) === 'run', []);

  const element: ReactElement = (
    <>
      {gate.element}
      {checking ? <Converting label={t('reader.form.checking')} /> : null}
      <FormFillSheet form={open?.form ?? null} onSave={save} onClose={() => setOpen(null)} />
    </>
  );

  return { start, unlockText, isTextUnlocked, element, busy: checking || gate.loadingAd };
}
