import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NameField } from '../components/deliver/NameField';
import { PagePickerModal } from '../components/study/PagePickerModal';
import { confirmClearPack } from '../components/study/confirmClearPack';
import { useOpenDocument } from '../components/library/useDocumentListActions';
import { Button, Card, Divider, IconButton, ListItem, ScreenHeader, Text } from '../components/ui';
import { useRouter } from '../navigation/router';
import { hasPageMasters } from '../services/documents/formatCapabilities';
import { buildExamPack, defaultPackTitle } from '../services/study/buildExamPack';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { ICONS, radii, spacing, useTheme } from '../theme';
import { useT } from '../i18n/useT';
import { PageThumb } from '../components/shared/PageThumb';
import { EmptyState } from '../components/shared/EmptyState';

type PackOption = 'contents' | 'includeAnnotations' | 'pageNumbers';

// §5 T6: the exam-pack tray: the picked pages in order (move up/down, remove), "Add pages" from
// the course's documents, a title and options, and Build, which makes a new searchable,
// annotated document in the course. §17 U11: on the kit; Clear asks first.
export function ExamPackScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { back } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('deliver', 'library', 'pack');
  const openDocument = useOpenDocument();
  const { pack } = state;
  const { files, courses, annotations } = state.library;
  const course = courses.find((c) => c.id === pack.courseId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const placeholderTitle = defaultPackTitle(course?.code || course?.name, new Date());
  const rows = useMemo(
    () =>
      pack.items.map((item) => {
        const doc = files.find((d) => d.id === item.documentId);
        const idx = doc ? doc.pages.findIndex((p) => p.id === item.pageId) : -1;
        return { item, doc, idx, page: doc && idx >= 0 ? doc.pages[idx] : undefined };
      }),
    [pack.items, files]
  );
  const pickable = useMemo(
    () => files.filter((d) => (d.courseId ?? null) === pack.courseId && !d.archived && hasPageMasters(d)),
    [files, pack.courseId]
  );

  const build = async () => {
    if (building || rows.length === 0) return;
    setBuilding(true);
    try {
      const { doc, annotations: copied } = await buildExamPack(pack.items, files, annotations, {
        title: pack.title.trim() || placeholderTitle,
        subtitle: [course?.code || course?.name, new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })]
          .filter(Boolean)
          .join(' · '),
        courseId: pack.courseId,
        contents: pack.contents,
        includeAnnotations: pack.includeAnnotations,
        pageNumbers: pack.pageNumbers,
        pageSize: state.deliver.pageSize,
        onProgress: setProgress,
      });
      dispatch({ type: 'library/ADD_FILE', file: doc });
      for (const annotation of copied) dispatch({ type: 'library/ADD_ANNOTATION', annotation });
      dispatch({ type: 'pack/CLEAR' });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('study.pack.built', { name: doc.name, count: doc.pages.length }) });
      openDocument(doc);
    } catch (error) {
      console.warn('ExamPackScreen: build failed', error);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('study.pack.buildFailed') });
    } finally {
      setBuilding(false);
      setProgress(null);
    }
  };

  const option = (key: PackOption, title: string, subtitle: string) => (
    <ListItem
      title={title}
      subtitle={subtitle}
      switchValue={pack[key]}
      onValueChange={(value) => dispatch({ type: 'pack/SET_OPTION', option: key, value })}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader
        title={t('study.pack.title')}
        back={back}
        trailing={
          rows.length ? (
            <Button
              size="sm"
              variant="ghost"
              label={t('study.pack.clear')}
              onPress={() => confirmClearPack(rows.length, () => dispatch({ type: 'pack/CLEAR' }))}
              testID="pack-clear"
            />
          ) : null
        }
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <NameField label={t('study.pack.titleField')} value={pack.title} onChange={(title) => dispatch({ type: 'pack/SET_TITLE', title })} placeholder={placeholderTitle} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="overline" color="muted" accessibilityRole="header" style={styles.flex}>
              {t('study.pack.pages', { count: rows.length })}
            </Text>
            {rows.length ? <Button size="sm" variant="ghost" icon={ICONS.addPage} label={t('study.addPages')} onPress={() => setPickerOpen(true)} /> : null}
          </View>
          {rows.length === 0 ? (
            <EmptyState
              variant="inline"
              title={t('study.pack.emptyTitle')}
              body={t('study.pack.emptyHint')}
              action={{ label: t('study.addPages'), onPress: () => setPickerOpen(true) }}
            />
          ) : (
            <Card padded={false} style={Platform.OS === 'android' && styles.clip}>
              {rows.map((row, i) => {
                const first = i === 0;
                const last = i === rows.length - 1;
                const label =
                  row.doc && row.idx >= 0 ? t('study.pack.rowLabel', { name: row.doc.name, page: row.idx + 1 }) : t('study.pack.missing');
                return (
                  <View key={`${row.item.documentId}:${row.item.pageId}`}>
                    {first ? null : <Divider inset="text" />}
                    <ListItem
                      title={label}
                      titleLines={2}
                      disabled={!row.doc}
                      leading={
                        <View style={[styles.thumb, { backgroundColor: tokens.surface2 }]}>
                          {row.page ? <PageThumb documentId={row.item.documentId} page={row.page} style={styles.thumbImage} /> : null}
                        </View>
                      }
                      onPress={
                        row.doc && row.page
                          ? () => {
                              openDocument(row.doc!);
                              dispatch({ type: 'reader/SET_TARGET', target: { pageId: row.item.pageId } });
                            }
                          : undefined
                      }
                      trailing={
                        <View style={styles.rowActions}>
                          <IconButton
                            size="sm"
                            icon="arrow-up"
                            accessibilityLabel={t('study.pack.moveUp')}
                            disabled={first}
                            onPress={() => dispatch({ type: 'pack/MOVE', from: i, to: i - 1 })}
                          />
                          <IconButton
                            size="sm"
                            icon="arrow-down"
                            accessibilityLabel={t('study.pack.moveDown')}
                            disabled={last}
                            onPress={() => dispatch({ type: 'pack/MOVE', from: i, to: i + 1 })}
                          />
                          <IconButton size="sm" icon={ICONS.close} accessibilityLabel={t('study.pack.remove')} onPress={() => dispatch({ type: 'pack/REMOVE', index: i })} />
                        </View>
                      }
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        <Card padded={false} style={Platform.OS === 'android' && styles.clip}>
          {option('contents', t('study.pack.contents'), t('study.pack.contentsHint'))}
          <Divider inset="text" />
          {option('includeAnnotations', t('study.pack.annotations'), t('study.pack.annotationsHint'))}
          <Divider inset="text" />
          {option('pageNumbers', t('study.pack.pageNumbers'), t('study.pack.pageNumbersHint'))}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: tokens.bg, borderTopColor: tokens.edge, paddingBottom: spacing.lg + insets.bottom }]}>
        {progress ? (
          <Text variant="caption" color="muted" align="center" accessibilityLiveRegion="polite">
            {progress}
          </Text>
        ) : null}
        <Button label={t('study.pack.build')} onPress={() => void build()} disabled={!rows.length} loading={building} fullWidth testID="pack-build" />
      </View>

      <PagePickerModal
        visible={pickerOpen}
        docs={pickable}
        already={pack.items}
        onAdd={(items) => dispatch({ type: 'pack/ADD', items })}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  // The first and last rows' ripple stays inside the corners. Android only, as in Card: on iOS the
  // clip would cut the shadow.
  clip: {
    overflow: 'hidden',
  },
  thumb: {
    width: 36,
    height: 48,
    borderRadius: radii.thumb,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
