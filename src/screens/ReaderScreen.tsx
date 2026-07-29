import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, View } from 'react-native';
import { OverflowSheet, type OverflowItemId } from '../components/reader/OverflowSheet';
import { PageList, PAGE_SLOT } from '../components/reader/PageList';
import { ReaderBottomChrome } from '../components/reader/ReaderBottomChrome';
import { ReaderTopChrome } from '../components/reader/ReaderTopChrome';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignatureModal } from '../components/shared/SignatureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { useRouter } from '../navigation/router';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { insertScannedDocument } from '../services/persistence/dbService';
import { applySignedPage, applySignatureToDocument } from '../services/persistence/libraryOperations';
import { printDocument, shareDocument, shareFileUri } from '../services/sharing/shareService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { useAppState } from '../store/AppStateContext';
import { useTheme } from '../theme';
import type { LibraryPage } from '../types/models';

const HIDE_CHROME_SCROLL_THRESHOLD = 70;

export function ReaderScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const doc = state.library.files.find((f) => f.id === state.reader.readerId);
  const night = state.reader.night;

  const chromeVisible = useRef(new Animated.Value(1)).current;
  const [chrome, setChrome] = useState(true);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const listRef = useRef<FlatList<LibraryPage>>(null);

  useEffect(() => {
    Animated.timing(chromeVisible, { toValue: chrome ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [chrome, chromeVisible]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const hide = y > HIDE_CHROME_SCROLL_THRESHOLD;
      setChrome((current) => (hide === current ? !hide : current));
      const index = Math.round(y / PAGE_SLOT);
      setActiveIndex((current) => {
        const clamped = Math.max(0, Math.min((doc?.pages.length ?? 1) - 1, index));
        return clamped === current ? current : clamped;
      });
    },
    [doc]
  );

  const matchingIndices = useMemo(() => {
    if (!doc || !findQuery.trim()) return [];
    const q = findQuery.trim().toLowerCase();
    return doc.pages
      .map((page, index) => ({ index, text: page.ocr?.text?.toLowerCase() ?? '' }))
      .filter((p) => p.text.includes(q))
      .map((p) => p.index);
  }, [doc, findQuery]);

  useEffect(() => {
    if (matchingIndices.length > 0) {
      listRef.current?.scrollToIndex({ index: matchingIndices[0], animated: true });
    }
  }, [matchingIndices]);

  const handleOverflowSelect = useCallback(
    async (id: OverflowItemId) => {
      if (!doc) return;
      if (id === 'share') {
        await shareDocument(doc);
      } else if (id === 'print') {
        await printDocument(doc);
      } else if (id === 'export') {
        const page = doc.pages[activeIndex];
        if (page) await shareFileUri(page.fileUri, 'image/jpeg', `${doc.name} - page ${activeIndex + 1}`);
      } else if (id === 'sign') {
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
      } else if (id === 'delete') {
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
                deleteDocumentFiles(doc.id);
                go('library', 'back');
              },
            },
          ]
        );
      }
    },
    [doc, activeIndex, dispatch, go, state.signature.saved]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!doc) return;
      const updated = await applySignedPage(doc, activeIndex, flattenedUri);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSigning(false);
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Signed · page ${activeIndex + 1}` });
      insertScannedDocument(updated).catch((e) => console.warn('db insert failed', e));
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

  if (!doc) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>Document not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: night ? '#0b0a09' : tokens.bg }]}>
      <PageList
        ref={listRef}
        pages={doc.pages}
        night={night}
        onTapCenter={() => setChrome((v) => !v)}
        onScroll={handleScroll}
        highlightedIndex={matchingIndices.includes(activeIndex) ? activeIndex : undefined}
      />

      <ReaderTopChrome
        visible={chromeVisible}
        name={doc.name}
        onBack={() => go('library', 'back')}
        onOverflow={() => setOverflowOpen(true)}
        findOpen={findOpen}
        findQuery={findQuery}
        onChangeFindQuery={setFindQuery}
        matchCount={matchingIndices.length}
      />

      <ReaderBottomChrome
        visible={chromeVisible}
        pageCount={doc.pages.length}
        activeIndex={activeIndex}
        onFind={() => setFindOpen((v) => !v)}
        findOpen={findOpen}
        onNight={() => dispatch({ type: 'reader/TOGGLE_NIGHT' })}
        nightOn={night}
      />

      <OverflowSheet visible={overflowOpen} onClose={() => setOverflowOpen(false)} onSelect={handleOverflowSelect} />

      {signing && doc.pages[activeIndex] && (
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

      {signStep === 'place' && capturedSignature && doc.pages[activeIndex] && (
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
});
