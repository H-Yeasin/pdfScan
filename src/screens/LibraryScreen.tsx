import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../components/shared/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { FileGridItem } from '../components/library/FileGridItem';
import { CourseFolders } from '../components/library/CourseFolders';
import { FilesToolbar } from '../components/library/FilesToolbar';
import { FilterSheet } from '../components/library/FilterSheet';
import { SortMenu } from '../components/library/SortMenu';
import { PageResults } from '../components/library/PageResults';
import { SearchBar } from '../components/library/SearchBar';
import { SelectionBar } from '../components/library/SelectionBar';
import { SelectAllButton } from '../components/library/SelectAllButton';
import { useDocumentListActions, useOpenDocument } from '../components/library/useDocumentListActions';
import { IconButton, registerAnimatedList, ScreenHeader, Text } from '../components/ui';
import { BannerSlot } from '../components/ads/BannerSlot';
import { useRouter } from '../navigation/router';
import { startScan } from '../services/courses/startScan';
import { courseColorValue } from '../services/courses/palette';
import { searchDocumentsByText, searchPages, type PageHit } from '../services/persistence/dbService';
import { getMatchSnippet, searchDocuments } from '../services/search/searchService';
import { applyFilters, hasFilters, importCourseId, UNSORTED_COURSE_ID, type DocumentFilters } from '../services/library/documentFilters';
import { sortDocuments, type DocumentSort } from '../services/library/documentSort';
import type { FilesLayout } from '../services/library/filesView';
import { useImportFile } from '../store/useImportFile';
import { useStableCallback } from '../utils/useStableCallback';
import type { LibraryDocument } from '../types/models';
import { useAppDispatch, useAppSelector, useAppSlices, useAppStore } from '../store/AppStateContext';
import { ICONS, spacing, useTheme } from '../theme';
import { useT } from '../i18n/useT';
import { SkeletonRows } from '../components/library/SkeletonRows';
import { useRenderCount } from '../utils/renderCounts';

// The list's first item is the toolbar, which sticks at the top while the documents scroll under
// it (stickyHeaderIndices). The course folders above it are the list's header and scroll away.
const TOOLBAR = 'toolbar' as const;
type Item = LibraryDocument | typeof TOOLBAR;
const STICKY = [0];

// §17 U7: Files - the course folders, the toolbar (Filter, Starred, Sort, list / grid), then every
// document, as a list or a grid. A row's ⋯ holds everything that can be done to it; a long-press
// or Select starts selecting. Filters and the scroll stay as they were across navigation (kept tab
// roots, §16 G2; filters in libraryUi); the order and the layout are saved (settings.filesView).
export function LibraryScreen() {
  useRenderCount('Library');
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'libraryUi');
  const store = useAppStore();
  const view = useAppSelector((s) => s.settings.filesView);
  const { loadStatus, files, courses } = state.library;
  const { selection, selMode, filters, revealId, search, searchOpen, searchFocus, searchResultIds } = state.libraryUi;
  const { selectedDocs, handlePressRow, handleLongPress, handleMore, handleSelectionTool, overlays } = useDocumentListActions();
  // Stable, so the memo'd rows only re-render when their own data changes (§9 O5).
  const onRowPress = useStableCallback(handlePressRow);
  const onRowLongPress = useStableCallback(handleLongPress);
  const onRowMore = useStableCallback(handleMore);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const importFile = useImportFile();
  const listRef = useRef<FlashListRef<Item>>(null);
  // §17 U13: deleted, archived and merged rows fade in and out (layoutMotion).
  useEffect(() => registerAnimatedList(listRef), []);
  const searching = search.trim() !== '';

  const setFilters = useCallback((next: DocumentFilters) => dispatch({ type: 'libraryUi/SET_FILTERS', filters: next }), [dispatch]);
  const setSort = useCallback((sort: DocumentSort) => dispatch({ type: 'settings/SET_FILES_VIEW', view: { sort } }), [dispatch]);
  const setLayout = useCallback((layout: FilesLayout) => dispatch({ type: 'settings/SET_FILES_VIEW', view: { layout } }), [dispatch]);

  // §5 T2: the pages that match, under the documents. Same debounce as the document search; a
  // filter on exactly one course or type narrows them too.
  const [pageHits, setPageHits] = useState<PageHit[]>([]);
  const openDocument = useOpenDocument();
  const hitCourse = filters.courseIds.length === 1 ? filters.courseIds[0] : undefined;
  const hitType = filters.types.length === 1 ? filters.types[0] : undefined;
  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setPageHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPages(query, {
        courseId: hitCourse === undefined ? undefined : hitCourse === UNSORTED_COURSE_ID ? null : hitCourse,
        type: hitType,
      })
        .then((hits) => {
          if (!cancelled) setPageHits(hits);
        })
        .catch((e) => {
          console.warn('dbService.searchPages failed', e);
          if (!cancelled) setPageHits([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, hitCourse, hitType]);

  useEffect(() => {
    const query = search.trim();
    if (!query) return;
    const timer = setTimeout(() => {
      searchDocumentsByText(query)
        .then((ids) => dispatch({ type: 'libraryUi/SET_SEARCH_RESULT_IDS', ids }))
        .catch((e) => {
          console.warn('dbService.searchDocumentsByText failed', e);
          dispatch({ type: 'libraryUi/SET_SEARCH_RESULT_IDS', ids: null });
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [search, dispatch]);

  const submittedIds = useMemo(() => new Set(state.library.submissions.map((s) => s.documentId)), [state.library.submissions]);
  const bookmarkedIds = useMemo(() => new Set(state.library.bookmarks.map((b) => b.documentId)), [state.library.bookmarks]);

  // Search first (the database's full-text answer, or the in-memory haystack until it comes),
  // then the filters, then the order.
  const visibleFiles = useMemo(() => {
    let found: LibraryDocument[] = files;
    if (searching) {
      if (searchResultIds === null) found = searchDocuments(files, search);
      else {
        const idSet = new Set(searchResultIds);
        found = files.filter((f) => idSet.has(f.id));
      }
    }
    const filtered = applyFilters(found, filters, { submittedIds, bookmarkedIds, searching });
    return sortDocuments(filtered, view.sort, courses);
  }, [files, searching, search, searchResultIds, filters, submittedIds, bookmarkedIds, view.sort, courses]);

  const data = useMemo<Item[]>(() => [TOOLBAR, ...visibleFiles], [visibleFiles]);

  const courseColors = useMemo(() => new Map(courses.map((c) => [c.id, courseColorValue(c.color, tokens)])), [courses, tokens]);

  const grid = view.layout === 'grid';
  // §16 G6: one function for the list, and primitives for the row, so the memo'd rows skip every
  // row whose own document, selection, snippet and colour are what they were.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Item>) => {
      if (item === TOOLBAR) {
        return (
          <FilesToolbar
            filters={filters}
            sort={view.sort}
            layout={view.layout}
            courses={courses}
            onFilters={setFilters}
            onOpenFilters={() => setFilterOpen(true)}
            onOpenSort={() => setSortOpen(true)}
            onLayout={setLayout}
          />
        );
      }
      const courseColor = item.courseId ? courseColors.get(item.courseId) : undefined;
      return grid ? (
        <FileGridItem
          doc={item}
          selected={selection.has(item.id)}
          selectionMode={selMode}
          courseColor={courseColor}
          onPress={onRowPress}
          onLongPress={onRowLongPress}
          onMore={onRowMore}
        />
      ) : (
        <FileRow
          doc={item}
          selected={selection.has(item.id)}
          selectionMode={selMode}
          matchSnippet={getMatchSnippet(item, search)}
          courseColor={courseColor}
          onPress={onRowPress}
          onLongPress={onRowLongPress}
          onMore={onRowMore}
        />
      );
    },
    [filters, view.sort, view.layout, courses, setFilters, setLayout, courseColors, grid, selection, selMode, search, onRowPress, onRowLongPress, onRowMore]
  );

  // A merge's or an import's result: scroll to it once it is in the list, then forget it. One
  // that the filters hide is only forgotten.
  useEffect(() => {
    if (!revealId) return;
    const index = data.findIndex((item) => item !== TOOLBAR && item.id === revealId);
    if (index > 0) void listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    dispatch({ type: 'libraryUi/REVEALED' });
  }, [revealId, data, dispatch]);

  const handleImport = useCallback(() => importFile({ stay: true, courseId: importCourseId(filters) }), [importFile, filters]);
  const openCourse = useCallback(
    (id: string) => {
      dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id });
      go('course');
    },
    [dispatch, go]
  );
  const manageCourses = useCallback(() => go('manageFolders'), [go]);

  const isEmptyLibrary = files.length === 0;
  const filtered = hasFilters(filters);

  const noResults =
    visibleFiles.length > 0 ? null : searching ? (
      <EmptyState
        variant="inline"
        title={t('library.noMatch', { query: search.trim() })}
        body={filtered ? t('library.noMatchFiltered') : t('library.noMatchBody')}
        action={
          filtered
            ? { label: t('library.filters.clear'), onPress: () => dispatch({ type: 'libraryUi/CLEAR_FILTERS' }) }
            : { label: t('library.clearSearch'), onPress: () => dispatch({ type: 'libraryUi/SET_SEARCH', search: '' }) }
        }
      />
    ) : (
      <EmptyState
        variant="inline"
        title={t('library.noFiltered')}
        body={t('library.noFilteredBody')}
        action={{ label: t('library.filters.clear'), onPress: () => dispatch({ type: 'libraryUi/CLEAR_FILTERS' }) }}
      />
    );

  const footer = (
    <>
      {noResults}
      {searching ? (
        <PageResults
          hits={pageHits}
          docs={files}
          onOpen={(doc, hit) => {
            openDocument(doc);
            dispatch({ type: 'reader/SET_TARGET', target: { pageId: hit.pageId, query: search.trim() } });
          }}
          onAddAll={() => {
            const firstDoc = files.find((f) => f.id === pageHits[0]?.documentId);
            const packCourse = hitCourse && hitCourse !== UNSORTED_COURSE_ID ? hitCourse : (firstDoc?.courseId ?? null);
            dispatch({
              type: 'pack/ADD',
              items: pageHits.map((h) => ({ documentId: h.documentId, pageId: h.pageId })),
              courseId: packCourse,
            });
            dispatch({
              type: 'ui/SHOW_SNACK',
              msg: t('library.addedToPack', { count: pageHits.length }),
              action: t('library.open'),
              onAction: () => go('examPack'),
            });
          }}
        />
      ) : null}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {selMode ? (
        <View style={[styles.selectionHeader, { paddingTop: insets.top + spacing.xs, backgroundColor: tokens.bg }]}>
          <IconButton icon={ICONS.close} accessibilityLabel={t('library.clearSelection')} onPress={() => dispatch({ type: 'libraryUi/CLEAR_SELECTION' })} />
          <Text variant="title" numberOfLines={1} chrome accessibilityLiveRegion="polite" style={styles.selectionTitle}>
            {t('library.selected', { count: selection.size })}
          </Text>
          <SelectAllButton visibleIds={visibleFiles.map((f) => f.id)} selection={selection} />
        </View>
      ) : (
        <ScreenHeader
          large
          title={t('library.title')}
          actions={[
            { icon: ICONS.find, label: t('library.search'), onPress: () => dispatch({ type: 'libraryUi/TOGGLE_SEARCH_OPEN' }), selected: searchOpen },
            { icon: ICONS.import, label: t('library.importFile'), onPress: () => void handleImport() },
            { icon: ICONS.select, label: t('library.select'), onPress: () => dispatch({ type: 'libraryUi/SET_SEL_MODE', on: true }), disabled: isEmptyLibrary },
          ]}
        />
      )}

      {searchOpen && !selMode ? (
        <SearchBar key={searchFocus} value={search} onChange={(value) => dispatch({ type: 'libraryUi/SET_SEARCH', search: value })} />
      ) : null}

      {loadStatus === 'loading' ? (
        <SkeletonRows />
      ) : loadStatus === 'failed' ? (
        <EmptyState
          title={t('library.loadFailed')}
          body={t('library.loadFailedBody')}
          action={{ label: t('library.tryAgain'), onPress: () => dispatch({ type: 'library/RETRY_LOAD' }) }}
        />
      ) : isEmptyLibrary ? (
        <EmptyState
          title={t('library.empty')}
          body={t('library.emptyBody')}
          action={{ label: t('library.scanFirst'), onPress: () => startScan(store.getState(), dispatch, null, { launch: true }) }}
          secondaryAction={{ label: t('library.importFile'), onPress: () => void handleImport() }}
        />
      ) : (
        <FlashList
          // The column count is fixed for a list's life: switching layout makes a new one.
          key={view.layout}
          ref={listRef}
          data={data}
          keyExtractor={itemKey}
          getItemType={itemType}
          numColumns={grid ? 2 : 1}
          overrideItemLayout={(layout, item) => {
            if (item === TOOLBAR) layout.span = 2;
          }}
          stickyHeaderIndices={STICKY}
          ListHeaderComponent={searching ? null : <CourseFolders courses={courses} files={files} onOpen={openCourse} onManage={manageCourses} />}
          ListFooterComponent={footer}
          contentContainerStyle={grid ? styles.gridContent : styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          testID="files-list"
        />
      )}

      {/* In selection mode the selection bar takes the place of the shell's tab bar (§16 G2). */}
      {selMode ? (
        <SelectionBar selectedDocs={selectedDocs} onPress={handleSelectionTool} />
      ) : (
        // §10 M5: the only ad in Files, above the tab bar, never among the documents.
        <BannerSlot screen="library" />
      )}

      <FilterSheet
        visible={filterOpen}
        filters={filters}
        courses={courses}
        hasSubmissions={submittedIds.size > 0}
        hasBookmarks={bookmarkedIds.size > 0}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />
      <SortMenu visible={sortOpen} sort={view.sort} onChange={setSort} onClose={() => setSortOpen(false)} />
      {overlays}
    </View>
  );
}

const itemKey = (item: Item) => (item === TOOLBAR ? TOOLBAR : item.id);
const itemType = (item: Item) => (item === TOOLBAR ? TOOLBAR : 'doc');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  selectionTitle: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  // The cells carry their own gutter (FileGridItem); this is the rest of the edge.
  gridContent: {
    paddingHorizontal: spacing.lg - spacing.xs - 2,
    paddingBottom: spacing.lg,
  },
});
