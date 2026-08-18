import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchTextDirect, type PDFSearchResultItem } from 'react-native-pdf-jsi';
import { OverflowSheet, type OverflowItemId } from '../components/reader/OverflowSheet';
import { PdfPageView, type PdfPageViewHandle } from '../components/reader/PdfPageView';
import { ReaderActionBar } from '../components/reader/ReaderActionBar';
import { ReaderBottomChrome } from '../components/reader/ReaderBottomChrome';
import { ReaderTopChrome } from '../components/reader/ReaderTopChrome';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignatureModal } from '../components/shared/SignatureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { useRouter } from '../navigation/router';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { insertScannedDocument } from '../services/persistence/dbService';
import {
  applySignedPage,
  applySignatureToDocument,
  promoteExternalToLibrary,
} from '../services/persistence/libraryOperations';
import { ensureDocumentPdf } from '../services/pdf/pdfService';
import { printDocument, printFileUri, shareDocument, shareFileUri } from '../services/sharing/shareService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { useAppState } from '../store/AppStateContext';
import { spacing, useTheme } from '../theme';

const SEARCH_DEBOUNCE_MS = 200;

export function ReaderScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();

  const external = state.reader.external;
  const doc = state.library.files.find((f) => f.id === state.reader.readerId);
  const night = state.reader.night;
  const isImportedOrExternal = !!external || doc?.sourceKind === 'imported_pdf';

  const chromeVisible = useRef(new Animated.Value(1)).current;
  const [chrome, setChrome] = useState(true);
  const [overflowOpen, setOverflowOpen] = useState(false);
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
  const pdfRef = useRef<PdfPageViewHandle>(null);

  const pdfUri = external?.uri ?? doc?.pdfUri;
  const title = external?.name ?? doc?.name ?? '';
  const pdfId = external?.uri ?? doc?.id ?? '';

  useEffect(() => {
    Animated.timing(chromeVisible, { toValue: chrome ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [chrome, chromeVisible]);

  // Backfills document.pdf for a library doc saved before every doc always got one. A no-op for
  // anything saved after that change shipped (doc.pdfUri is already set).
  useEffect(() => {
    if (!doc || external || doc.pdfUri) return;
    let cancelled = false;
    setBackfilling(true);
    ensureDocumentPdf(doc, state.settings.ocrScript).then((updated) => {
      if (cancelled) return;
      dispatch({ type: 'library/UPDATE_FILE', id: updated.id, patch: updated });
      insertScannedDocument(updated).catch((e) => console.warn('db insert failed', e));
      setBackfilling(false);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, external, state.settings.ocrScript, dispatch]);

  // Resets all per-document viewer state when a different document/external file is opened.
  useEffect(() => {
    setPageCount(0);
    setActiveIndex(0);
    setFindOpen(false);
    setFindQuery('');
    setSearchResults([]);
    setPassword(undefined);
    setPasswordDraft('');
    setNeedsPassword(false);
    setReloadKey(0);
  }, [pdfUri]);

  useEffect(() => {
    const query = findQuery.trim();
    if (!query || !pdfUri) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchTextDirect(pdfId, query, 1, Math.max(pageCount, 1));
        setSearchResults(results);
        if (results[0]) pdfRef.current?.goToPage(results[0].page);
      } catch (e) {
        console.warn('ReaderScreen: searchTextDirect failed', e);
        setSearchResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [findQuery, pdfUri, pdfId, pageCount]);

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
        if (external) await shareFileUri(external.uri, 'application/pdf', external.name);
        else if (doc) await shareDocument(doc);
      } else if (id === 'print') {
        if (external) await printFileUri(external.uri);
        else if (doc) await printDocument(doc);
      } else if (id === 'export') {
        if (pdfUri) await shareFileUri(pdfUri, 'application/pdf', title);
      } else if (id === 'sign') {
        if (!doc || isImportedOrExternal) return;
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
        insertScannedDocument(promoted).catch((e) => console.warn('db insert failed', e));
        dispatch({ type: 'library/ADD_FILE', file: promoted });
        dispatch({ type: 'reader/SET_READER_ID', id: promoted.id });
        dispatch({ type: 'ui/SHOW_SNACK', msg: 'Added to Library' });
      } else if (id === 'delete') {
        if (!doc) return;
        Alert.alert(
          'Delete document?',
          `"${doc.name}" and its files will be permanently removed. This can't be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                dispatch({ type: 'library/REMOVE_FILES', ids: [doc.id] });
                deleteDocumentFiles(doc.id, doc.courseFolder);
                go('library', 'back');
              },
            },
          ]
        );
      }
    },
    [doc, external, pdfUri, title, isImportedOrExternal, dispatch, go, state.signature.saved]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!doc) return;
      const updated = await applySignedPage(doc, activeIndex, flattenedUri, state.settings.ocrScript);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSigning(false);
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Signed · page ${activeIndex + 1}` });
      insertScannedDocument(updated).catch((e) => console.warn('db insert failed', e));
    },
    [doc, activeIndex, dispatch, state.settings.ocrScript]
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

  const handlePlacementConfirm = useCallback(
    async (placement: { originX: number; originY: number; width: number; height: number }) => {
      if (!doc || !capturedSignature) return;
      const updated = await applySignatureToDocument(doc, activeIndex, capturedSignature.uri, placement);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSignStep(null);
      setCapturedSignature(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Signature added — visible in exported PDF' });
      insertScannedDocument(updated).catch((e) => console.warn('db insert failed', e));
    },
    [doc, activeIndex, capturedSignature, dispatch]
  );

  if (!doc && !external) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>Document not found.</Text>
      </View>
    );
  }

  if (doc && !external && !pdfUri) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{backfilling ? 'Preparing preview…' : 'Loading…'}</Text>
      </View>
    );
  }

  const activePdfUri = pdfUri!;

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <PdfPageView
        key={`${activePdfUri}:${reloadKey}`}
        ref={pdfRef}
        uri={activePdfUri}
        pdfId={pdfId}
        password={password}
        night={night}
        highlightRects={highlightRects}
        onLoad={handleLoad}
        onPageChanged={handlePageChanged}
        onTap={handleTap}
        onError={handlePdfError}
      />

      {needsPassword && (
        <View style={styles.passwordOverlay} pointerEvents="box-none">
          <View style={[styles.passwordCard, { backgroundColor: tokens.surface }]}>
            <Text style={[styles.passwordTitle, { color: tokens.ink }]}>
              Couldn't open this PDF. It may be password protected.
            </Text>
            <TextInput
              style={[styles.passwordInput, { color: tokens.ink, borderColor: tokens.edge }]}
              placeholder="Password"
              placeholderTextColor={tokens.muted}
              secureTextEntry
              value={passwordDraft}
              onChangeText={setPasswordDraft}
              onSubmitEditing={handleSubmitPassword}
            />
            <View style={styles.passwordActions}>
              <Pressable onPress={() => go('library', 'back')}>
                <Text style={{ color: tokens.muted }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSubmitPassword}>
                <Text style={{ color: tokens.accent, fontWeight: '600' }}>Unlock</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ReaderTopChrome
        visible={chromeVisible}
        name={title}
        onBack={() => go('library', 'back')}
        onOverflow={() => setOverflowOpen(true)}
        findOpen={findOpen}
        findQuery={findQuery}
        onChangeFindQuery={setFindQuery}
        matchCount={searchResults.length}
      />

      <ReaderBottomChrome
        visible={chromeVisible}
        pageCount={pageCount}
        activeIndex={activeIndex}
        onFind={() => setFindOpen((v) => !v)}
        findOpen={findOpen}
        onNight={() => dispatch({ type: 'reader/TOGGLE_NIGHT' })}
        nightOn={night}
      />

      <ReaderActionBar
        visible={chromeVisible}
        onPress={handleOverflowSelect}
        hiddenIds={isImportedOrExternal ? ['sign'] : []}
      />

      <OverflowSheet
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        onSelect={handleOverflowSelect}
        showDelete={!external}
        showAddToLibrary={!!external}
      />

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

      {signStep === 'place' && capturedSignature && doc && doc.pages[activeIndex] && (
        <SignaturePlacementOverlay
          pageUri={doc.pages[activeIndex].fileUri}
          pageNaturalWidth={doc.pages[activeIndex].width}
          pageNaturalHeight={doc.pages[activeIndex].height}
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
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordOverlay: {
    ...StyleSheet.absoluteFillObject,
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
