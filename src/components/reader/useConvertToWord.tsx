import { useCallback, useState, type ReactElement } from 'react';
import { Alert } from 'react-native';
import { useProTask } from '../pro/useProTask';
import { Converting } from './useConvertToPdf';
import { PDF_TO_WORD_KIND, wordParams, wordSourceFor, type WordTarget } from '../../services/convert/convertTask';
import { convertToWord, type WordProgress } from '../../services/convert/toDocx';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';

// §12 D6: the Reader's "Convert to Word" for scans and PDFs, through D1's gate (one rewarded ad per
// conversion; none with a Pro pass). What's lost is said first, before the ad, so nobody watches
// an ad and then cancels. The DOCX is a new library document, offered with "Open" when it's ready;
// the scan or PDF stays as it is. Render `element` once in the screen.
//
// `docId` (the once grant's key): the library document, or for a PDF from outside its app-owned
// copy's uri, like D5.
export function useConvertToWord(opts: { preload: boolean }) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const gate = useProTask('convert', { preload: opts.preload });
  const { start: startTask } = gate;
  const [progress, setProgress] = useState<WordProgress | null>(null);

  const run = useCallback(
    async (target: WordTarget) => {
      const source = wordSourceFor(target, state);
      if (!source) return;
      setProgress({ done: 0, total: 0 });
      try {
        const doc = await convertToWord(source, setProgress);
        dispatch({ type: 'library/ADD_FILE', file: doc });
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: t('reader.word.done'),
          action: t('reader.convert.open'),
          onAction: () => dispatch({ type: 'reader/SET_READER_ID', id: doc.id }),
        });
      } catch (e) {
        console.warn('useConvertToWord: conversion failed', e);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.word.failed') });
        // Rethrown so the gate keeps the once grant: trying again doesn't cost another ad.
        throw e;
      } finally {
        setProgress(null);
      }
    },
    [dispatch, state, t]
  );

  const start = useCallback(
    (target: WordTarget & { title: string; grantId: string }) => {
      const { title, grantId, ...rest } = target;
      const begin = () =>
        startTask({ kind: PDF_TO_WORD_KIND, docId: grantId, title, params: wordParams(rest), run: () => run(rest) })
          // Already reported by `run`.
          .catch(() => undefined);
      Alert.alert(t('reader.word.title'), t('reader.word.loss'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('reader.convert.confirm'), onPress: begin },
      ]);
    },
    [startTask, run, t]
  );

  const label = progress && progress.total > 1 ? t('reader.word.progressPages', { page: progress.done + 1, count: progress.total }) : t('reader.word.progress');
  const element: ReactElement = (
    <>
      {gate.element}
      {progress ? <Converting label={label} /> : null}
    </>
  );

  return { start, element, busy: !!progress || gate.loadingAd };
}
