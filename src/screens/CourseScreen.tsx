import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CourseBadge } from '../components/courses/CourseBadge';
import { CourseEditorSheet } from '../components/courses/CourseEditorSheet';
import { DocTypeFilterChips } from '../components/courses/DocTypeChips';
import { UNSORTED_COURSE_ID } from '../components/courses/CourseList';
import { EmptyState } from '../components/library/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { SelectionBar } from '../components/library/SelectionBar';
import { useDocumentListActions, useOpenDocument } from '../components/library/useDocumentListActions';
import { SubmissionList } from '../components/submit/SubmissionList';
import { DeadlineList } from '../components/deadlines/DeadlineList';
import { DeadlineEditorSheet } from '../components/deadlines/DeadlineEditorSheet';
import type { Deadline } from '../types/models';
import { useShareSubmission } from '../store/useSubmitDocument';
import { useRouter } from '../navigation/router';
import { docTypeOf } from '../services/courses/docTypes';
import { startScan } from '../services/courses/startScan';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';
import type { DocType } from '../types/models';

// One course's page: its header and its documents, newest first. Opened from Home's course grid
// and Library's Courses tab (state.library.activeCourseId says which). Scanning from here files
// the scan into this course (startScan preselects it in Deliver). Type chips filter the list (K4).
export function CourseScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { go, tabHub } = useRouter();
  const { state, dispatch } = useAppState();
  const { files, courses, activeCourseId, selection, selMode } = state.library;
  const { selectedDocs, handlePressRow, handleLongPress, handleSelectionTool, overlays } = useDocumentListActions();
  const [editing, setEditing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocType | null>(null);

  const isUnsorted = activeCourseId === UNSORTED_COURSE_ID;
  const course = isUnsorted ? undefined : courses.find((c) => c.id === activeCourseId);
  const docs = useMemo(
    () => files.filter((f) => (isUnsorted ? !f.courseId : f.courseId === activeCourseId)),
    [files, isUnsorted, activeCourseId]
  );
  // §4 S7: what was handed in for this course (or Unsorted), newest first.
  const submissions = useMemo(
    () => state.library.submissions.filter((s) => (isUnsorted ? !s.courseId : s.courseId === activeCourseId)),
    [state.library.submissions, isUnsorted, activeCourseId]
  );
  const shareSubmission = useShareSubmission();
  // §4 S8: this course's open deadlines; a tapped reminder highlights one.
  const { highlightDeadlineId } = state.library;
  const deadlines = useMemo(
    () => (course ? state.library.deadlines.filter((d) => d.courseId === course.id && !d.doneSubmissionId) : []),
    [course, state.library.deadlines]
  );
  const [deadlineEditor, setDeadlineEditor] = useState<{ deadline?: Deadline } | null>(null);
  const now = Date.now();
  const openDocument = useOpenDocument();
  const shownDocs = useMemo(
    () => (typeFilter ? docs.filter((d) => docTypeOf(d) === typeFilter) : docs),
    [docs, typeFilter]
  );

  const goBack = () => {
    dispatch({ type: 'library/CLEAR_SELECTION' });
    if (highlightDeadlineId) dispatch({ type: 'library/SET_HIGHLIGHT_DEADLINE', id: null });
    go(tabHub, 'back');
  };

  const handleScan = () => {
    startScan(state, dispatch, course?.id ?? null, { launch: true });
    go('capture');
  };

  const subtitle = course
    ? [course.code, course.teacher, course.archived ? 'Archived' : undefined].filter(Boolean).join(' · ')
    : 'Documents not filed under a course';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      {selMode ? (
        <View style={styles.header}>
          <Pressable
            style={[styles.iconButton, { backgroundColor: tokens.surface2, borderRadius: 22 }]}
            onPress={() => dispatch({ type: 'library/CLEAR_SELECTION' })}
            accessibilityLabel="Clear selection"
          >
            <Ionicons name="close" size={20} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.selectionTitle, { color: tokens.ink }]}>{selection.length} selected</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={goBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={tokens.ink} />
          </Pressable>
          {course ? <CourseBadge course={course} size={40} /> : null}
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {course?.name ?? 'Unsorted'}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: tokens.muted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {course ? (
            <Pressable style={styles.iconButton} onPress={() => setEditing(true)} accessibilityLabel="Edit course">
              <Ionicons name="create-outline" size={21} color={tokens.ink} />
            </Pressable>
          ) : null}
        </View>
      )}

      {course && !selMode ? (
        <View style={styles.deadlines}>
          <View style={styles.deadlinesHeader}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Deadlines</Text>
            <Pressable onPress={() => setDeadlineEditor({})} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.addLink, { color: tokens.accentInk }]}>+ Add deadline</Text>
            </Pressable>
          </View>
          {deadlines.length > 0 ? (
            <DeadlineList
              deadlines={deadlines}
              now={now}
              highlightId={highlightDeadlineId}
              onPress={(deadline) => setDeadlineEditor({ deadline })}
              onScanNow={handleScan}
            />
          ) : null}
        </View>
      ) : null}

      {docs.length === 0 ? (
        <EmptyState
          title={course ? `Nothing in ${course.name} yet` : 'Nothing unsorted'}
          body={course ? 'Scans you start here are saved to this course.' : undefined}
          actionLabel={course ? 'Scan into this course' : undefined}
          onAction={course ? handleScan : undefined}
        />
      ) : (
        <>
          <DocTypeFilterChips docs={docs} value={typeFilter} onChange={setTypeFilter} />
          <FlatList
            data={shownDocs}
            keyExtractor={(doc) => doc.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 96 + insets.bottom }]}
            ListFooterComponent={
              submissions.length > 0 ? (
                <View style={styles.submitted}>
                  <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Submitted</Text>
                  <SubmissionList
                    submissions={submissions}
                    onShareAgain={shareSubmission}
                    onOpen={(s) => {
                      const doc = files.find((f) => f.id === s.documentId);
                      if (doc) openDocument(doc);
                    }}
                  />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <FileRow
                doc={item}
                selected={selection.includes(item.id)}
                selectionMode={selMode}
                onPress={() => handlePressRow(item)}
                onLongPress={() => handleLongPress(item)}
                onToggleStar={() => dispatch({ type: 'library/TOGGLE_STAR', id: item.id })}
              />
            )}
          />
        </>
      )}

      {selMode ? (
        <SelectionBar selectedDocs={selectedDocs} onPress={handleSelectionTool} />
      ) : docs.length > 0 ? (
        <Pressable
          style={[styles.scanButton, { backgroundColor: tokens.accent, bottom: spacing.lg + insets.bottom }]}
          onPress={handleScan}
          accessibilityRole="button"
          accessibilityLabel={course ? `Scan into ${course.name}` : 'Scan'}
        >
          <Ionicons name="scan" size={20} color="#fff" />
          <Text style={styles.scanLabel}>Scan</Text>
        </Pressable>
      ) : null}

      {course ? <CourseEditorSheet visible={editing} course={course} onClose={() => setEditing(false)} /> : null}
      {course ? (
        <DeadlineEditorSheet
          visible={deadlineEditor !== null}
          deadline={deadlineEditor?.deadline}
          courseId={course.id}
          onClose={() => setDeadlineEditor(null)}
        />
      ) : null}
      {overlays}
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
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
  },
  subtitle: {
    fontSize: 13.5,
  },
  selectionTitle: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  scanButton: {
    position: 'absolute',
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radii.full,
    elevation: 4,
  },
  scanLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  submitted: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deadlines: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  deadlinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addLink: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
