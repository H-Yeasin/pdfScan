import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FileCover } from '../components/library/FileRow';
import { useOpenDocument } from '../components/library/useDocumentListActions';
import { BottomBar } from '../components/shared/BottomBar';
import { Button, ListItem, ScreenHeader, Text } from '../components/ui';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { startScan } from '../services/courses/startScan';
import { isPageRasterFormat } from '../services/documents/formatCapabilities';
import { useAppDispatch, useAppSelector, useAppStore } from '../store/AppStateContext';
import { useSubmitDocument } from '../store/useSubmitDocument';
import { ICONS, radii, spacing, useTheme } from '../theme';
import type { LibraryDocument } from '../types/models';
import { formatBytes } from '../utils/format';

const MARK = 72;

// §17 U9: the last step of Scan → Save → Done. What happened ("Saved to {course}", and anything
// else worth knowing: the size limit, the device copy) with the new file's card, and what comes
// next: Open · Share · Submit (unless it was just submitted) · Scan more. Back or Done returns to
// where the scan was started (navStack: Done took Review's and Save's place on the stack). U4's
// SuccessBurst takes the tick's place when it is built.
export function DoneScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { back } = useRouter();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const done = useAppSelector((s) => s.deliver.done);
  const files = useAppSelector((s) => s.library.files);
  const courses = useAppSelector((s) => s.library.courses);
  const openDocument = useOpenDocument();
  const submit = useSubmitDocument();
  // Undefined after the save's Undo (the snack), or once the document is deleted elsewhere.
  const doc = useMemo(() => (done ? files.find((f) => f.id === done.docId) : undefined), [done, files]);
  const courseName = useMemo(() => courses.find((c) => c.id === doc?.courseId)?.name ?? t('common.unsorted'), [courses, doc?.courseId, t]);

  const share = useCallback(
    async (target: LibraryDocument) => {
      const { shareDocument } = require('../services/sharing/shareService') as typeof import('../services/sharing/shareService');
      try {
        await shareDocument(target, store.getState().library.annotations.filter((a) => a.documentId === target.id));
      } catch (error) {
        console.warn('DoneScreen: share failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.toolFailed') });
      }
    },
    [store, dispatch, t]
  );

  // Another scan for the same course, from where this one was started.
  const scanMore = useCallback(() => {
    back();
    startScan(store.getState(), dispatch, doc?.courseId ?? null, { launch: true });
  }, [back, store, dispatch, doc?.courseId]);

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader title={t('deliver.done.title')} back={back} backIcon={ICONS.close} backLabel={t('deliver.done.done')} />
      <ScrollView contentContainerStyle={styles.body}>
        {doc ? (
          <>
            <View style={styles.head} accessibilityLiveRegion="polite">
              <View style={[styles.mark, { backgroundColor: tokens.successSoft }]}>
                <Ionicons name={ICONS.done} size={36} color={tokens.success} />
              </View>
              <Text variant="headline" align="center" accessibilityRole="header">
                {t('deliver.done.title')}
              </Text>
              <Text color="muted" align="center">
                {done?.submitted ? t('deliver.done.submitted', { course: courseName }) : t('deliver.done.savedTo', { course: courseName })}
              </Text>
              {done?.notice ? (
                <Text variant="caption" color="muted" align="center">
                  {done.notice}
                </Text>
              ) : null}
            </View>
            <View style={[styles.card, { backgroundColor: tokens.surface2 }]}>
              <ListItem
                title={doc.name}
                subtitle={`${isPageRasterFormat(doc.format) ? t('library.pages', { count: doc.pages.length }) : doc.format} · ${formatBytes(doc.sizeBytes)}`}
                leading={<FileCover doc={doc} />}
                onPress={() => openDocument(doc)}
                testID="done-file"
              />
            </View>
          </>
        ) : (
          <Text color="muted" align="center" style={styles.gone}>
            {t('deliver.done.gone')}
          </Text>
        )}
      </ScrollView>

      <BottomBar backgroundColor={tokens.bg}>
        <View style={styles.actions}>
          {doc ? (
            <>
              <Button label={t('deliver.done.open')} icon={ICONS.open} onPress={() => openDocument(doc)} fullWidth testID="done-open" />
              <View style={styles.row}>
                <Button label={t('deliver.done.share')} icon={ICONS.share} variant="tonal" onPress={() => void share(doc)} style={styles.flex} />
                {done?.submitted ? null : (
                  <Button label={t('deliver.done.submit')} icon={ICONS.submit} variant="tonal" onPress={() => void submit(doc)} style={styles.flex} testID="done-submit" />
                )}
              </View>
              <View style={styles.row}>
                <Button label={t('deliver.done.scanMore')} icon={ICONS.scan} variant="outline" onPress={scanMore} style={styles.flex} />
                <Button label={t('deliver.done.done')} variant="ghost" onPress={back} style={styles.flex} testID="done-done" />
              </View>
            </>
          ) : (
            <Button label={t('deliver.done.done')} onPress={back} fullWidth />
          )}
        </View>
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: spacing.xl },
  head: { alignItems: 'center', gap: spacing.sm },
  mark: { width: MARK, height: MARK, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radii.card, overflow: 'hidden' },
  gone: { marginTop: spacing.xl },
  actions: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
