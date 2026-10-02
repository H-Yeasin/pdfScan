import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchTextDirect, type PDFSearchResultItem } from 'react-native-pdf-jsi';
import { DocTypePickerModal } from '../components/courses/DocTypeChips';
import { OverflowSheet, type OverflowItemId } from '../components/reader/OverflowSheet';
import { docTypeOf, getDocType } from '../services/courses/docTypes';
import { PdfPageView, type PdfPageViewHandle } from '../components/reader/PdfPageView';
import { ReaderActionBar } from '../components/reader/ReaderActionBar';
import { ReaderBottomChrome } from '../components/reader/ReaderBottomChrome';
import { ReaderTopChrome } from '../components/reader/ReaderTopChrome';
import { SheetView } from '../components/reader/SheetView';
import { TxtView } from '../components/reader/TxtView';
import { DocxView } from '../components/reader/DocxView';
import { usePageImage } from '../components/shared/usePageImage';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignatureModal } from '../components/shared/SignatureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { useRouter } from '../navigation/router';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import {
  applySignedPage,
  applySignatureToDocument,
  promoteExternalToLibrary,
} from '../services/persistence/libraryOperations';
import { ensureDocumentPdf } from '../services/pdf/pdfService';
import { printDocument, printFileUri, shareAs, shareDocument, shareFileName, shareFileUri } from '../services/sharing/shareService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { canFindInDoc, canSign, canSubmit, hasPageMasters, isPageRasterFormat } from '../services/documents/formatCapabilities';
import { useShareSubmission, useSubmitDocument } from '../store/useSubmitDocument';
import { SubmissionsSheet } from '../components/submit/SubmissionsSheet';
import { submittedSummary } from '../services/submit/history';
import { formatShortDate } from '../utils/format';
import { libraryIdxFor, pdfPageFor } from '../services/documents/pageMap';
import * as Clipboard from 'expo-clipboard';
import { SelectTextSheet } from '../components/reader/SelectTextSheet';
import { AnnotateSheet } from '../components/reader/AnnotateSheet';
import { BookmarksSheet } from '../components/bookmarks/BookmarkList';
import { documentBookmarks } from '../services/study/bookmarks';
import { TextPromptModal } from '../components/shared/TextPromptModal';
import { createId } from '../utils/id';
import { writeDocumentText } from '../services/study/textExport';
import { extractDocumentText } from '../services/study/textSelection';
import { MIME_BY_FORMAT } from '../utils/docFormat';
import { useAppState } from '../store/AppStateContext';
import { spacing, useTheme } from '../theme';
import { useT } from '../i18n/useT';

const SEARCH_DEBOUNCE_MS = 200;

export function ReaderScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  // Back returns to wherever the document was opened from: Home, Library or a course page.
  const { go, hub } = useRouter();
  const { state, dispatch } = useAppState();

  const external = state.reader.external;
  const doc = state.library.files.find((f) => f.id === state.reader.readerId);
  const submit = useSubmitDocument();
  const shareSubmission = useShareSubmission();
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const docSubmissions = useMemo(
    () => (doc ? state.library.submissions.filter((s) => s.documentId === doc.id) : []),
    [doc, state.library.submissions]
  );
  const night = state.reader.night;
  const format = external?.format ?? doc?.format;
  const isPageRaster = format ? isPageRasterFormat(format) : false;
  const signVisible = !external && !!doc && canSign(doc);

  const chromeVisible = useRef(new Animated.Value(1)).current;
  const [chrome, setChrome] = useState(true);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PDFSearchResultItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [backfilling, setBackfilling] = useState(false);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const [localMatchCount, setLocalMatchCount] = useState(0);
  // §5 T2: the PDF page a page search result opened on. While set, Find searches only that page
  // (fast) and stays there; typing a new query searches the whole document again.
  const [targetPage, setTargetPage] = useState<number | null>(null);
  // §5 T3: the library page open in "Select text", or null.
  const [selectTextIdx, setSelectTextIdx] = useState<number | null>(null);
  // §5 T4: the library page "Annotate" opened on, or null.
  const [annotateIdx, setAnnotateIdx] = useState<number | null>(null);
  // §5 T5: bookmarks of this document, and the one on the page on screen.
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [labelling, setLabelling] = useState(false);
  const docBookmarks = useMemo(() => (doc ? documentBookmarks(state.library.bookmarks, doc) : []), [doc, state.library.bookmarks]);
  const currentIdx = doc ? libraryIdxFor(doc, activeIndex + 1) : 0;
  const currentBookmark = doc ? state.library.bookmarks.find((b) => b.documentId === doc.id && b.pageId === doc.pages[currentIdx]?.id) : undefined;
  const addBookmark = (label?: string) => {
    if (!doc?.pages[currentIdx]) return;
    dispatch({
      type: 'library/ADD_BOOKMARK',
      bookmark: { id: createId('bookmark'), documentId: doc.id, pageId: doc.pages[currentIdx].id, label: label?.trim() || undefined, createdAt: Date.now() },
    });
  };
  const pdfRef = useRef<PdfPageViewHandle>(null);

  // pdfUri is reserved for the PdfPageView path (PDF/JPG - both are ultimately rendered from a
  // compiled PDF, see buildPdfFromPages). nativeUri is for every other format's own viewer, reading
  // straight from the copied source file instead of a PDF conversion that doesn't exist for them.
  const pdfUri = isPageRaster ? (external?.uri ?? doc?.pdfUri) : undefined;
  const nativeUri = !isPageRaster ? (external?.uri ?? doc?.contentUri) : undefined;
  const title = external?.name ?? doc?.name ?? '';
  const pdfId = external?.uri ?? doc?.id ?? '';
  const contentKey = pdfUri ?? nativeUri;

  useEffect(() => {
    Animated.timing(chromeVisible, { toValue: chrome ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [chrome, chromeVisible]);

  // Backfills document.pdf for a library doc saved before every doc always got one. A no-op for
  // anything saved after that change shipped (doc.pdfUri is already set), and for any non-raster
  // format (DOCX/XLSX/CSV/TXT), which never gets a pdfUri at all - ensureDocumentPdf assumes a
  // pages[] of real raster images to compile, which those formats don't have.
  useEffect(() => {
    if (!doc || external || doc.pdfUri || !isPageRaster) return;
    let cancelled = false;
    setBackfilling(true);
    ensureDocumentPdf(doc).then((updated) => {
      if (cancelled) return;
      dispatch({ type: 'library/UPDATE_FILE', id: updated.id, patch: updated });
      setBackfilling(false);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, external, isPageRaster, dispatch]);

  // Resets all per-document viewer state when a different document/external file is opened.
  useEffect(() => {
    setPageCount(0);
    setActiveIndex(0);
    setFindOpen(false);
    setFindQuery('');
    setSearchResults([]);
    setLocalMatchCount(0);
    setPassword(undefined);
    setPasswordDraft('');
    setNeedsPassword(false);
    setReloadKey(0);
    setTargetPage(null);
  }, [contentKey]);

  // A page search result: once the PDF has loaded, jump to that library page's PDF page and
  // highlight the query there.
  const target = state.reader.target;
  useEffect(() => {
    if (!target || !doc || pageCount === 0) return;
    dispatch({ type: 'reader/SET_TARGET', target: null });
    const idx = doc.pages.findIndex((p) => p.id === target.pageId);
    if (idx < 0) return;
    const { page } = pdfPageFor(doc, idx);
    setTargetPage(page);
    pdfRef.current?.goToPage(page);
    if (target.query) {
      setFindOpen(true);
      setFindQuery(target.query);
    }
  }, [target, doc, pageCount, dispatch]);

  useEffect(() => {
    const query = findQuery.trim();
    if (!query || !pdfUri) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [from, to] = targetPage ? [targetPage, targetPage] : [1, Math.max(pageCount, 1)];
        const results = await searchTextDirect(pdfId, query, from, to);
        setSearchResults(results);
        if (targetPage) pdfRef.current?.goToPage(targetPage);
        else if (results[0]) pdfRef.current?.goToPage(results[0].page);
      } catch (e) {
        console.warn('ReaderScreen: searchTextDirect failed', e);
        setSearchResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [findQuery, pdfUri, pdfId, pageCount, targetPage]);

  const highlightRects = useMemo(
    () => searchResults.map((r) => ({ page: r.page, rect: r.rect })),
    [searchResults]
  );

  const handleLoad = useCallback((count: number) => {
    setPageCount(count);
    setNeedsPassword(false);
  }, []);

  const handlePageChanged = useCallback((page: number, count: number) => {
    setActiveIndex(page - 1);
    setPageCount(count);
  }, []);

  const handleTap = useCallback(() => setChrome((v) => !v), []);

  const handlePdfError = useCallback(() => {
    // This package's onError is an opaque `object` with no confirmed error-code shape for the
    // installed version, so a password prompt is the best-effort default for any load failure
    // rather than only ones confirmed to be password-related.
    setNeedsPassword(true);
  }, []);

  const handleSubmitPassword = useCallback(() => {
    setPassword(passwordDraft);
    setNeedsPassword(false);
    setReloadKey((k) => k + 1);
  }, [passwordDraft]);

  const handleOverflowSelect = useCallback(
    async (id: OverflowItemId) => {
      if (id === 'share') {
        if (external) await shareFileUri(external.uri, MIME_BY_FORMAT[external.format], external.name);
        else if (doc) await shareDocument(doc);
      } else if (id === 'print') {
        if (external) await printFileUri(external.uri);
        else if (doc) await printDocument(doc);
      } else if (id === 'export') {
        // A library PDF is shared under the document's name, not as `document.pdf` (see
        // shareAs); an external file already has its own name.
        if (external && pdfUri) await shareFileUri(pdfUri, 'application/pdf', title);
        else if (pdfUri) await shareAs(pdfUri, shareFileName(title, 'pdf'), 'application/pdf');
      } else if (id === 'sign') {
        if (!doc || !signVisible) return;
        if (doc.format === 'PDF') {
          if (state.signature.saved) {
            setCapturedSignature(state.signature.saved);
            setSignStep('place');
          } else {
            setSignStep('capture');
          }
        } else {
          setSigning(true);
        }
      } else if (id === 'addToLibrary') {
        if (!external) return;
        const promoted = await promoteExternalToLibrary(external);
        dispatch({ type: 'library/ADD_FILE', file: promoted });
        dispatch({ type: 'reader/SET_READER_ID', id: promoted.id });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.addedToLibrary') });
      } else if (id === 'changeType') {
        if (doc) setTypePickerOpen(true);
      } else if (id === 'submit') {
        if (doc) await submit(doc);
      } else if (id === 'bookmarks') {
        setBookmarksOpen(true);
      } else if (id === 'annotate') {
        if (doc) setAnnotateIdx(libraryIdxFor(doc, activeIndex + 1));
      } else if (id === 'selectText' || id === 'copyText' || id === 'extractText') {
        if (!doc) return;
        // The library page on screen (on a 2-up sheet, its left page).
        const idx = libraryIdxFor(doc, activeIndex + 1);
        if (id === 'selectText') {
          setSelectTextIdx(idx);
        } else if (id === 'copyText') {
          const text = doc.pages[idx]?.ocr?.text.trim() ?? '';
          if (!text) {
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.noPageText') });
            return;
          }
          await Clipboard.setStringAsync(text);
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.copiedPage', { page: idx + 1 }) });
        } else {
          Alert.alert(t('reader.extractTitle'), t('reader.extractBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('reader.copy'),
              onPress: async () => {
                await Clipboard.setStringAsync(extractDocumentText(doc));
                dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.copiedAll') });
              },
            },
            { text: t('reader.shareTxt'), onPress: () => shareAs(writeDocumentText(doc), shareFileName(doc.name, 'txt'), 'text/plain') },
          ]);
        }
      } else if (id === 'delete') {
        if (!doc) return;
        Alert.alert(
          t('reader.deleteTitle'),
          t('reader.deleteBody', { name: doc.name }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('reader.delete'),
              style: 'destructive',
              onPress: () => {
                dispatch({ type: 'library/REMOVE_FILES', ids: [doc.id] });
                deleteDocumentFiles(doc.id);
                go(hub, 'back');
              },
            },
          ]
        );
      }
    },
    [doc, external, pdfUri, title, signVisible, dispatch, go, hub, state.signature.saved, submit, activeIndex]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!doc) return;
      const updated = await applySignedPage(
        doc,
        activeIndex,
        flattenedUri,
        state.library.annotations.filter((a) => a.documentId === doc.id)
      );
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSigning(false);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.signedPage', { page: activeIndex + 1 }) });
    },
    [doc, activeIndex, dispatch]
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
  }, []);

  // The page the signature is placed on: its master, or for an imported PDF the page rendered now.
  const signPage = usePageImage(doc, activeIndex, signStep === 'place');

  const handlePlacementConfirm = useCallback(
    async (placement: { originX: number; originY: number; width: number; height: number }) => {
      if (!doc || !capturedSignature || !signPage) return;
      const updated = await applySignatureToDocument(doc, activeIndex, capturedSignature.uri, placement, signPage);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSignStep(null);
      setCapturedSignature(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.added') });
    },
    [doc, activeIndex, capturedSignature, signPage, dispatch]
  );

  if (!doc && !external) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.notFound')}</Text>
      </View>
    );
  }

  if (doc && !external && isPageRaster && !pdfUri) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{backfilling ? t('reader.preparingPreview') : t('reader.loading')}</Text>
      </View>
    );
  }

  if (doc && !external && !isPageRaster && !nativeUri) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.loading')}</Text>
      </View>
    );
  }

  const matchCount = isPageRaster ? searchResults.length : localMatchCount;

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {isPageRaster ? (
        <PdfPageView
          key={`${pdfUri}:${reloadKey}`}
          ref={pdfRef}
          uri={pdfUri!}
          pdfId={pdfId}
          password={password}
          night={night}
          highlightRects={highlightRects}
          onLoad={handleLoad}
          onPageChanged={handlePageChanged}
          onTap={handleTap}
          onError={handlePdfError}
        />
      ) : format === 'CSV' || format === 'XLSX' || format === 'XLS' ? (
        <SheetView
          key={nativeUri}
          uri={nativeUri!}
          format={format}
          night={night}
          findQuery={findQuery}
          onMatchCount={setLocalMatchCount}
          onTap={handleTap}
        />
      ) : format === 'TXT' ? (
        <TxtView
          key={nativeUri}
          uri={nativeUri!}
          night={night}
          findQuery={findQuery}
          onMatchCount={setLocalMatchCount}
          onTap={handleTap}
        />
      ) : format === 'DOCX' ? (
        <DocxView key={nativeUri} uri={nativeUri!} night={night} />
      ) : format === 'DOC' ? (
        // Only on documents added before R5 dropped .doc; there's no viewer for it.
        <View style={styles.unsupported}>
          <Text style={[styles.unsupportedText, { color: tokens.muted }]}>{t('reader.docUnsupported')}</Text>
        </View>
      ) : null}

      {needsPassword && (
        <View style={styles.passwordOverlay} pointerEvents="box-none">
          <View style={[styles.passwordCard, { backgroundColor: tokens.surface }]}>
            <Text style={[styles.passwordTitle, { color: tokens.ink }]}>
              {t('reader.passwordTitle')}
            </Text>
            <TextInput
              style={[styles.passwordInput, { color: tokens.ink, borderColor: tokens.edge }]}
              placeholder={t('reader.password')}
              placeholderTextColor={tokens.muted}
              secureTextEntry
              value={passwordDraft}
              onChangeText={setPasswordDraft}
              onSubmitEditing={handleSubmitPassword}
            />
            <View style={styles.passwordActions}>
              <Pressable onPress={() => go(hub, 'back')}>
                <Text style={{ color: tokens.muted }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleSubmitPassword}>
                <Text style={{ color: tokens.accent, fontWeight: '600' }}>{t('reader.unlock')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ReaderTopChrome
        visible={chromeVisible}
        name={title}
        onBack={() => go(hub, 'back')}
        onOverflow={() => setOverflowOpen(true)}
        findOpen={findOpen}
        findQuery={findQuery}
        onChangeFindQuery={(value) => {
          setTargetPage(null);
          setFindQuery(value);
        }}
        matchCount={matchCount}
        subtitle={submittedSummary(docSubmissions, formatShortDate)}
        onSubtitlePress={() => setSubmissionsOpen(true)}
        bookmarked={doc && !external && isPageRaster ? !!currentBookmark : undefined}
        onBookmark={() => {
          if (currentBookmark) dispatch({ type: 'library/REMOVE_BOOKMARK', id: currentBookmark.id });
          else addBookmark();
        }}
        onBookmarkLongPress={() => setLabelling(true)}
      />

      <ReaderBottomChrome
        visible={chromeVisible}
        pageCount={pageCount}
        activeIndex={activeIndex}
        onFind={() => setFindOpen((v) => !v)}
        findOpen={findOpen}
        showFind={!!format && canFindInDoc(format)}
        onNight={() => dispatch({ type: 'reader/TOGGLE_NIGHT' })}
        nightOn={night}
      />

      <ReaderActionBar
        visible={chromeVisible}
        onPress={handleOverflowSelect}
        hiddenIds={[...(signVisible ? [] : (['sign'] as const)), ...(isPageRaster ? [] : (['export'] as const))]}
      />

      {doc ? (
        <DocTypePickerModal
          visible={typePickerOpen}
          title={t('reader.changeType')}
          value={docTypeOf(doc)}
          onSelect={(docType) => {
            dispatch({ type: 'library/SET_DOC_TYPE', ids: [doc.id], docType });
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.typeSet', { type: t(getDocType(docType).labelKey) }) });
          }}
          onClose={() => setTypePickerOpen(false)}
        />
      ) : null}

      <SubmissionsSheet
        visible={submissionsOpen}
        submissions={docSubmissions}
        onShareAgain={(s) => {
          setSubmissionsOpen(false);
          shareSubmission(s);
        }}
        onClose={() => setSubmissionsOpen(false)}
      />

      <OverflowSheet
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        onSelect={handleOverflowSelect}
        showDelete={!external}
        showAddToLibrary={!!external}
        showSubmit={!external && !!doc && canSubmit(doc)}
        showText={!external && !!doc && hasPageMasters(doc)}
      />

      <BookmarksSheet
        visible={bookmarksOpen}
        items={docBookmarks}
        onOpen={(item) => {
          setBookmarksOpen(false);
          if (doc) pdfRef.current?.goToPage(pdfPageFor(doc, item.idx).page);
        }}
        onRemove={(item) => dispatch({ type: 'library/REMOVE_BOOKMARK', id: item.bookmark.id })}
        onClose={() => setBookmarksOpen(false)}
      />

      <TextPromptModal
        visible={labelling}
        title={currentBookmark ? t('reader.bookmarkLabel') : t('reader.bookmarkPage')}
        initialValue={currentBookmark?.label ?? ''}
        placeholder={t('reader.bookmarkPlaceholder')}
        submitLabel={t('reader.save')}
        onCancel={() => setLabelling(false)}
        onSubmit={(label) => {
          setLabelling(false);
          if (currentBookmark) dispatch({ type: 'library/UPDATE_BOOKMARK', id: currentBookmark.id, label });
          else addBookmark(label);
        }}
      />

      {doc && annotateIdx !== null ? (
        <AnnotateSheet
          doc={doc}
          startIdx={annotateIdx}
          onClose={(changed) => {
            setAnnotateIdx(null);
            // The PDF view caches the file; reload it to show the new annotations.
            if (changed) setReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {doc && selectTextIdx !== null ? (
        <SelectTextSheet visible doc={doc} pageIdx={selectTextIdx} onClose={() => setSelectTextIdx(null)} />
      ) : null}

      {signing && doc && doc.pages[activeIndex] && (
        <SignatureModal
          visible
          uri={doc.pages[activeIndex].fileUri}
          naturalWidth={doc.pages[activeIndex].width}
          naturalHeight={doc.pages[activeIndex].height}
          onCancel={() => setSigning(false)}
          onConfirm={handleSignConfirm}
        />
      )}

      {signStep === 'capture' && (
        <SignatureCaptureModal visible onCancel={() => setSignStep(null)} onCapture={handleSignatureCaptured} />
      )}

      {signStep === 'place' && capturedSignature && signPage && (
        <SignaturePlacementOverlay
          pageUri={signPage.uri}
          pageNaturalWidth={signPage.width}
          pageNaturalHeight={signPage.height}
          signatureUri={capturedSignature.uri}
          signatureAspectRatio={capturedSignature.aspectRatio}
          onCancel={handlePlacementCancel}
          onConfirm={handlePlacementConfirm}
          onRedraw={handleRedraw}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  unsupported: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  unsupportedText: { textAlign: 'center' },
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  passwordCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  passwordTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  passwordInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  passwordActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
});
