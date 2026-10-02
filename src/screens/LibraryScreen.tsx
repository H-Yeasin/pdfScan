import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { EmptyState } from '../components/library/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { CourseList } from '../components/courses/CourseList';
import { DocTypeFilterChips } from '../components/courses/DocTypeChips';
import { CourseFilterChips } from '../components/courses/CourseFilterChips';
import { PageResults } from '../components/library/PageResults';
import { useOpenDocument } from '../components/library/useDocumentListActions';
import { searchPages, type PageHit } from '../services/persistence/dbService';
import { UNSORTED_COURSE_ID } from '../components/courses/CourseList';
import { courseColorValue } from '../services/courses/palette';
import { SubmittedFilterChips, type SubmittedFilter } from '../components/submit/SubmittedFilterChips';
import { docTypeOf } from '../services/courses/docTypes';
import type { DocType } from '../types/models';
import { LibraryTabs } from '../components/library/LibraryTabs';
import { SearchBar } from '../components/library/SearchBar';
import { SelectionBar } from '../components/library/SelectionBar';
import { useDocumentListActions } from '../components/library/useDocumentListActions';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { startScan } from '../services/courses/startScan';
import { searchDocumentsByText } from '../services/persistence/dbService';
import { getMatchSnippet, searchDocuments } from '../services/search/searchService';
import { importExternalFile, LegacyWordDocError } from '../services/files/externalFileService';
import { PICKER_MIME_TYPES } from '../services/documents/formatCapabilities';
import { useAppDispatch, useAppSlices, useAppStore } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import { useT } from '../i18n/useT';

export function LibraryScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const store = useAppStore();
  const { loadStatus, files, selection, selMode, tab, search, searchOpen, searchResultIds } = state.library;
  const { selectedDocs, handlePressRow, handleLongPress, handleSelectionTool, overlays } = useDocumentListActions();
  const [typeFilter, setTypeFilter] = useState<DocType | null>(null);
  const [submittedFilter, setSubmittedFilter] = useState<SubmittedFilter>('all');
  // K6: search results by course; archived documents are hidden from the lists (not from search).
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const searching = search.trim() !== '';
  useEffect(() => {
    if (!searching) setCourseFilter(null);
  }, [searching]);

  // §5 T2: the pages that match, under the documents. Same debounce as the document search.
  const [pageHits, setPageHits] = useState<PageHit[]>([]);
  const openDocument = useOpenDocument();
  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setPageHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPages(query, {
        courseId: courseFilter === null ? undefined : courseFilter === UNSORTED_COURSE_ID ? null : courseFilter,
        type: typeFilter ?? undefined,
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
  }, [search, courseFilter, typeFilter]);
  const submittedIds = useMemo(() => new Set(state.library.submissions.map((s) => s.documentId)), [state.library.submissions]);
  const bookmarkedIds = useMemo(() => new Set(state.library.bookmarks.map((b) => b.documentId)), [state.library.bookmarks]);

  useEffect(() => {
    const query = search.trim();
    if (!query) return;
    const timer = setTimeout(() => {
      searchDocumentsByText(query)
        .then((ids) => dispatch({ type: 'library/SET_SEARCH_RESULT_IDS', ids }))
        .catch((e) => {
          console.warn('dbService.searchDocumentsByText failed', e);
          dispatch({ type: 'library/SET_SEARCH_RESULT_IDS', ids: null });
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [search, dispatch]);

  // The tab's documents after search; the type chips count these, then filter them.
  const searchedFiles = useMemo(() => {
    // The Courses tab shows the course list; a course's documents are on its own page (CourseScreen).
    const tabbed = tab === 'starred' ? files.filter((f) => f.star) : files;
    if (!search.trim()) return showArchived ? tabbed : tabbed.filter((f) => !f.archived);
    if (searchResultIds === null) return searchDocuments(tabbed, search);
    const idSet = new Set(searchResultIds);
    return tabbed.filter((f) => idSet.has(f.id));
  }, [files, tab, search, searchResultIds, showArchived]);

  const archivedCount = useMemo(
    () => (tab === 'starred' ? files.filter((f) => f.star) : files).filter((f) => f.archived).length,
    [files, tab]
  );
  const courseColorOf = useCallback(
    (courseId: string | undefined) => {
      const course = courseId ? state.library.courses.find((c) => c.id === courseId) : undefined;
      return course ? courseColorValue(course.color, tokens) : undefined;
    },
    [state.library.courses, tokens]
  );

  const visibleFiles = useMemo(() => {
    const byCourse =
      searching && courseFilter
        ? searchedFiles.filter((f) => (courseFilter === UNSORTED_COURSE_ID ? !f.courseId : f.courseId === courseFilter))
        : searchedFiles;
    const typed = typeFilter ? byCourse.filter((f) => docTypeOf(f) === typeFilter) : byCourse;
    if (submittedFilter === 'all') return typed;
    if (submittedFilter === 'bookmarked') return typed.filter((f) => bookmarkedIds.has(f.id));
    return typed.filter((f) => submittedIds.has(f.id) === (submittedFilter === 'submitted'));
  }, [searchedFiles, searching, courseFilter, typeFilter, submittedFilter, submittedIds, bookmarkedIds]);

  const courseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach((f) => {
      if (f.courseId) counts[f.courseId] = (counts[f.courseId] ?? 0) + 1;
    });
    return counts;
  }, [files]);

  const unsortedCount = useMemo(() => files.filter((f) => !f.courseId).length, [files]);



  const handleOpenFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: [...PICKER_MIME_TYPES], copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    try {
      const ext = await importExternalFile(result.assets[0].uri, {
        originalFileName: result.assets[0].name,
        mimeType: result.assets[0].mimeType,
      });
      dispatch({ type: 'reader/SET_EXTERNAL', doc: ext });
      go('reader');
    } catch (e) {
      console.warn('LibraryScreen.handleOpenFile failed', e);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t(e instanceof LegacyWordDocError ? 'reader.docUnsupported' : 'library.openFailed') });
    }
  }, [dispatch, go]);


  const isEmptyLibrary = files.length === 0;
  const isNoResults = !isEmptyLibrary && visibleFiles.length === 0 && search.trim().length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      {!selMode ? (
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('library.title')}</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton} onPress={handleOpenFile} accessibilityRole="button" accessibilityLabel={t('library.openFile')}>
              <Ionicons name="document-outline" size={21} color={tokens.ink} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => dispatch({ type: 'library/TOGGLE_SEARCH_OPEN' })}
              accessibilityRole="button"
              accessibilityLabel={t('library.search')}
            >
              <Ionicons name="search" size={21} color={tokens.ink} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => go('settings')} accessibilityRole="button" accessibilityLabel={t('common.settings')}>
              <Ionicons name="settings-outline" size={21} color={tokens.ink} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.selectionHeader}>
          <Pressable
            style={[styles.clearButton, { backgroundColor: tokens.surface2 }]}
            onPress={() => dispatch({ type: 'library/CLEAR_SELECTION' })}
            accessibilityRole="button"
            accessibilityLabel={t('library.clearSelection')}
          >
            <Ionicons name="close" size={20} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.selectionTitle, { color: tokens.ink }]}>{t('library.selected', { count: selection.length })}</Text>
        </View>
      )}

      {searchOpen && (
        <SearchBar value={search} onChange={(value) => dispatch({ type: 'library/SET_SEARCH', search: value })} />
      )}

      <LibraryTabs value={tab} onChange={(value) => dispatch({ type: 'library/SET_TAB', tab: value })} />

      {loadStatus === 'failed' ? (
        <EmptyState
          title={t('library.loadFailed')}
          body={t('library.loadFailedBody')}
          actionLabel={t('library.tryAgain')}
          onAction={() => dispatch({ type: 'library/RETRY_LOAD' })}
        />
      ) : tab === 'courses' ? (
        <ScrollView>
          <CourseList
            counts={courseCounts}
            unsortedCount={unsortedCount}
            onOpenCourse={(id) => {
              dispatch({ type: 'library/SET_ACTIVE_COURSE', id });
              go('course');
            }}
          />
        </ScrollView>
      ) : isEmptyLibrary ? (
        <EmptyState
          title={t('library.empty')}
          actionLabel={t('library.scanNow')}
          onAction={() => {
            startScan(store.getState(), dispatch, null, { launch: true });
            go('capture');
          }}
        />
      ) : isNoResults ? (
        <EmptyState
          title={t('library.noMatch', { query: search })}
          body={t('library.noMatchBody')}
        />
      ) : (
        <>
          {searching ? (
            <CourseFilterChips docs={searchedFiles} courses={state.library.courses} value={courseFilter} onChange={setCourseFilter} />
          ) : null}
          <DocTypeFilterChips docs={searchedFiles} value={typeFilter} onChange={setTypeFilter} />
          {submittedIds.size > 0 || bookmarkedIds.size > 0 ? (
            <SubmittedFilterChips
              value={submittedFilter}
              onChange={setSubmittedFilter}
              showSubmitted={submittedIds.size > 0}
              showBookmarked={bookmarkedIds.size > 0}
            />
          ) : null}
          <FlatList
            data={visibleFiles}
            keyExtractor={(doc) => doc.id}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              searching ? (
                <PageResults
                  hits={pageHits}
                  docs={files}
                  onOpen={(doc, hit) => {
                    openDocument(doc);
                    dispatch({ type: 'reader/SET_TARGET', target: { pageId: hit.pageId, query: search.trim() } });
                  }}
                  onAddAll={() => {
                    const firstDoc = files.find((f) => f.id === pageHits[0]?.documentId);
                    dispatch({
                      type: 'pack/ADD',
                      items: pageHits.map((h) => ({ documentId: h.documentId, pageId: h.pageId })),
                      courseId: courseFilter && courseFilter !== UNSORTED_COURSE_ID ? courseFilter : (firstDoc?.courseId ?? null),
                    });
                    dispatch({
                      type: 'ui/SHOW_SNACK',
                      msg: t('library.addedToPack', { count: pageHits.length }),
                      action: t('library.open'),
                      onAction: () => go('examPack'),
                    });
                  }}
                />
              ) : archivedCount > 0 ? (
                <Pressable style={styles.archivedToggle} onPress={() => setShowArchived((v) => !v)} accessibilityRole="button">
                  <Text style={[styles.archivedToggleLabel, { color: tokens.accentInk }]}>
                    {showArchived ? t('library.hideArchived') : t('library.showArchived', { count: archivedCount })}
                  </Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => (
              <FileRow
                doc={item}
                selected={selection.includes(item.id)}
                selectionMode={selMode}
                matchSnippet={getMatchSnippet(item, search)}
                courseColor={courseColorOf(item.courseId)}
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
      ) : (
        <TabBar
          active="library"
          background={tokens.surface}
          activeColor={tokens.ink}
          inactiveColor={tokens.muted}
          accent={tokens.accent}
        />
      )}

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
    justifyContent: 'space-between',
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 26,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionTitle: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  archivedToggle: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  archivedToggleLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
