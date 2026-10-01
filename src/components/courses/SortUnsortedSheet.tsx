import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDocType, docTypeOf } from '../../services/courses/docTypes';
import { courseColorValue } from '../../services/courses/palette';
import { suggestCourses } from '../../services/courses/suggestCourse';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { formatRelativeDate } from '../../utils/format';

// §3 K6: files Unsorted documents one at a time. Each shows its first page and the active
// courses, best guess first (suggestCourses, as if it were scanned at the time it was made, so a
// timetable puts the right lecture first); one tap files it and moves on, Skip leaves it.
export function SortUnsortedSheet({ visible, docs, onClose }: { visible: boolean; docs: readonly LibraryDocument[]; onClose: () => void }) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppState();
  const { courses, timetable, files } = state.library;
  // The queue is fixed when the sheet opens, so filing one doesn't reshuffle the rest.
  const [queue, setQueue] = useState<LibraryDocument[]>([]);
  const [index, setIndex] = useState(0);
  const [filed, setFiled] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setQueue([...docs]);
    setIndex(0);
    setFiled(0);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const doc = queue[index];
  const ranked = useMemo(() => {
    if (!doc) return [];
    const ids = suggestCourses({ now: new Date(doc.createdAt), mode: doc.mode, courses, timetable, history: files });
    return ids.map((id) => courses.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  }, [doc, courses, timetable, files]);

  const next = () => setIndex((i) => i + 1);
  const done = !doc;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: tokens.bg, paddingBottom: insets.bottom + spacing.lg }]}>
        {done ? (
          <View style={styles.doneBox}>
            <Text style={[styles.title, { color: tokens.ink }]}>All sorted</Text>
            <Text style={[styles.meta, { color: tokens.muted }]}>
              Filed {filed} of {queue.length}. Anything you skipped stays in Unsorted.
            </Text>
            <Pressable style={[styles.primary, { backgroundColor: tokens.accent }]} onPress={onClose} accessibilityRole="button">
              <Text style={styles.primaryLabel}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: tokens.ink }]}>Sort Unsorted</Text>
              <Text style={[styles.meta, { color: tokens.muted }]}>
                {index + 1} of {queue.length}
              </Text>
            </View>
            <View style={styles.docRow}>
              <View style={[styles.thumb, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
                {doc.pages[0] ? (
                  <Image source={{ uri: doc.pages[0].thumbUri ?? doc.pages[0].fileUri }} style={styles.thumbImage} resizeMode="cover" />
                ) : null}
              </View>
              <View style={styles.docText}>
                <Text style={[styles.docName, { color: tokens.ink }]} numberOfLines={2}>
                  {doc.name}
                </Text>
                <Text style={[styles.meta, { color: tokens.muted }]}>
                  {getDocType(docTypeOf(doc)).label} · {formatRelativeDate(doc.createdAt)}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.chips}>
              {ranked.map((course) => (
                <Pressable
                  key={course.id}
                  style={[styles.chip, { borderColor: tokens.edge, backgroundColor: tokens.surface }]}
                  onPress={() => {
                    dispatch({ type: 'library/ASSIGN_COURSE', ids: [doc.id], courseId: course.id });
                    setFiled((n) => n + 1);
                    next();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`File under ${course.name}`}
                >
                  <View style={[styles.dot, { backgroundColor: courseColorValue(course.color, tokens) }]} />
                  <Text style={[styles.chipLabel, { color: tokens.ink }]}>{course.code ? `${course.code} · ${course.name}` : course.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.actions}>
              <Pressable style={styles.ghost} onPress={onClose} accessibilityRole="button">
                <Text style={[styles.ghostLabel, { color: tokens.muted }]}>Stop</Text>
              </Pressable>
              <Pressable style={styles.ghost} onPress={next} accessibilityRole="button">
                <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>Skip</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.4)',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
  },
  docRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  thumb: {
    width: 64,
    height: 84,
    borderRadius: radii.thumb,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  docText: {
    flex: 1,
    gap: 4,
  },
  docName: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  chips: {
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chipLabel: {
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ghost: {
    height: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  doneBox: {
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  primary: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
