import { useCallback, useState, type ReactElement } from 'react';
import { Alert } from 'react-native';
import { useProTask } from '../pro/useProTask';
import { isEditFormat, saveEditedText, type EditTarget } from '../../services/edit/textEdit';
import { isSheetEditFormat, saveEditedSheet } from '../../services/edit/sheetEdit';
import { saveEditedDocx } from '../../services/edit/docxEdit';
import { carryProTaskGrant } from '../../services/pro/proTaskFlow';
import { useAppDispatch } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';
import { FileEditor, type EditorFile, type EditorOutput } from './FileEditor';

// The Pro task kind for opening the editor. No restart runner is registered for it: there's
// nothing to finish without the screen, and the session the ad unlocked is saved on the reward,
// so after a restart tapping Edit opens the editor without another ad.
export const EDIT_FILE_KIND = 'editFile';

// §12 D7: the Reader's Edit for TXT and CSV, through D1's gate. One ad unlocks editing this
// document for `edit_unlock_minutes`; saving inside that never shows one, and an editor that's
// open when the session ends still saves. A library document's file is swapped for the edited
// one; a file from outside is saved into the library as a new document (the file the student
// opened is never written) and the Reader switches to it. §12 D8: an XLSX or XLS file's edit is
// always a new library document ("<name> (edited)"), and the Reader switches to that copy; the
// session carries to it, so further edits there don't ask again. §12 D9: a Word file's edit too.
// Render `element` once.
export function useEditFile(opts: { preload: boolean }) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const gate = useProTask('editFiles', { preload: opts.preload });
  const { start: startTask } = gate;
  const [editing, setEditing] = useState<{ target: EditTarget; file: EditorFile } | null>(null);

  const start = useCallback(
    (target: EditTarget) => {
      const source = target.doc ? { uri: target.doc.contentUri, name: target.doc.name, format: target.doc.format } : target.external;
      if (!source.uri || !(isEditFormat(source.format) || isSheetEditFormat(source.format) || source.format === 'DOCX')) return;
      const file: EditorFile = { uri: source.uri, name: source.name, format: source.format, external: !!target.external };
      // The grant's id: the library document, or an outside file's app-owned copy (as D5's).
      const docId = target.doc ? target.doc.id : target.external.uri;
      startTask({ kind: EDIT_FILE_KIND, docId, title: file.name, run: () => setEditing({ target, file }) }).catch((e: unknown) =>
        console.warn('useEditFile: could not open the editor', e)
      );
    },
    [startTask]
  );

  const save = useCallback(
    async (output: EditorOutput): Promise<boolean> => {
      if (!editing) return false;
      const { target, file } = editing;
      try {
        if (output.kind === 'sheet' || output.kind === 'docx') {
          const copy = output.kind === 'sheet' ? await saveEditedSheet(target, output.edits) : await saveEditedDocx(target, output.html, output.images);
          dispatch({ type: 'library/ADD_FILE', file: copy });
          await carryProTaskGrant('editFiles', target.doc ? target.doc.id : target.external.uri, copy.id);
          dispatch({ type: 'reader/SET_READER_ID', id: copy.id });
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.editFile.savedCopy') });
          setEditing(null);
          return true;
        }
        if (!isEditFormat(file.format)) return false;
        const result = await saveEditedText(target, file.format, output.text);
        if (result.kind === 'updated') {
          dispatch({ type: 'library/UPDATE_FILE', id: result.id, patch: result.patch });
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.editFile.saved') });
        } else {
          dispatch({ type: 'library/ADD_FILE', file: result.doc });
          if (target.external) await carryProTaskGrant('editFiles', target.external.uri, result.doc.id);
          dispatch({ type: 'reader/SET_READER_ID', id: result.doc.id });
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.editFile.savedToLibrary') });
        }
        setEditing(null);
        return true;
      } catch (e) {
        console.warn('useEditFile: saving failed', e);
        // An Alert, not a snack: the editor is still open, over the snack.
        Alert.alert(t('reader.editFile.failedTitle'), t('reader.editFile.failed'));
        return false;
      }
    },
    [editing, dispatch, t]
  );

  const element: ReactElement = (
    <>
      {gate.element}
      <FileEditor file={editing?.file ?? null} onSave={save} onClose={() => setEditing(null)} />
    </>
  );

  // `open`: the editor is on screen (it is laid out for an upright phone; §18 W19).
  return { start, element, busy: gate.loadingAd, open: editing !== null };
}
