import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { EmptyState } from '../components/library/EmptyState';
import { FileRow } from '../components/library/FileRow';
import { FolderList, UNSORTED_COURSE_ID } from '../components/library/FolderList';
import { LibraryTabs } from '../components/library/LibraryTabs';
import { SearchBar } from '../components/library/SearchBar';
import { SelectionBar, type SelectionToolId } from '../components/library/SelectionBar';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignatureModal } from '../components/shared/SignatureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import {
  applySignedPage,
  applySignatureToDocument,
  compressDocument,
  mergeDocuments,
  splitDocument,
} from '../services/persistence/libraryOperations';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { searchDocumentsByText } from '../services/persistence/dbService';
import { getMatchSnippet, searchDocuments } from '../services/search/searchService';
import { importExternalFile } from '../services/files/externalFileService';
import { canSign, isPageRasterFormat } from '../services/documents/formatCapabilities';
import { MIME_BY_FORMAT } from '../utils/docFormat';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import type { LibraryDocument } from '../types/models';
import { createId } from '../utils/id';

// Formats reachable via the in-app picker today. Widens as DOCX/XLSX/XLS viewers land (see the
// universal-reader plan's phasing) - deliberately narrower than docFormat.ts's full MIME_BY_FORMAT
// map so the picker never lets someone select a format with no viewer built yet.
const PICKABLE_MIME_TYPES = [MIME_BY_FORMAT.PDF, MIME_BY_FORMAT.TXT, MIME_BY_FORMAT.CSV];

export function LibraryScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { loadStatus, files, courses, activeCourseId, selection, selMode, tab, search, searchOpen, searchResultIds } = state.library;
  const [signTarget, setSignTarget] = useState<LibraryDocument | null>(null);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);

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
    let tabbed = files;
    if (tab === 'starred') tabbed = files.filter((f) => f.star);
    else if (tab === 'courses') {
      if (activeCourseId === UNSORTED_COURSE_ID) tabbed = files.filter((f) => !f.courseId);
      else if (activeCourseId) tabbed = files.filter((f) => f.courseId === activeCourseId);
      else tabbed = [];
    }
    if (!search.trim()) return tabbed;
    if (searchResultIds === null) return searchDocuments(tabbed, search);
    const idSet = new Set(searchResultIds);
    return tabbed.filter((f) => idSet.has(f.id));
  }, [files, tab, activeCourseId, search, searchResultIds]);

  const courseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach((f) => {
      if (f.courseId) counts[f.courseId] = (counts[f.courseId] ?? 0) + 1;
    });
    return counts;
  }, [files]);

  const unsortedCount = useMemo(() => files.filter((f) => !f.courseId).length, [files]);

  const selectedDocs = useMemo(() => files.filter((f) => selection.includes(f.id)), [files, selection]);

  const activeCourseName = useMemo(() => {
    if (activeCourseId === UNSORTED_COURSE_ID) return 'Unsorted';
    return courses.find((c) => c.id === activeCourseId)?.name ?? 'Course';
  }, [activeCourseId, courses]);

  const handleCreateCourse = useCallback(
    (name: string) => dispatch({ type: 'library/CREATE_COURSE', id: createId('course'), name }),
    [dispatch]
  );
  const handleRenameCourse = useCallback(
    (id: string, name: string) => dispatch({ type: 'library/RENAME_COURSE', id, name }),
    [dispatch]
  );
  const handleDeleteCourse = useCallback(
    (id: string) => dispatch({ type: 'library/DELETE_COURSE', id }),
    [dispatch]
  );

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

  const handleLongPress = useCallback(
    (doc: LibraryDocument) => {
      dispatch({ type: 'library/SET_SEL_MODE', on: true });
      dispatch({ type: 'library/TOGGLE_SELECTION', id: doc.id });
    },
    [dispatch]
  );

  const handleSelectionTool = useCallback(
    async (id: SelectionToolId) => {
      if (selectedDocs.length === 0) return;

      if (id === 'merge' && selectedDocs.length >= 2) {
        const merged = await mergeDocuments(selectedDocs);
        selectedDocs.forEach((doc) => deleteDocumentFiles(doc.id));
        dispatch({ type: 'library/REPLACE_FILES', ids: selection, files: [merged] });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: `${selectedDocs.length} files merged` });
      } else if (id === 'split' && selectedDocs.length === 1) {
        const [doc] = selectedDocs;
        const split = await splitDocument(doc);
        deleteDocumentFiles(doc.id);
        dispatch({ type: 'library/REPLACE_FILES', ids: [doc.id], files: split });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: `Split into ${split.length} files` });
      } else if (id === 'compress') {
        for (const doc of selectedDocs) {
          const compressed = await compressDocument(doc);
          dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: compressed });
        }
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: 'Compressed · done' });
      } else if (id === 'sign' && selectedDocs.length === 1 && canSign(selectedDocs[0])) {
        const [target] = selectedDocs;
        setSignTarget(target);
        if (target.format === 'PDF') {
          if (state.signature.saved) {
            setCapturedSignature(state.signature.saved);
            setSignStep('place');
          } else {
            setSignStep('capture');
          }
        }
      }
    },
    [selectedDocs, selection, dispatch, state.signature.saved]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!signTarget) return;
      const updated = await applySignedPage(signTarget, 0, flattenedUri);
      dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      dispatch({ type: 'library/CLEAR_SELECTION' });
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Signed · page 1' });
    },
    [signTarget, dispatch]
  );

  const handleSignatureCaptured = useCallback(
    async (signature: { uri: string; aspectRatio: number }) => {
      const saved = await saveSignatureForReuse(signature.uri, signature.aspectRatio);
      dispatch({ type: 'signature/SET_SAVED', saved });
      setCapturedSignature(saved);
      setSignStep('place');
    },
    [dispatch]
  );

  const handleRedraw = useCallback(() => {
    setSignStep('capture');
  }, []);

  const handlePlacementCancel = useCallback(() => {
    setSignStep(null);
    setCapturedSignature(null);
    setSignTarget(null);
  }, []);

  const handlePlacementConfirm = useCallback(
    async (placement: { originX: number; originY: number; width: number; height: number }) => {
      if (!signTarget || !capturedSignature) return;
      const updated = await applySignatureToDocument(signTarget, 0, capturedSignature.uri, placement);
      dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      dispatch({ type: 'library/CLEAR_SELECTION' });
      setSignStep(null);
      setCapturedSignature(null);
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Signature added — visible in exported PDF' });
    },
    [signTarget, capturedSignature, dispatch]
  );

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
      ) : tab === 'courses' && activeCourseId === null ? (
        <ScrollView>
          <FolderList
            courses={courses}
            counts={courseCounts}
            unsortedCount={unsortedCount}
            onOpenCourse={(id) => dispatch({ type: 'library/SET_ACTIVE_COURSE', id })}
            onCreate={handleCreateCourse}
            onRename={handleRenameCourse}
            onDelete={handleDeleteCourse}
          />
        </ScrollView>
      ) : isEmptyLibrary ? (
        <EmptyState
          title="Your scans will appear here."
          actionLabel="Scan now"
          onAction={() => {
            dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
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
          {tab === 'courses' && (
            <Pressable
              style={styles.folderBack}
              onPress={() => dispatch({ type: 'library/SET_ACTIVE_COURSE', id: null })}
            >
              <Ionicons name="chevron-back" size={18} color={tokens.ink} />
              <Text style={[styles.folderBackLabel, { color: tokens.ink }]}>{activeCourseName}</Text>
            </Pressable>
          )}
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

      {signTarget && signTarget.format === 'JPG' && (
        <SignatureModal
          visible
          uri={signTarget.pages[0].fileUri}
          naturalWidth={signTarget.pages[0].width}
          naturalHeight={signTarget.pages[0].height}
          onCancel={() => setSignTarget(null)}
          onConfirm={handleSignConfirm}
        />
      )}

      {signStep === 'capture' && (
        <SignatureCaptureModal visible onCancel={handlePlacementCancel} onCapture={handleSignatureCaptured} />
      )}

      {signStep === 'place' && signTarget && capturedSignature && (
        <SignaturePlacementOverlay
          pageUri={signTarget.pages[0].fileUri}
          pageNaturalWidth={signTarget.pages[0].width}
          pageNaturalHeight={signTarget.pages[0].height}
          signatureUri={capturedSignature.uri}
          signatureAspectRatio={capturedSignature.aspectRatio}
          onCancel={handlePlacementCancel}
          onConfirm={handlePlacementConfirm}
          onRedraw={handleRedraw}
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
  folderBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  folderBackLabel: {
    fontSize: 16,
    fontWeight: '600',
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
