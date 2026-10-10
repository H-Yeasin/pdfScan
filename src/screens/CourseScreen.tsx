import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CourseBadge } from '../components/courses/CourseBadge';
import { CourseEditorSheet } from '../components/courses/CourseEditorSheet';
import { DocTypeFilterChips } from '../components/courses/DocTypeChips';
import { UNSORTED_COURSE_ID } from '../components/courses/CourseList';
import { EmptyState } from '../components/shared/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { SelectionBar } from '../components/library/SelectionBar';
import { SelectAllButton } from '../components/library/SelectAllButton';
import { useDocumentListActions, useOpenDocument } from '../components/library/useDocumentListActions';
import { useBackupExport } from '../components/backup/useBackupExport';
import { SubmissionList } from '../components/submit/SubmissionList';
import { DeadlineList } from '../components/deadlines/DeadlineList';
import { DeadlineEditorSheet } from '../components/deadlines/DeadlineEditorSheet';
import { SortUnsortedSheet } from '../components/courses/SortUnsortedSheet';
import { BookmarkList } from '../components/bookmarks/BookmarkList';
import { courseBookmarks } from '../services/study/bookmarks';
import type { Deadline } from '../types/models';
import { useShareSubmission } from '../store/useSubmitDocument';
import { useRouter } from '../navigation/router';
import { docTypeOf } from '../services/courses/docTypes';
import { startScan } from '../services/courses/startScan';
import { useStableCallback } from '../utils/useStableCallback';
import { DOC_LIST_TUNING } from '../components/library/docListTuning';
import type { LibraryDocument } from '../types/models';
import { useAppDispatch, useAppSlices, useAppStore } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme, touchSlop } from '../theme';
import type { DocType } from '../types/models';
import { useT } from '../i18n/useT';
import { useRenderCount } from '../utils/renderCounts';

// One course's page: its header and its documents, newest first. Opened from Home's course grid
// and Library's Courses tab (state.libraryUi.activeCourseId says which). Scanning from here files
// the scan into this course (startScan preselects it in Deliver). Type chips filter the list (K4).
export function CourseScreen() {
  useRenderCount('Course');
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { go, back } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'libraryUi', 'pack', 'settings');
  const store = useAppStore();
  const { files, courses } = state.library;
  const { activeCourseId, selection, selMode, highlightDeadlineId } = state.libraryUi;
  const { selectedDocs, handlePressRow, handleLongPress, handleSelectionTool, overlays } = useDocumentListActions();
  // §8 B3: "Export course…" (Unsorted: its documents).
  const { exportScope, overlay: exportOverlay } = useBackupExport();
  // Stable, so the memo'd FileRows only re-render when their own data changes (§9 O5).
  const onRowPress = useStableCallback(handlePressRow);
  const onRowLongPress = useStableCallback(handleLongPress);
  const onRowStar = useStableCallback((doc: LibraryDocument) => dispatch({ type: 'library/TOGGLE_STAR', id: doc.id }));
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
  const deadlines = useMemo(
    () => (course ? state.library.deadlines.filter((d) => d.courseId === course.id && !d.doneSubmissionId) : []),
    [course, state.library.deadlines]
  );
  const [deadlineEditor, setDeadlineEditor] = useState<{ deadline?: Deadline } | null>(null);
  const now = Date.now();
  const openDocument = useOpenDocument();
  // K6: archived documents are listed only on request.
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => docs.filter((d) => d.archived).length, [docs]);
  const listedDocs = useMemo(() => (showArchived ? docs : docs.filter((d) => !d.archived)), [docs, showArchived]);
  const shownDocs = useMemo(
    () => (typeFilter ? listedDocs.filter((d) => docTypeOf(d) === typeFilter) : listedDocs),
    [listedDocs, typeFilter]
  );
  // §5 T5: bookmarked pages across this course's documents (3 shown until "Show all").
  const bookmarked = useMemo(
    () => courseBookmarks(state.library.bookmarks, files, isUnsorted ? null : (activeCourseId ?? null)),
    [state.library.bookmarks, files, isUnsorted, activeCourseId]
  );
  const [allBookmarks, setAllBookmarks] = useState(false);
  // §5 T6: the exam-pack tray is filed under this course when it starts here.
  const packCount = state.pack.items.length;
  const openPack = () => {
    if (packCount === 0) dispatch({ type: 'pack/SET_COURSE', courseId: course?.id ?? null });
    go('examPack');
  };
  const addBookmarksToPack = () => {
    dispatch({
      type: 'pack/ADD',
      items: bookmarked.map((b) => ({ documentId: b.doc.id, pageId: b.bookmark.pageId })),
      courseId: course?.id ?? null,
    });
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('courses.page.addedBookmarks', { count: bookmarked.length }), action: t('courses.page.open'), onAction: () => go('examPack') });
  };

  // Unsorted: a one-time "Sort them now?" banner, and a Sort button that's always there.
  const [sorting, setSorting] = useState(false);
  const toSort = useMemo(() => (isUnsorted ? docs.filter((d) => !d.archived) : []), [isUnsorted, docs]);
  const showSortBanner = isUnsorted && toSort.length > 0 && !state.settings.unsortedPromptDone;
  const startSorting = () => {
    dispatch({ type: 'settings/SET_UNSORTED_PROMPT_DONE' });
    setSorting(true);
  };

  const goBack = () => {
    dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
    if (highlightDeadlineId) dispatch({ type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: null });
    back();
  };

  const handleScan = () => {
    startScan(store.getState(), dispatch, course?.id ?? null, { launch: true });
    go('capture');
  };

  const subtitle = course
    ? [course.code, course.teacher, course.archived ? t('courses.page.archived') : undefined].filter(Boolean).join(' · ')
    : t('courses.page.unsortedSubtitle');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      {selMode ? (
        <View style={styles.header}>
          <Pressable hitSlop={touchSlop(44)} accessibilityRole="button"
            style={[styles.iconButton, { backgroundColor: tokens.surface2, borderRadius: 22 }]}
            onPress={() => dispatch({ type: 'libraryUi/CLEAR_SELECTION' })}
            accessibilityLabel={t('library.clearSelection')}
          >
            <Ionicons name="close" size={20} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.selectionTitle, { color: tokens.ink }]}>{t('library.selected', { count: selection.size })}</Text>
          <SelectAllButton visibleIds={shownDocs.map((d) => d.id)} selection={selection} />
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={goBack} accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={22} color={tokens.ink} />
          </Pressable>
          {course ? <CourseBadge course={course} size={40} /> : null}
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {course?.name ?? t('common.unsorted')}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: tokens.muted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {docs.length > 0 ? (
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={openPack} accessibilityLabel={packCount ? t('courses.page.examPackCountA11y', { count: packCount }) : t('courses.page.examPackA11y')}>
              <Ionicons name="layers-outline" size={21} color={tokens.ink} />
              {packCount ? (
                <View style={[styles.badge, { backgroundColor: tokens.accent }]}>
                  <Text style={[styles.badgeLabel, { color: tokens.onAccent }]}>{packCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {docs.length > 0 ? (
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button"
              style={styles.iconButton}
              onPress={() =>
                course
                  ? exportScope({ kind: 'courses', courseIds: [course.id] }, course.name)
                  : exportScope({ kind: 'documents', documentIds: docs.map((d) => d.id) })
              }
              accessibilityLabel={t('backup.export.course')}
            >
              <Ionicons name="download-outline" size={21} color={tokens.ink} />
            </Pressable>
          ) : null}
          {course ? (
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={() => setEditing(true)} accessibilityLabel={t('courses.editCourse')}>
              <Ionicons name="create-outline" size={21} color={tokens.ink} />
            </Pressable>
          ) : toSort.length > 0 && state.library.courses.some((c) => !c.archived) ? (
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={startSorting} accessibilityLabel={t('courses.page.sortInto')}>
              <Ionicons name="git-pull-request-outline" size={21} color={tokens.ink} />
            </Pressable>
          ) : null}
        </View>
      )}

      {showSortBanner && !selMode && state.library.courses.some((c) => !c.archived) ? (
        <View style={[styles.banner, { backgroundColor: tokens.accentSoft, borderColor: tokens.edge }]}>
          <Text style={[styles.bannerText, { color: tokens.ink }]}>
            {t('courses.page.sortBanner', { count: toSort.length })}
          </Text>
          <View style={styles.bannerActions}>
            <Pressable onPress={() => dispatch({ type: 'settings/SET_UNSORTED_PROMPT_DONE' })} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.addLink, { color: tokens.muted }]}>{t('courses.page.notNow')}</Text>
            </Pressable>
            <Pressable onPress={startSorting} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.addLink, { color: tokens.accentInk }]}>{t('courses.page.sortNow')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {course && !selMode ? (
        <View style={styles.deadlines}>
          <View style={styles.deadlinesHeader}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('courses.page.deadlines')}</Text>
            <Pressable onPress={() => setDeadlineEditor({})} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.addLink, { color: tokens.accentInk }]}>{t('courses.page.addDeadline')}</Text>
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
          ) : (
            <EmptyState
              variant="inline"
              title={t('courses.page.noDeadlines')}
              body={t('courses.page.noDeadlinesBody')}
            />
          )}
        </View>
      ) : null}

      {bookmarked.length > 0 && !selMode ? (
        <View style={styles.deadlines}>
          <View style={styles.deadlinesHeader}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('courses.page.bookmarked')}</Text>
            <Pressable onPress={addBookmarksToPack} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.addLink, { color: tokens.accentInk }]}>{t('courses.page.addAllToPack')}</Text>
            </Pressable>
            {bookmarked.length > 3 ? (
              <Pressable onPress={() => setAllBookmarks((v) => !v)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.addLink, { color: tokens.accentInk }]}>{allBookmarks ? t('courses.page.showLess') : t('courses.page.showAll', { count: bookmarked.length })}</Text>
              </Pressable>
            ) : null}
          </View>
          <BookmarkList
            items={allBookmarks ? bookmarked : bookmarked.slice(0, 3)}
            onOpen={(item) => {
              openDocument(item.doc);
              dispatch({ type: 'reader/SET_TARGET', target: { pageId: item.bookmark.pageId } });
            }}
          />
        </View>
      ) : null}

      {docs.length === 0 ? (
        <EmptyState
          title={course ? t('courses.page.emptyCourse', { name: course.name }) : t('courses.page.emptyUnsorted')}
          body={course ? t('courses.page.emptyBody', { course: course.code || course.name }) : t('courses.page.emptyUnsortedBody')}
          action={course ? { label: t('courses.page.scanInto'), onPress: handleScan } : undefined}
        />
      ) : (
        <>
          <DocTypeFilterChips docs={listedDocs} value={typeFilter} onChange={setTypeFilter} />
          <FlatList
            data={shownDocs}
            keyExtractor={(doc) => doc.id}
            {...DOC_LIST_TUNING}
            // Room for the floating Scan button above the navigation bar; while selecting, the
            // SelectionBar (a BottomBar) sits below the list and clears the bar itself.
            contentContainerStyle={[styles.listContent, { paddingBottom: selMode ? spacing.lg : 96 + insets.bottom }]}
            ListFooterComponent={
              <>
                {archivedCount > 0 ? (
                  <Pressable style={styles.archivedToggle} onPress={() => setShowArchived((v) => !v)} accessibilityRole="button">
                    <Text style={[styles.addLink, { color: tokens.accentInk }]}>
                      {showArchived ? t('library.hideArchived') : t('library.showArchived', { count: archivedCount })}
                    </Text>
                  </Pressable>
                ) : null}
                {submissions.length > 0 ? (
                  <View style={styles.submitted}>
                    <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('courses.page.submitted')}</Text>
                    <SubmissionList
                      submissions={submissions}
                      onShareAgain={shareSubmission}
                      onOpen={(s) => {
                        const doc = files.find((f) => f.id === s.documentId);
                        if (doc) openDocument(doc);
                      }}
                    />
                  </View>
                ) : null}
              </>
            }
            renderItem={({ item }) => (
              <FileRow
                doc={item}
                selected={selection.has(item.id)}
                selectionMode={selMode}
                onPress={onRowPress}
                onLongPress={onRowLongPress}
                onToggleStar={onRowStar}
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
          accessibilityLabel={course ? t('courses.page.scanIntoA11y', { name: course.name }) : t('common.scan')}
        >
          <Ionicons name="scan" size={20} color={tokens.onAccent} />
          <Text style={[styles.scanLabel, { color: tokens.onAccent }]}>{t('common.scan')}</Text>
        </Pressable>
      ) : null}

      {course ? <CourseEditorSheet visible={editing} course={course} onClose={() => setEditing(false)} /> : null}
      {isUnsorted ? <SortUnsortedSheet visible={sorting} docs={toSort} onClose={() => setSorting(false)} /> : null}
      {course ? (
        <DeadlineEditorSheet
          visible={deadlineEditor !== null}
          deadline={deadlineEditor?.deadline}
          courseId={course.id}
          onClose={() => setDeadlineEditor(null)}
        />
      ) : null}
      {overlays}
      {exportOverlay}
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
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
  archivedToggle: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
