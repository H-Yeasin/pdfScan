import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CourseEditorSheet } from '../components/courses/CourseEditorSheet';
import { CourseHero } from '../components/courses/CourseHero';
import { CourseSectionHeader } from '../components/courses/CourseSectionHeader';
import { UNSORTED_COURSE_ID } from '../components/courses/CourseList';
import { EmptyState } from '../components/shared/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { SelectionBar } from '../components/library/SelectionBar';
import { SelectAllButton } from '../components/library/SelectAllButton';
import { SkeletonRows } from '../components/library/SkeletonRows';
import { SortMenu } from '../components/library/SortMenu';
import { useDocumentListActions, useOpenDocument } from '../components/library/useDocumentListActions';
import { useBackupExport } from '../components/backup/useBackupExport';
import { SubmissionList } from '../components/submit/SubmissionList';
import { DeadlineList } from '../components/deadlines/DeadlineList';
import { DeadlineEditorSheet } from '../components/deadlines/DeadlineEditorSheet';
import { SortUnsortedSheet } from '../components/courses/SortUnsortedSheet';
import { BookmarkList } from '../components/bookmarks/BookmarkList';
import { animateNextListChange, Button, Chip, FilterChip, IconButton, registerAnimatedList, Text } from '../components/ui';
import { cardBackground } from '../components/ui/Card';
import { courseBookmarks } from '../services/study/bookmarks';
import { useShareSubmission } from '../store/useSubmitDocument';
import { useRouter } from '../navigation/router';
import { docTypeCounts, docTypeOf, getDocType } from '../services/courses/docTypes';
import {
  coursePageItemKey,
  coursePageItems,
  coursePageItemType,
  initialOpenSections,
  toggleSection,
  type CoursePageItem,
  type CourseSectionId,
} from '../services/courses/coursePage';
import { startScan } from '../services/courses/startScan';
import { sortDocuments, type DocumentSort } from '../services/library/documentSort';
import { useStableCallback } from '../utils/useStableCallback';
import type { Deadline, DocType } from '../types/models';
import { useAppDispatch, useAppSlices, useAppStore } from '../store/AppStateContext';
import { ICONS, elevation, radii, spacing, useTheme } from '../theme';
import { useT } from '../i18n/useT';
import { useRenderCount } from '../utils/renderCounts';

const SECTION_TITLES = {
  deadlines: 'courses.page.deadlines',
  bookmarks: 'courses.page.bookmarked',
  submissions: 'courses.page.submitted',
} as const;

// One course's page (§17 U11): the course's tint with its name and labelled actions (Scan, Exam
// pack, Sort unsorted, Edit), then one list: its documents (in Files' order, with type chips), then
// Deadlines, Bookmarks and Submissions as headers with counts that open in place. Nothing is pinned
// outside the scroll except the bar (Back, Export) and the floating Scan, which files the scan into
// this course (startScan preselects it). Opened from Home's course grid and Files' folders
// (state.libraryUi.activeCourseId says which).
export function CourseScreen() {
  useRenderCount('Course');
  const { tokens, theme } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { go, back } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'libraryUi', 'pack', 'settings');
  const store = useAppStore();
  const { files, courses } = state.library;
  const { activeCourseId, selection, selMode, highlightDeadlineId } = state.libraryUi;
  const { selectedDocs, handlePressRow, handleLongPress, handleMore, handleSelectionTool, overlays } = useDocumentListActions();
  // §8 B3: "Export course…" (Unsorted: its documents).
  const { exportScope, overlay: exportOverlay } = useBackupExport();
  // Stable, so the memo'd FileRows only re-render when their own data changes (§9 O5).
  const onRowPress = useStableCallback(handlePressRow);
  const onRowLongPress = useStableCallback(handleLongPress);
  const onRowMore = useStableCallback(handleMore);
  const [editing, setEditing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocType | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  // A tapped reminder opens on its deadline, so Deadlines starts open then.
  const [openSections, setOpenSections] = useState(() => initialOpenSections(highlightDeadlineId));
  const sort = state.settings.filesView.sort;
  const setSort = useCallback((next: DocumentSort) => dispatch({ type: 'settings/SET_FILES_VIEW', view: { sort: next } }), [dispatch]);

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
  const openDocument = useOpenDocument();
  // K6: archived documents are listed only on request.
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => docs.filter((d) => d.archived).length, [docs]);
  const listedDocs = useMemo(() => (showArchived ? docs : docs.filter((d) => !d.archived)), [docs, showArchived]);
  const shownDocs = useMemo(
    () => sortDocuments(typeFilter ? listedDocs.filter((d) => docTypeOf(d) === typeFilter) : listedDocs, sort, courses),
    [listedDocs, typeFilter, sort, courses]
  );
  const typeCounts = useMemo(() => docTypeCounts(listedDocs), [listedDocs]);
  // §5 T5: bookmarked pages across this course's documents (3 shown until "Show all").
  const bookmarked = useMemo(
    () => courseBookmarks(state.library.bookmarks, files, isUnsorted ? null : (activeCourseId ?? null)),
    [state.library.bookmarks, files, isUnsorted, activeCourseId]
  );
  const [allBookmarks, setAllBookmarks] = useState(false);
  // §5 T6: the exam-pack tray is filed under this course when it starts here.
  const packCount = state.pack.items.length;
  const openPack = useCallback(() => {
    if (packCount === 0) dispatch({ type: 'pack/SET_COURSE', courseId: course?.id ?? null });
    go('examPack');
  }, [packCount, dispatch, course, go]);
  const addBookmarksToPack = () => {
    dispatch({
      type: 'pack/ADD',
      items: bookmarked.map((b) => ({ documentId: b.doc.id, pageId: b.bookmark.pageId })),
      courseId: course?.id ?? null,
    });
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('courses.page.addedBookmarks', { count: bookmarked.length }), action: t('courses.page.open'), onAction: () => go('examPack') });
  };

  // Unsorted: a one-time "Sort them now?" card, and a Sort chip that's always there.
  const [sorting, setSorting] = useState(false);
  const toSort = useMemo(() => (isUnsorted ? docs.filter((d) => !d.archived) : []), [isUnsorted, docs]);
  const hasActiveCourse = courses.some((c) => !c.archived);
  const canSort = isUnsorted && toSort.length > 0 && hasActiveCourse;
  const showSortPrompt = canSort && !state.settings.unsortedPromptDone;
  const startSorting = useCallback(() => {
    dispatch({ type: 'settings/SET_UNSORTED_PROMPT_DONE' });
    setSorting(true);
  }, [dispatch]);

  const goBack = () => {
    dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
    if (highlightDeadlineId) dispatch({ type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: null });
    back();
  };

  const handleScan = useCallback(() => {
    // §17 U5: the scanner opens over this page (ScanLauncher); Review comes when the pages land.
    startScan(store.getState(), dispatch, course?.id ?? null, { launch: true });
  }, [store, dispatch, course]);

  const exportThis = () =>
    course ? exportScope({ kind: 'courses', courseIds: [course.id] }, course.name) : exportScope({ kind: 'documents', documentIds: docs.map((d) => d.id) });

  const title = course?.name ?? t('common.unsorted');
  const subtitle = course
    ? [course.code, course.teacher, course.archived ? t('courses.page.archived') : undefined].filter(Boolean).join(' · ')
    : t('courses.page.unsortedSubtitle');
  const tint = cardBackground('tinted', tokens, theme, course?.color);

  // The bar shows the name once the hero's title has scrolled away under it.
  const [heroHeight, setHeroHeight] = useState(0);
  const [titleInBar, setTitleInBar] = useState(false);
  const titleInBarRef = useRef(false);
  const onHeroLayout = useCallback((e: LayoutChangeEvent) => setHeroHeight(e.nativeEvent.layout.height), []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = heroHeight > 0 && e.nativeEvent.contentOffset.y > heroHeight * 0.6;
      if (past !== titleInBarRef.current) {
        titleInBarRef.current = past;
        setTitleInBar(past);
      }
    },
    [heroHeight]
  );

  const items = useMemo(
    () =>
      coursePageItems({
        docs: shownDocs,
        totalDocs: docs.length,
        archivedCount,
        showArchived,
        typeFiltered: typeFilter !== null,
        counts: {
          deadlines: course ? deadlines.length : null,
          bookmarks: bookmarked.length ? bookmarked.length : null,
          submissions: submissions.length ? submissions.length : null,
        },
        open: openSections,
      }),
    [shownDocs, docs.length, archivedCount, showArchived, typeFilter, course, deadlines.length, bookmarked.length, submissions.length, openSections]
  );

  // §17 U13: a section's rows fade in under its header and the ones below slide down, instead of
  // jumping; the rows of a document deleted or archived from here fade out the same way.
  const listRef = useRef<FlashListRef<CoursePageItem>>(null);
  useEffect(() => registerAnimatedList(listRef), []);
  const onToggleSection = useCallback((id: CourseSectionId) => {
    animateNextListChange();
    setOpenSections((open) => toggleSection(open, id));
  }, []);

  const sectionBody = (id: CourseSectionId) => {
    switch (id) {
      case 'deadlines':
        return (
          <View style={styles.sectionBody}>
            {deadlines.length > 0 ? (
              <DeadlineList
                deadlines={deadlines}
                now={Date.now()}
                highlightId={highlightDeadlineId}
                onPress={(deadline) => setDeadlineEditor({ deadline })}
                onScanNow={handleScan}
              />
            ) : (
              <EmptyState variant="inline" title={t('courses.page.noDeadlines')} body={t('courses.page.noDeadlinesBody')} />
            )}
            <Button size="sm" variant="tonal" icon={ICONS.deadline} label={t('courses.page.addDeadline')} onPress={() => setDeadlineEditor({})} />
          </View>
        );
      case 'bookmarks':
        return (
          <View style={styles.sectionBody}>
            <BookmarkList
              items={allBookmarks ? bookmarked : bookmarked.slice(0, 3)}
              onOpen={(item) => {
                openDocument(item.doc);
                dispatch({ type: 'reader/SET_TARGET', target: { pageId: item.bookmark.pageId } });
              }}
            />
            <View style={styles.buttonRow}>
              <Button size="sm" variant="tonal" icon={ICONS.examPack} label={t('courses.page.addAllToPack')} onPress={addBookmarksToPack} />
              {bookmarked.length > 3 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  label={allBookmarks ? t('courses.page.showLess') : t('courses.page.showAll', { count: bookmarked.length })}
                  onPress={() => setAllBookmarks((v) => !v)}
                />
              ) : null}
            </View>
          </View>
        );
      case 'submissions':
        return (
          <View style={styles.sectionBody}>
            <SubmissionList
              submissions={submissions}
              onShareAgain={shareSubmission}
              onOpen={(s) => {
                const doc = files.find((f) => f.id === s.documentId);
                if (doc) openDocument(doc);
              }}
            />
          </View>
        );
    }
  };

  // §17 U13: rows breathing in the documents' place while the library loads, not "Nothing here yet".
  const documentsHeader = (count: number) =>
    docs.length === 0 && state.library.loadStatus === 'loading' ? (
      <SkeletonRows count={4} />
    ) : docs.length === 0 ? (
      <EmptyState
        variant="inline"
        title={course ? t('courses.page.emptyCourse', { name: course.name }) : t('courses.page.emptyUnsorted')}
        body={course ? t('courses.page.emptyBody', { course: course.code || course.name }) : t('courses.page.emptyUnsortedBody')}
        action={course ? { label: t('courses.page.scanInto'), onPress: handleScan } : undefined}
      />
    ) : (
      <View style={styles.docsHeader}>
        <View style={styles.docsTitleRow}>
          <Text variant="overline" color="muted" accessibilityRole="header" style={styles.flex}>
            {t('courses.page.documents', { count })}
          </Text>
          <Chip
            label={t(`library.sort.${sort.key}`)}
            icon={ICONS.sort}
            onPress={() => setSortOpen(true)}
            accessibilityLabel={t('library.sortA11y', { order: t(`library.sort.${sort.key}`) })}
            testID="course-sort"
          />
        </View>
        {/* Type chips only when there are two types to choose between, or one is on (to clear it). */}
        {typeCounts.length > 1 || typeFilter !== null ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeChips}>
            <FilterChip
              label={t('courses.all')}
              count={listedDocs.length}
              selected={typeFilter === null}
              onPress={() => setTypeFilter(null)}
              testID="course-type-all"
            />
            {typeCounts.map(({ type, count: n }) => (
              <FilterChip
                key={type}
                label={t(getDocType(type).pluralKey)}
                count={n}
                selected={typeFilter === type}
                onPress={() => setTypeFilter(typeFilter === type ? null : type)}
                testID={`course-type-${type}`}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
    );

  // §16 G6: one function for the list, and primitives for the rows, so `memo(FileRow)` holds.
  const renderItem = ({ item }: ListRenderItemInfo<CoursePageItem>) => {
    switch (item.kind) {
      case 'documentsHeader':
        return documentsHeader(item.count);
      case 'doc':
        return (
          <FileRow
            doc={item.doc}
            selected={selection.has(item.doc.id)}
            selectionMode={selMode}
            onPress={onRowPress}
            onLongPress={onRowLongPress}
            onMore={onRowMore}
          />
        );
      case 'documentsEmpty':
        return (
          <Text variant="body" color="muted" align="center" style={styles.note}>
            {item.filtered ? t('courses.page.noneOfType') : t('courses.page.allArchived')}
          </Text>
        );
      case 'archivedToggle':
        return (
          <Button
            size="sm"
            variant="ghost"
            icon={ICONS.archive}
            label={item.showing ? t('library.hideArchived') : t('library.showArchived', { count: item.count })}
            onPress={() => setShowArchived((v) => !v)}
            style={styles.archivedToggle}
          />
        );
      case 'section':
        return (
          <CourseSectionHeader
            title={t(SECTION_TITLES[item.id])}
            count={item.count}
            open={item.open}
            onToggle={() => onToggleSection(item.id)}
            testID={`course-section-${item.id}`}
          />
        );
      case 'sectionBody':
        return sectionBody(item.id);
    }
  };

  const hero = (
    <CourseHero
      course={course}
      title={title}
      subtitle={subtitle}
      background={tint}
      packCount={packCount}
      showPack={docs.length > 0 || packCount > 0}
      canSort={canSort}
      sortPromptCount={showSortPrompt && !selMode ? toSort.length : null}
      onScan={handleScan}
      onPack={openPack}
      onSort={startSorting}
      onEdit={course ? () => setEditing(true) : undefined}
      onDismissSortPrompt={() => dispatch({ type: 'settings/SET_UNSORTED_PROMPT_DONE' })}
      onLayout={onHeroLayout}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {selMode ? (
        <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: tokens.bg }]}>
          <IconButton icon={ICONS.close} accessibilityLabel={t('library.clearSelection')} onPress={() => dispatch({ type: 'libraryUi/CLEAR_SELECTION' })} />
          <Text variant="title" numberOfLines={1} chrome accessibilityLiveRegion="polite" style={styles.flex}>
            {t('library.selected', { count: selection.size })}
          </Text>
          <SelectAllButton visibleIds={shownDocs.map((d) => d.id)} selection={selection} />
        </View>
      ) : (
        <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: tint }]}>
          <IconButton icon={ICONS.back} accessibilityLabel={t('common.back')} onPress={goBack} />
          {/* Drawn only: the hero's headline is the screen's header for TalkBack. */}
          <Text
            variant="title"
            numberOfLines={1}
            chrome
            style={[styles.flex, !titleInBar && styles.hidden]}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            {title}
          </Text>
          {docs.length > 0 ? <IconButton icon={ICONS.backup} accessibilityLabel={t('backup.export.course')} onPress={exportThis} /> : null}
        </View>
      )}

      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={coursePageItemKey}
        getItemType={coursePageItemType}
        ListHeaderComponent={hero}
        onScroll={onScroll}
        scrollEventThrottle={32}
        // Room for the floating Scan button above the navigation bar; while selecting, the
        // SelectionBar (a BottomBar) sits below the list and clears the bar itself.
        contentContainerStyle={{ paddingBottom: selMode ? spacing.lg : 96 + insets.bottom }}
        renderItem={renderItem}
        testID="course-list"
      />

      {selMode ? (
        <SelectionBar selectedDocs={selectedDocs} onPress={handleSelectionTool} />
      ) : docs.length > 0 ? (
        <View style={[elevation(2, theme), styles.fab, { bottom: spacing.lg + insets.bottom }]}>
          <Button
            icon={ICONS.scan}
            label={t('common.scan')}
            onPress={handleScan}
            accessibilityLabel={course ? t('courses.page.scanIntoA11y', { name: course.name }) : t('common.scan')}
            testID="course-fab"
          />
        </View>
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
      <SortMenu visible={sortOpen} sort={sort} onChange={setSort} onClose={() => setSortOpen(false)} />
      {overlays}
      {exportOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  docsHeader: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  docsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  typeChips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  note: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  archivedToggle: {
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  sectionBody: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // The button carries its own colour; this lifts it over the list, in the button's shape.
  fab: {
    position: 'absolute',
    right: spacing.lg,
    borderRadius: radii.button,
  },
});
