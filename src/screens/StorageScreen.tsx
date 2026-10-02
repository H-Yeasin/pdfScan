import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { compressDocuments, useOpenDocument } from '../components/library/useDocumentListActions';
import { SettingRow } from '../components/settings/SettingRow';
import { formatBytes } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { courseColorValue } from '../services/courses/palette';
import { canUsePageTools } from '../services/documents/formatCapabilities';
import { cleanCaches, storageReport, type StorageReport } from '../services/storage/usage';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';

const BIGGEST_COUNT = 10;

// §8 B1: where the space goes - per course (in course colours), temporary files with "Clear",
// what's left on the phone, and the biggest documents with "Open" and "Compress".
export function StorageScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { files, courses, annotations } = state.library;
  const openDocument = useOpenDocument();
  const sessionActive = state.capture.pages.length > 0;
  const [report, setReport] = useState<StorageReport | null>(null);
  const [compressingId, setCompressingId] = useState<string | null>(null);

  // Measured again whenever the documents change (a compress, a delete); sizes still valid come
  // from the database's cache, so only changed documents are measured.
  useEffect(() => {
    let cancelled = false;
    storageReport(files)
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((error) => console.warn('Storage report failed', error));
    return () => {
      cancelled = true;
    };
  }, [files]);

  const handleClear = useCallback(() => {
    const freed = cleanCaches({ sessionActive });
    dispatch({
      type: 'ui/SHOW_SNACK',
      msg: sessionActive
        ? `${t('settings.storage.cleared', { size: formatBytes(freed) })} ${t('settings.storage.sessionKept')}`
        : t('settings.storage.cleared', { size: formatBytes(freed) }),
    });
    storageReport(files).then(setReport, (error) => console.warn('Storage report failed', error));
  }, [dispatch, files, sessionActive, t]);

  const handleCompress = useCallback(
    async (id: string) => {
      const doc = files.find((f) => f.id === id);
      if (!doc || compressingId) return;
      setCompressingId(id);
      try {
        const msg = await compressDocuments([doc], annotations, dispatch);
        dispatch({ type: 'ui/SHOW_SNACK', msg });
      } catch (error) {
        console.warn('StorageScreen: compress failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.toolFailed') });
      } finally {
        setCompressingId(null);
      }
    },
    [files, annotations, compressingId, dispatch, t]
  );

  const courseRows = useMemo(
    () =>
      (report?.byCourse ?? []).map((usage) => {
        const course = usage.courseId ? courses.find((c) => c.id === usage.courseId) : undefined;
        return {
          key: usage.courseId ?? 'unsorted',
          name: course?.name ?? t('common.unsorted'),
          color: course ? courseColorValue(course.color, tokens) : tokens.muted,
          bytes: usage.bytes,
          documents: usage.documents,
        };
      }),
    [report, courses, tokens, t]
  );

  const biggest = useMemo(
    () =>
      (report?.documents ?? [])
        .slice(0, BIGGEST_COUNT)
        .map((usage) => ({ usage, doc: files.find((f) => f.id === usage.id) }))
        .filter((row): row is { usage: typeof row.usage; doc: NonNullable<typeof row.doc> } => !!row.doc && row.usage.bytes > 0),
    [report, files]
  );

  const barTotal = courseRows.reduce((sum, row) => sum + row.bytes, 0) + (report?.otherLibraryBytes ?? 0) + (report?.cacheBytes ?? 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('settings.storage.title')}</Text>
      </View>

      {!report ? (
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.accent} />
          <Text style={{ color: tokens.muted }}>{t('settings.storage.measuring')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.section}>
            <Text style={[styles.total, { color: tokens.ink }]}>{t('settings.storage.total', { size: formatBytes(report.totalBytes) })}</Text>
            <View style={[styles.bar, { backgroundColor: tokens.surface2 }]}>
              {barTotal > 0
                ? [
                    ...courseRows.map((row) => ({ key: row.key, bytes: row.bytes, color: row.color })),
                    { key: 'other', bytes: report.otherLibraryBytes + report.cacheBytes, color: tokens.edge },
                  ]
                    .filter((segment) => segment.bytes > 0)
                    .map((segment) => <View key={segment.key} style={{ flex: segment.bytes / barTotal, backgroundColor: segment.color }} />)
                : null}
            </View>
          </View>

          {courseRows.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.storage.byCourse')}</Text>
              <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
                {courseRows.map((row) => (
                  <View key={row.key} style={[styles.listRow, { borderColor: tokens.edge }]}>
                    <View style={[styles.dot, { backgroundColor: row.color }]} />
                    <View style={styles.listText}>
                      <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={[styles.listMeta, { color: tokens.muted }]}>
                        {t('settings.storage.docCount', { count: row.documents })}
                      </Text>
                    </View>
                    <Text style={[styles.listSize, { color: tokens.muted }]}>{formatBytes(row.bytes)}</Text>
                  </View>
                ))}
                {report.otherLibraryBytes > 0 && (
                  <View style={[styles.listRow, { borderColor: tokens.edge }]}>
                    <View style={[styles.dot, { backgroundColor: tokens.edge }]} />
                    <Text style={[styles.listTitle, styles.listText, { color: tokens.ink }]}>{t('settings.storage.other')}</Text>
                    <Text style={[styles.listSize, { color: tokens.muted }]}>{formatBytes(report.otherLibraryBytes)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={[styles.cacheRow, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
              <View style={styles.listText}>
                <Text style={[styles.listTitle, { color: tokens.ink }]}>{t('settings.storage.caches')}</Text>
                <Text style={[styles.listMeta, { color: tokens.muted }]}>{t('settings.storage.cachesSubtitle')}</Text>
              </View>
              <Text style={[styles.listSize, { color: tokens.muted }]}>{formatBytes(report.cacheBytes)}</Text>
              <Pressable
                onPress={handleClear}
                style={[styles.pill, { borderColor: tokens.edge }]}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={[styles.pillText, { color: tokens.accent }]}>{t('settings.storage.clear')}</Text>
              </Pressable>
            </View>
            <SettingRow
              title={t('settings.storage.freeSpace')}
              trailing={report.freeBytes === null ? t('settings.storage.unknown') : formatBytes(report.freeBytes)}
            />
          </View>

          {biggest.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.storage.biggest')}</Text>
              <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
                {biggest.map(({ usage, doc }) => (
                  <View key={doc.id} style={[styles.listRow, { borderColor: tokens.edge }]}>
                    <View style={styles.listText}>
                      <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <Text style={[styles.listMeta, { color: tokens.muted }]}>{formatBytes(usage.bytes)}</Text>
                    </View>
                    <Pressable onPress={() => openDocument(doc)} style={[styles.pill, { borderColor: tokens.edge }]} hitSlop={6}>
                      <Text style={[styles.pillText, { color: tokens.ink }]}>{t('settings.storage.open')}</Text>
                    </Pressable>
                    {canUsePageTools(doc) && !doc.missingFiles ? (
                      <Pressable
                        onPress={() => handleCompress(doc.id)}
                        disabled={compressingId !== null}
                        style={[styles.pill, { borderColor: tokens.edge, opacity: compressingId && compressingId !== doc.id ? 0.5 : 1 }]}
                        hitSlop={6}
                      >
                        <Text style={[styles.pillText, { color: tokens.accent }]}>
                          {compressingId === doc.id ? t('settings.storage.compressing') : t('settings.storage.compress')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          )}

          {Platform.OS === 'android' && (
            <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.storage.androidBackupNote')}</Text>
          )}
        </ScrollView>
      )}
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
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize + 4,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  total: {
    fontFamily: fontFamily.heading,
    fontSize: 20,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cacheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  listText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  listMeta: {
    fontSize: 12.5,
  },
  listSize: {
    fontSize: 13,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
