import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/library/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { LibraryTabs } from '../components/library/LibraryTabs';
import { SearchBar } from '../components/library/SearchBar';
import { SelectionBar, type SelectionToolId } from '../components/library/SelectionBar';
import { SignatureModal } from '../components/shared/SignatureModal';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { applySignedPage, compressDocument, mergeDocuments, splitDocument } from '../services/persistence/libraryOperations';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { deleteScannedDocument, insertScannedDocument, searchDocumentsByText } from '../services/persistence/dbService';
import { getMatchSnippet, searchDocuments } from '../services/search/searchService';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import type { LibraryDocument } from '../types/models';

export function LibraryScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { files, selection, selMode, tab, search, searchOpen, searchResultIds } = state.library;
  const [signTarget, setSignTarget] = useState<LibraryDocument | null>(null);

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

  const visibleFiles = useMemo(() => {
    const tabbed = tab === 'starred' ? files.filter((f) => f.star) : files;
    if (!search.trim()) return tabbed;
    if (searchResultIds === null) return searchDocuments(tabbed, search);
    const idSet = new Set(searchResultIds);
    return tabbed.filter((f) => idSet.has(f.id));
  }, [files, tab, search, searchResultIds]);

  const handlePressRow = useCallback(
    (doc: LibraryDocument) => {
      if (selMode) {
        dispatch({ type: 'library/TOGGLE_SELECTION', id: doc.id });
        return;
      }
      dispatch({ type: 'reader/SET_READER_ID', id: doc.id });
      go('reader');
    },
    [selMode, dispatch, go]
  );

  const handleLongPress = useCallback(
    (doc: LibraryDocument) => {
      dispatch({ type: 'library/SET_SEL_MODE', on: true });
      dispatch({ type: 'library/TOGGLE_SELECTION', id: doc.id });
    },
    [dispatch]
  );

  const handleSelectionTool = useCallback(
    async (id: SelectionToolId) => {
      const selectedDocs = files.filter((f) => selection.includes(f.id));
      if (selectedDocs.length === 0) return;

      if (id === 'merge' && selectedDocs.length >= 2) {
        const merged = await mergeDocuments(selectedDocs);
        selectedDocs.forEach((doc) => deleteDocumentFiles(doc.id));
        dispatch({ type: 'library/REPLACE_FILES', ids: selection, files: [merged] });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: `${selectedDocs.length} files merged` });
        selectedDocs.forEach((doc) => deleteScannedDocument(doc.id).catch((e) => console.warn('db delete failed', e)));
        insertScannedDocument(merged).catch((e) => console.warn('db insert failed', e));
      } else if (id === 'split' && selectedDocs.length === 1) {
        const [doc] = selectedDocs;
        const split = await splitDocument(doc);
        deleteDocumentFiles(doc.id);
        dispatch({ type: 'library/REPLACE_FILES', ids: [doc.id], files: split });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: `Split into ${split.length} files` });
        deleteScannedDocument(doc.id).catch((e) => console.warn('db delete failed', e));
        split.forEach((d) => insertScannedDocument(d).catch((e) => console.warn('db insert failed', e)));
      } else if (id === 'compress') {
        for (const doc of selectedDocs) {
          const compressed = await compressDocument(doc);
          dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: compressed });
          insertScannedDocument(compressed).catch((e) => console.warn('db insert failed', e));
        }
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: 'Compressed · done' });
      } else if (id === 'protect') {
        selectedDocs.forEach((doc) => dispatch({ type: 'library/TOGGLE_LOCKED', id: doc.id }));
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: 'Protect only marks the file — it does not encrypt it yet' });
      } else if (id === 'sign' && selectedDocs.length === 1) {
        setSignTarget(selectedDocs[0]);
      }
    },
    [files, selection, dispatch]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!signTarget) return;
      const updated = await applySignedPage(signTarget, 0, flattenedUri);
      dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      dispatch({ type: 'library/CLEAR_SELECTION' });
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Signed · page 1' });
      insertScannedDocument(updated).catch((e) => console.warn('db insert failed', e));
    },
    [signTarget, dispatch]
  );

  const isEmptyLibrary = files.length === 0;
  const isNoResults = !isEmptyLibrary && visibleFiles.length === 0 && search.trim().length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      {!selMode ? (
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.ink }]}>Library</Text>
          <View style={styles.headerIcons}>
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

      {isEmptyLibrary ? (
        <EmptyState
          title="Your scans will appear here."
          actionLabel="Scan now"
          onAction={() => go('capture')}
        />
      ) : isNoResults ? (
        <EmptyState
          title={`No documents match "${search}".`}
          body="Search also looks inside scans — OCR text is indexed for every document, free."
        />
      ) : (
        <FlatList
          data={visibleFiles}
          keyExtractor={(doc) => doc.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <FileRow
              doc={item}
              selected={selection.includes(item.id)}
              selectionMode={selMode}
              matchSnippet={getMatchSnippet(item, search)}
              onPress={() => handlePressRow(item)}
              onLongPress={() => handleLongPress(item)}
              onToggleStar={() => dispatch({ type: 'library/TOGGLE_STAR', id: item.id })}
            />
          )}
        />
      )}

      {selMode ? (
        <SelectionBar selectionCount={selection.length} onPress={handleSelectionTool} />
      ) : (
        <TabBar
          active="library"
          background={tokens.surface}
          activeColor={tokens.ink}
          inactiveColor={tokens.muted}
          accent={tokens.accent}
        />
      )}

      {signTarget && (
        <SignatureModal
          visible
          uri={signTarget.pages[0].fileUri}
          naturalWidth={signTarget.pages[0].width}
          naturalHeight={signTarget.pages[0].height}
          onCancel={() => setSignTarget(null)}
          onConfirm={handleSignConfirm}
        />
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
});
