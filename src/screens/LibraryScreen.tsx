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
import { importExternalFile } from '../services/files/externalFileService';
import { MIME_BY_FORMAT } from '../utils/docFormat';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';

// Formats reachable via the in-app picker today. Widens as DOCX/XLSX/XLS viewers land (see the
// universal-reader plan's phasing) - deliberately narrower than docFormat.ts's full MIME_BY_FORMAT
// map so the picker never lets someone select a format with no viewer built yet.
const PICKABLE_MIME_TYPES = [MIME_BY_FORMAT.PDF, MIME_BY_FORMAT.TXT, MIME_BY_FORMAT.CSV];

export function LibraryScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
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
  const submittedIds = useMemo(() => new Set(state.library.submissions.map((s) => s.documentId)), [state.library.submissions]);

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
    return typed.filter((f) => submittedIds.has(f.id) === (submittedFilter === 'submitted'));
  }, [searchedFiles, searching, courseFilter, typeFilter, submittedFilter, submittedIds]);

  const courseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach((f) => {
      if (f.courseId) counts[f.courseId] = (counts[f.courseId] ?? 0) + 1;
    });
    return counts;
  }, [files]);

  const unsortedCount = useMemo(() => files.filter((f) => !f.courseId).length, [files]);



  const handleOpenFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: PICKABLE_MIME_TYPES, copyToCacheDirectory: true });
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
      dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't open that file" });
    }
  }, [dispatch, go]);


  const isEmptyLibrary = files.length === 0;
  const isNoResults = !isEmptyLibrary && visibleFiles.length === 0 && search.trim().length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      {!selMode ? (
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.ink }]}>Library</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton} onPress={handleOpenFile}>
              <Ionicons name="document-outline" size={21} color={tokens.ink} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => dispatch({ type: 'library/TOGGLE_SEARCH_OPEN' })}
            >
              <Ionicons name="search" size={21} color={tokens.ink} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => go('settings')}>
              <Ionicons name="settings-outline" size={21} color={tokens.ink} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.selectionHeader}>
          <Pressable
            style={[styles.clearButton, { backgroundColor: tokens.surface2 }]}
            onPress={() => dispatch({ type: 'library/CLEAR_SELECTION' })}
          >
            <Ionicons name="close" size={20} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.selectionTitle, { color: tokens.ink }]}>{selection.length} selected</Text>
        </View>
      )}

      {searchOpen && (
        <SearchBar value={search} onChange={(value) => dispatch({ type: 'library/SET_SEARCH', search: value })} />
      )}

      <LibraryTabs value={tab} onChange={(value) => dispatch({ type: 'library/SET_TAB', tab: value })} />

      {loadStatus === 'failed' ? (
        <EmptyState
          title="Couldn't load library"
          body="Your documents are still on this phone. Nothing has been changed."
          actionLabel="Try again"
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
          title="Your scans will appear here."
          actionLabel="Scan now"
          onAction={() => {
            startScan(state, dispatch, null, { launch: true });
            go('capture');
          }}
        />
      ) : isNoResults ? (
        <EmptyState
          title={`No documents match "${search}".`}
          body="Search also looks inside scans — OCR text is indexed for every document, free."
        />
      ) : (
        <>
          {searching ? (
            <CourseFilterChips docs={searchedFiles} courses={state.library.courses} value={courseFilter} onChange={setCourseFilter} />
          ) : null}
          <DocTypeFilterChips docs={searchedFiles} value={typeFilter} onChange={setTypeFilter} />
          {submittedIds.size > 0 ? <SubmittedFilterChips value={submittedFilter} onChange={setSubmittedFilter} /> : null}
          <FlatList
            data={visibleFiles}
            keyExtractor={(doc) => doc.id}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              !searching && archivedCount > 0 ? (
                <Pressable style={styles.archivedToggle} onPress={() => setShowArchived((v) => !v)} accessibilityRole="button">
                  <Text style={[styles.archivedToggleLabel, { color: tokens.accentInk }]}>
                    {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
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
