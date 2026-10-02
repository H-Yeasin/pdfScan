import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NameField } from '../components/deliver/NameField';
import { PagePickerModal } from '../components/study/PagePickerModal';
import { useOpenDocument } from '../components/library/useDocumentListActions';
import { useRouter } from '../navigation/router';
import { hasPageMasters } from '../services/documents/formatCapabilities';
import { buildExamPack, defaultPackTitle } from '../services/study/buildExamPack';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme, touchSlop } from '../theme';
import { useT } from '../i18n/useT';
import { rotationStyle } from '../utils/rotation';
import { EmptyState } from '../components/shared/EmptyState';

// §5 T6: the exam-pack tray: the picked pages in order (move up/down, remove), "Add pages" from
// the course's documents, a title and options, and Build, which makes a new searchable,
// annotated document in the course.
export function ExamPackScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go, previousScreen } = useRouter();
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

  const option = (key: 'contents' | 'includeAnnotations' | 'pageNumbers', title: string, subtitle: string) => (
    <View style={styles.optionRow}>
      <View style={styles.flex}>
        <Text style={[styles.optionTitle, { color: tokens.ink }]}>{title}</Text>
        <Text style={[styles.meta, { color: tokens.muted }]}>{subtitle}</Text>
      </View>
      <Switch
        value={pack[key]}
        onValueChange={(value) => dispatch({ type: 'pack/SET_OPTION', option: key, value })}
        trackColor={{ true: tokens.accent, false: tokens.surface2 }}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={() => go(previousScreen ?? 'course', 'back')} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('study.pack.title')}</Text>
        {rows.length ? (
          <Pressable onPress={() => dispatch({ type: 'pack/CLEAR' })} accessibilityRole="button" hitSlop={8} style={styles.clear}>
            <Text style={[styles.link, { color: tokens.muted }]}>{t('study.pack.clear')}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <NameField label={t('study.pack.titleField')} value={pack.title} onChange={(title) => dispatch({ type: 'pack/SET_TITLE', title })} placeholder={placeholderTitle} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>
              {t('study.pack.pages', { count: rows.length })}
            </Text>
            <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.link, { color: tokens.accentInk }]}>{t('study.pack.addPages')}</Text>
            </Pressable>
          </View>
          {rows.length === 0 ? (
            <EmptyState
              variant="inline"
              title={t('study.pack.emptyTitle')}
              body={t('study.pack.emptyHint')}
              action={{ label: t('study.addPages'), onPress: () => setPickerOpen(true) }}
            />
          ) : null}
          {rows.map((row, i) => (
            <View key={`${row.item.documentId}:${row.item.pageId}`} style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
              <View style={[styles.thumb, { backgroundColor: tokens.surface2 }]}>
                {row.page ? <Image source={{ uri: row.page.thumbUri ?? row.page.fileUri }} style={[styles.thumbImage, rotationStyle(row.page.rotation)]} resizeMode="cover" /> : null}
              </View>
              <Text style={[styles.rowText, { color: row.doc ? tokens.ink : tokens.muted }]} numberOfLines={2}>
                {row.doc && row.idx >= 0 ? t('study.pack.rowLabel', { name: row.doc.name, page: row.idx + 1 }) : t('study.pack.missing')}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'pack/MOVE', from: i, to: i - 1 })} disabled={i === 0} accessibilityState={{ disabled: i === 0 }} hitSlop={6} accessibilityLabel={t('study.pack.moveUp')}>
                <Ionicons name="arrow-up" size={18} color={i === 0 ? tokens.edge : tokens.ink} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'pack/MOVE', from: i, to: i + 1 })} disabled={i === rows.length - 1} accessibilityState={{ disabled: i === rows.length - 1 }} hitSlop={6} accessibilityLabel={t('study.pack.moveDown')}>
                <Ionicons name="arrow-down" size={18} color={i === rows.length - 1 ? tokens.edge : tokens.ink} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'pack/REMOVE', index: i })} hitSlop={6} accessibilityLabel={t('study.pack.remove')}>
                <Ionicons name="close" size={18} color={tokens.muted} />
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          {option('contents', t('study.pack.contents'), t('study.pack.contentsHint'))}
          {option('includeAnnotations', t('study.pack.annotations'), t('study.pack.annotationsHint'))}
          {option('pageNumbers', t('study.pack.pageNumbers'), t('study.pack.pageNumbersHint'))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: tokens.bg, borderTopColor: tokens.edge }]}>
        {progress ? <Text style={[styles.meta, styles.center, { color: tokens.muted }]}>{progress}</Text> : null}
        <Pressable
          style={[styles.build, { backgroundColor: tokens.accent, opacity: rows.length && !building ? 1 : 0.5 }]}
          onPress={build}
          disabled={!rows.length || building}
          accessibilityRole="button"
        >
          {building ? <ActivityIndicator color="#fff" /> : <Text style={styles.buildLabel}>{t('study.pack.build')}</Text>}
        </Pressable>
      </View>

      <PagePickerModal
        visible={pickerOpen}
        docs={pickable}
        already={pack.items}
        onAdd={(items) => dispatch({ type: 'pack/ADD', items })}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize,
  },
  clear: {
    paddingHorizontal: spacing.md,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  link: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
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
  rowText: {
    flex: 1,
    fontSize: 14,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
  },
  meta: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  center: {
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  build: {
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
