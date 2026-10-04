import { useCallback, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useProTask } from '../pro/useProTask';
import { convertParams, OFFICE_TO_PDF_KIND } from '../../services/convert/convertTask';
import { convertToPdf, type ConvertSource } from '../../services/convert/toPdf';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { useAppDispatch } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';
import { radii, spacing, useTheme } from '../../theme';

// Formats whose PDF keeps the content but not the layout (mammoth's HTML has no page setup,
// headers or fonts; a sheet keeps its values, not its styles, merged cells or charts). The plan's
// rule: say what's lost before saving, never after. TXT and CSV lose nothing.
const LOSSY: ReadonlySet<string> = new Set(['DOCX', 'XLSX', 'XLS']);

// §12 D5: the Reader's "Convert to PDF", through D1's gate (one rewarded ad per conversion; none
// with a Pro pass). The original stays as it is; the PDF is a new library document, offered with
// "Open" when it's ready. Render `element` once in the screen.
//
// `docId`: the library document, or for a file from outside its app-owned copy's uri (what the
// once grant is tied to, so a failed conversion can be retried without another ad).
export function useConvertToPdf(opts: { preload: boolean }) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const gate = useProTask('convert', { preload: opts.preload });
  const { start: startTask } = gate;
  const [converting, setConverting] = useState(false);

  const run = useCallback(
    async (source: ConvertSource) => {
      setConverting(true);
      try {
        const doc = await convertToPdf(source);
        dispatch({ type: 'library/ADD_FILE', file: doc });
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: t('reader.convert.done'),
          action: t('reader.convert.open'),
          onAction: () => dispatch({ type: 'reader/SET_READER_ID', id: doc.id }),
        });
      } catch (e) {
        console.warn('useConvertToPdf: conversion failed', e);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t(e instanceof PreviewTooLargeError ? 'reader.convert.tooLarge' : 'reader.convert.failed') });
        // Rethrown so the gate keeps the once grant: trying again doesn't cost another ad.
        throw e;
      } finally {
        setConverting(false);
      }
    },
    [dispatch, t]
  );

  const begin = useCallback(
    (source: ConvertSource & { docId: string }) => {
      const { docId, ...file } = source;
      startTask({ kind: OFFICE_TO_PDF_KIND, docId, title: file.name, params: convertParams(file), run: () => run(file) })
        // Already reported by `run`.
        .catch(() => undefined);
    },
    [startTask, run]
  );

  const start = useCallback(
    (source: ConvertSource & { docId: string }) => {
      if (!LOSSY.has(source.format)) {
        begin(source);
        return;
      }
      Alert.alert(t('reader.convert.title'), t(source.format === 'DOCX' ? 'reader.convert.lossDocx' : 'reader.convert.lossSheet'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('reader.convert.confirm'), onPress: () => begin(source) },
      ]);
    },
    [begin, t]
  );

  const element: ReactElement = (
    <>
      {gate.element}
      {converting ? <Converting label={t('reader.convert.progress')} /> : null}
    </>
  );

  return { start, element, busy: converting || gate.loadingAd };
}

// A plain view over the Reader, not a Modal: the snack and the next screen come up as usual.
// Also D6's (useConvertToWord).
export function Converting({ label }: { label: string }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityLiveRegion="polite">
      <View style={[styles.card, { backgroundColor: tokens.surface }]}>
        <ActivityIndicator color={tokens.accent} />
        <Text style={[styles.label, { color: tokens.ink }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.card,
  },
  label: {
    fontSize: 15,
  },
});
