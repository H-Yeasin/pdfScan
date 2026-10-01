import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdjustPanel } from '../components/review/AdjustPanel';
import { ContextBar } from '../components/review/ContextBar';
import { CropOverlay } from '../components/review/CropOverlay';
import { EnhanceSegmented } from '../components/review/EnhanceSegmented';
import { GridPagesModal } from '../components/review/GridPagesModal';
import { PagePeekCarousel } from '../components/review/PagePeekCarousel';
import { PreviewControls } from '../components/review/PreviewControls';
import { ProcessingProgress } from '../components/review/ProcessingProgress';
import { ThumbnailStrip } from '../components/review/ThumbnailStrip';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { useRouter } from '../navigation/router';
import { DEFAULT_ADJUST } from '../services/enhance/adjust';
import { recomposeIdCard, scanIdCardSide } from '../services/capture/idCardPages';
import { cancelProcessing } from '../services/capture/processingSession';
import { compositeHalfPages } from '../services/enhance/compositeHalfPages';
import { warpPerspectiveCrop } from '../services/enhance/perspectiveCrop';
import type { Point } from '../services/enhance/perspective';
import { useEnhancedPreview } from '../services/enhance/useEnhancedPreview';
import { runOcr } from '../services/ocr/ocrService';
import { cleanTemporaryCache } from '../services/persistence/libraryFiles';
import { useAcademicStampPreview } from '../services/pdf/useAcademicPreview';
import { applySignatureToPage } from '../services/signature/signatureCompositeService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import { createId } from '../utils/id';
import type { AdjustValues, EnhanceMode, SessionPage, SourceImage } from '../types/models';

const OCR_SPARSE_THRESHOLD = 6;

type MergeCropState = {
  ids: [string, string];
  stage: 'first' | 'second';
  firstResult?: { uri: string; width: number; height: number };
} | null;

export function ReviewScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages, processingStatus, progress } = state.capture;
  const { sel, ocrRunning } = state.review;
  const scanProcessing = processingStatus === 'scanning' || processingStatus === 'processing';
  const { academicConfig } = state.deliver;
  const [cropTarget, setCropTarget] = useState<string | null>(null);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [mergeCrop, setMergeCrop] = useState<MergeCropState>(null);

  const selectedPage = pages[sel] ?? pages[0];
  const multiPage = pages.length > 1;
  const coverConfig = academicConfig?.coverPage;
  const currentAdjust = selectedPage?.adjust ?? DEFAULT_ADJUST;
  const adjustable = selectedPage?.enhance !== 'document_scan';

  const { previewUri, loading: enhancePreviewLoading } = useEnhancedPreview(
    selectedPage?.uri,
    selectedPage?.enhance ?? 'auto',
    currentAdjust,
    selectedPage?.rotation ?? 0
  );

  // Runs border/header-footer stamping on top of the already-enhanced preview, so this mirrors
  // the real save pipeline's order (bake enhance, then stamp) - not just the raw enhance preview.
  const { previewUri: stampedUri, loading: stampLoading } = useAcademicStampPreview(
    previewUri ?? selectedPage?.uri,
    academicConfig,
    sel + 1,
    pages.length
  );

  const mainPreviewUri = stampedUri ?? selectedPage?.uri;
  const mainPreviewLoading = enhancePreviewLoading || stampLoading;
  const showCompare = !!selectedPage && mainPreviewUri !== selectedPage.uri;
  const displayUri = comparing && selectedPage ? selectedPage.uri : mainPreviewUri ?? selectedPage?.uri;

  // Indeterminate ribbon for OCR and the moment before per-page progress is known; once a batch
  // reports progress, ProcessingProgress (determinate, with Cancel) takes over.
  const showRibbon = ocrRunning || (scanProcessing && !progress);
  const ribbon = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showRibbon) return;
    ribbon.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ribbon, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [showRibbon, ribbon]);

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      dispatch({ type: 'capture/REORDER_PAGES', fromIndex, toIndex });
      dispatch({ type: 'review/SELECT_PAGE', index: toIndex });
    },
    [dispatch]
  );

  const handleDeletePage = useCallback(
    (id: string) => {
      const removedIndex = pages.findIndex((p) => p.id === id);
      if (removedIndex === -1) return;
      dispatch({ type: 'capture/REMOVE_PAGE', id });
      const nextLength = pages.length - 1;
      const nextSel = Math.max(0, Math.min(sel, nextLength - 1));
      dispatch({ type: 'review/SELECT_PAGE', index: nextSel });
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Page removed · ${nextLength} left` });
    },
    [dispatch, pages, sel]
  );

  const handleEnhanceChange = useCallback(
    (enhance: EnhanceMode) => {
      if (!selectedPage) return;
      if (applyToAll) dispatch({ type: 'capture/SET_ALL_PAGES_ENHANCE', enhance });
      else dispatch({ type: 'capture/SET_PAGE_ENHANCE', id: selectedPage.id, enhance });
    },
    [dispatch, selectedPage, applyToAll]
  );

  const handleAdjustCommit = useCallback(
    (adjust: AdjustValues) => {
      if (!selectedPage) return;
      if (applyToAll) dispatch({ type: 'capture/SET_ALL_PAGES_ADJUST', adjust });
      else dispatch({ type: 'capture/SET_PAGE_ADJUST', id: selectedPage.id, adjust });
    },
    [dispatch, selectedPage, applyToAll]
  );

  const goPrevPage = useCallback(() => {
    if (sel > 0) dispatch({ type: 'review/SELECT_PAGE', index: sel - 1 });
  }, [dispatch, sel]);

  const goNextPage = useCallback(() => {
    if (sel < pages.length - 1) dispatch({ type: 'review/SELECT_PAGE', index: sel + 1 });
  }, [dispatch, sel, pages.length]);

  const handleRotate = useCallback(() => {
    if (!selectedPage) return;
    dispatch({ type: 'capture/ROTATE_PAGE', id: selectedPage.id });
  }, [dispatch, selectedPage]);

  const handleOcr = useCallback(async () => {
    if (!selectedPage || ocrRunning) return;
    dispatch({ type: 'review/SET_OCR_RUNNING', running: true });
    const ocr = await runOcr(selectedPage.uri, state.settings.ocrScript);
    const err = !ocr || ocr.text.trim().length < OCR_SPARSE_THRESHOLD;
    dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: { ocr, err } });
    dispatch({ type: 'review/SET_OCR_RUNNING', running: false });
    dispatch({
      type: 'ui/SHOW_SNACK',
      msg: ocr && !err ? 'OCR finished · text is searchable' : 'OCR finished · little or no text found',
    });
  }, [dispatch, selectedPage, ocrRunning, state.settings.ocrScript]);

  // Mirrors ReaderScreen's PDF-signing flow (SignatureCaptureModal -> SignaturePlacementOverlay),
  // but applied to the in-memory SessionPage directly, before the document is ever saved.
  const handleSignPress = useCallback(() => {
    if (state.signature.saved) {
      setCapturedSignature(state.signature.saved);
      setSignStep('place');
    } else {
      setSignStep('capture');
    }
  }, [state.signature.saved]);

  const handleRetake = useCallback(() => {
    if (!selectedPage) return;
    dispatch({ type: 'capture/SET_RETAKE_TARGET', id: selectedPage.id });
    go('capture', 'back');
  }, [dispatch, selectedPage, go]);

  const handleContextBarPress = useCallback(
    (id: 'crop' | 'rotate' | 'retake' | 'ocr' | 'sign') => {
      if (id === 'crop') setCropTarget(selectedPage?.id ?? null);
      else if (id === 'rotate') handleRotate();
      else if (id === 'retake') handleRetake();
      else if (id === 'ocr') handleOcr();
      else if (id === 'sign') handleSignPress();
    },
    [selectedPage, handleRotate, handleOcr, handleRetake, handleSignPress]
  );

  const handleCropConfirm = useCallback(
    async (points: [Point, Point, Point, Point]) => {
      if (!selectedPage) return;
      const cropped = await warpPerspectiveCrop(selectedPage.uri, points);
      dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: cropped });
      setCropTarget(null);
    },
    [dispatch, selectedPage]
  );

  // "Check crops": steps through every page gallery import couldn't crop confidently, starting each
  // from the suggested outline when there is one. Confirming warps the page (which clears its
  // flag); "Keep as is" accepts the photo uncropped. Either way it moves on to the next page.
  const [checkingCrops, setCheckingCrops] = useState(false);
  const cropCheckPages = pages.filter((p) => p.needsCropReview);
  const cropCheckPage = checkingCrops ? cropCheckPages[0] : undefined;
  useEffect(() => {
    if (checkingCrops && cropCheckPages.length === 0) setCheckingCrops(false);
  }, [checkingCrops, cropCheckPages.length]);

  const handleCropCheckConfirm = useCallback(
    async (points: [Point, Point, Point, Point]) => {
      if (!cropCheckPage) return;
      const cropped = await warpPerspectiveCrop(cropCheckPage.uri, points);
      cleanTemporaryCache(cropCheckPage.thumbUri ? [cropCheckPage.uri, cropCheckPage.thumbUri] : [cropCheckPage.uri]);
      dispatch({ type: 'capture/UPDATE_PAGE', id: cropCheckPage.id, patch: cropped });
    },
    [dispatch, cropCheckPage]
  );

  const handleCropCheckKeep = useCallback(() => {
    if (!cropCheckPage) return;
    dispatch({
      type: 'capture/UPDATE_PAGE',
      id: cropCheckPage.id,
      patch: { needsCropReview: undefined, cropSuggestion: undefined },
    });
  }, [dispatch, cropCheckPage]);

  const handleMergeRequest = useCallback((ids: [string, string]) => {
    setMergeCrop({ ids, stage: 'first' });
  }, []);

  const mergeCropPage = mergeCrop
    ? pages.find((p) => p.id === mergeCrop.ids[mergeCrop.stage === 'first' ? 0 : 1])
    : undefined;

  const handleMergeCropCancel = useCallback(() => {
    // The first crop step's own output is a real file already written to cache - if the user
    // cancels at stage 2, sweep it or it leaks (it never got baked into a final composite).
    if (mergeCrop?.firstResult) cleanTemporaryCache([mergeCrop.firstResult.uri]);
    setMergeCrop(null);
  }, [mergeCrop]);

  const handleMergeCropConfirm = useCallback(
    async (points: [Point, Point, Point, Point]) => {
      if (!mergeCrop || !mergeCropPage) return;
      const cropped = await warpPerspectiveCrop(mergeCropPage.uri, points);

      if (mergeCrop.stage === 'first') {
        setMergeCrop({ ids: mergeCrop.ids, stage: 'second', firstResult: cropped });
        return;
      }

      const firstResult = mergeCrop.firstResult;
      if (!firstResult) return;
      const merged = await compositeHalfPages(firstResult, cropped);
      const newPage: SessionPage = {
        id: createId('page'),
        uri: merged.uri,
        width: merged.width,
        height: merged.height,
        rotation: 0,
        enhance: 'auto',
      };
      const insertIndex = pages.findIndex((p) => p.id === mergeCrop.ids[0]);

      dispatch({ type: 'capture/REPLACE_PAGES', ids: mergeCrop.ids, page: newPage });
      dispatch({ type: 'review/SELECT_PAGE', index: Math.max(0, insertIndex) });
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Pages merged into 1' });
      cleanTemporaryCache([firstResult.uri, cropped.uri]);
      setMergeCrop(null);
    },
    [dispatch, mergeCrop, mergeCropPage, pages]
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
      if (!selectedPage || !capturedSignature) return;
      const signed = await applySignatureToPage(selectedPage.uri, capturedSignature.uri, placement);
      dispatch({
        type: 'capture/UPDATE_PAGE',
        id: selectedPage.id,
        patch: { uri: signed.uri, width: signed.width, height: signed.height },
      });
      setSignStep(null);
      setCapturedSignature(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Signed · page ${sel + 1}` });
    },
    [selectedPage, capturedSignature, dispatch, sel]
  );

  const showErrHint = !!selectedPage?.err && selectedPage.enhance !== 'bw';

  // ID card mode: recompose the true-size page from its kept card images.
  const [idCardBusy, setIdCardBusy] = useState(false);
  const updateIdCard = useCallback(
    async (getNext: () => Promise<{ front: SourceImage; back?: SourceImage } | null>, doneMsg: string) => {
      if (!selectedPage?.idCard || idCardBusy) return;
      setIdCardBusy(true);
      try {
        const next = await getNext();
        if (!next) return;
        const patch = await recomposeIdCard(selectedPage, next, state.settings.ocrScript);
        dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch });
        dispatch({ type: 'ui/SHOW_SNACK', msg: doneMsg });
      } catch (error) {
        console.warn('ReviewScreen: ID card update failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't update the ID card" });
      } finally {
        setIdCardBusy(false);
      }
    },
    [dispatch, idCardBusy, selectedPage, state.settings.ocrScript]
  );

  const handleSwapIdSides = useCallback(() => {
    const card = selectedPage?.idCard;
    if (!card?.back) return;
    void updateIdCard(async () => ({ front: card.back!, back: card.front }), 'Front and back swapped');
  }, [selectedPage, updateIdCard]);

  const handleRetakeIdBack = useCallback(() => {
    const card = selectedPage?.idCard;
    if (!card) return;
    void updateIdCard(async () => {
      const back = await scanIdCardSide(state.settings.ocrScript);
      return back ? { front: card.front, back } : null;
    }, card.back ? 'Back replaced' : 'Back added');
  }, [selectedPage, updateIdCard, state.settings.ocrScript]);

  // Book mode split this page out of a two-page spread; put the pair back together. The halves'
  // own files are no longer referenced afterwards, so they're deleted.
  const handleUndoSplit = useCallback(() => {
    const groupId = selectedPage?.splitFrom?.groupId;
    if (!groupId) return;
    const halves = pages.filter((p) => p.splitFrom?.groupId === groupId);
    const firstIndex = pages.indexOf(halves[0]);
    dispatch({ type: 'capture/UNSPLIT', groupId, id: createId('page') });
    dispatch({ type: 'review/SELECT_PAGE', index: Math.max(0, firstIndex) });
    cleanTemporaryCache(halves.flatMap((p) => (p.thumbUri ? [p.uri, p.thumbUri] : [p.uri])));
    dispatch({ type: 'ui/SHOW_SNACK', msg: 'Spread restored as one page' });
  }, [dispatch, pages, selectedPage]);

  if (!selectedPage) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        {scanProcessing ? (
          <>
            <ActivityIndicator color={tokens.accent} size="large" />
            <Text style={{ color: tokens.muted, marginTop: spacing.md }}>
              {progress ? `Processing page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Processing pages…'}
            </Text>
            {progress ? (
              <Pressable onPress={cancelProcessing} hitSlop={8} style={{ marginTop: spacing.md }} accessibilityRole="button">
                <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Text style={{ color: tokens.muted }}>No pages captured yet.</Text>
            <Pressable
              style={[styles.startButton, { backgroundColor: tokens.accent }]}
              onPress={() => {
                dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
                go('capture');
              }}
            >
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.startButtonLabel}>Start Capture</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={() => {
            dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
            go('capture', 'back');
          }}
        >
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Review</Text>
        <View style={styles.headerRight}>
          {multiPage && (
            <Pressable
              style={[styles.gridToggle, { borderColor: tokens.edge }]}
              onPress={() => setGridOpen(true)}
            >
              <Ionicons name="grid-outline" size={18} color={tokens.ink} />
            </Pressable>
          )}
          <Pressable style={[styles.nextButton, { backgroundColor: tokens.accent }]} onPress={() => go('deliver')}>
            <Text style={styles.nextLabel}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {progress ? (
        <ProcessingProgress done={progress.done} total={progress.total} onCancel={cancelProcessing} />
      ) : null}

      <View style={[styles.ribbonTrack, { backgroundColor: tokens.edge, opacity: showRibbon ? 1 : 0 }]}>
        <Animated.View
          style={[
            styles.ribbonFill,
            {
              backgroundColor: tokens.accent,
              transform: [
                {
                  translateX: ribbon.interpolate({ inputRange: [0, 1], outputRange: [-120, 300] }),
                },
              ],
            },
          ]}
        />
      </View>

      <ThumbnailStrip
        pages={pages}
        selectedIndex={sel}
        onSelect={(index) => dispatch({ type: 'review/SELECT_PAGE', index })}
        onReorder={handleReorder}
        onAddMore={() => {
          dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
          go('capture');
        }}
        onDelete={handleDeletePage}
        cover={coverConfig ? { mode: coverConfig.mode, importedUri: coverConfig.importedUri } : null}
        onPressCover={() => go('academicOptions')}
      />

      <View style={styles.previewArea}>
        <PagePeekCarousel
          pages={pages}
          sel={sel}
          displayUri={displayUri}
          // The rendered preview already has the rotation baked in; the raw master shown while
          // comparing doesn't.
          displayRotation={comparing ? selectedPage.rotation : 0}
          onCommitPrev={goPrevPage}
          onCommitNext={goNextPage}
        />
        {mainPreviewLoading && (
          <View style={styles.previewLoading} pointerEvents="none">
            <ActivityIndicator color={tokens.accent} />
          </View>
        )}
        <PreviewControls
          showCompare={showCompare}
          comparing={comparing}
          onCompareIn={() => setComparing(true)}
          onCompareOut={() => setComparing(false)}
        />
      </View>

      {cropCheckPages.length > 0 && !scanProcessing && (
        <View style={[styles.splitChip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={{ color: tokens.muted, fontSize: 13, flex: 1 }}>
            {cropCheckPages.length === 1 ? "1 page couldn't be cropped automatically" : `${cropCheckPages.length} pages couldn't be cropped automatically`}
          </Text>
          <Pressable onPress={() => setCheckingCrops(true)} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>
              Check crops ({cropCheckPages.length})
            </Text>
          </Pressable>
        </View>
      )}

      {selectedPage.idCard && (
        <View style={[styles.splitChip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={{ color: tokens.muted, fontSize: 13, flex: 1 }}>
            {idCardBusy ? 'Updating ID card…' : 'ID card · prints at real size'}
          </Text>
          {selectedPage.idCard.back && (
            <Pressable onPress={handleSwapIdSides} disabled={idCardBusy} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>Swap sides</Text>
            </Pressable>
          )}
          <Pressable onPress={handleRetakeIdBack} disabled={idCardBusy} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>
              {selectedPage.idCard.back ? 'Retake back' : 'Add back'}
            </Text>
          </Pressable>
        </View>
      )}

      {selectedPage.splitFrom && (
        <View style={[styles.splitChip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={{ color: tokens.muted, fontSize: 13, flex: 1 }}>Split from a book spread</Text>
          <Pressable onPress={handleUndoSplit} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>Undo split</Text>
          </Pressable>
        </View>
      )}

      {showErrHint && (
        <View style={[styles.errHint, { backgroundColor: `${tokens.danger}1A` }]}>
          <Text style={{ color: tokens.danger, fontSize: 13, fontWeight: '500' }}>
            Low contrast on page {sel + 1} — try B&W.
          </Text>
        </View>
      )}

      <View style={styles.enhanceWrap}>
        {(multiPage || adjustable) && (
          <View style={styles.enhanceHeaderRow}>
            {multiPage && (
              <Pressable style={styles.headerToggle} onPress={() => setApplyToAll((v) => !v)} hitSlop={4}>
                <Ionicons
                  name={applyToAll ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={applyToAll ? tokens.accent : tokens.muted}
                />
                <Text style={[styles.headerToggleLabel, { color: applyToAll ? tokens.accent : tokens.muted }]}>
                  Apply to all pages
                </Text>
              </Pressable>
            )}
            {adjustable && (
              <Pressable style={styles.headerToggle} onPress={() => setAdjustOpen((v) => !v)} hitSlop={4}>
                <Ionicons name="options-outline" size={18} color={adjustOpen ? tokens.accent : tokens.muted} />
                <Text style={[styles.headerToggleLabel, { color: adjustOpen ? tokens.accent : tokens.muted }]}>
                  Adjust
                </Text>
              </Pressable>
            )}
          </View>
        )}
        {adjustOpen && adjustable && <AdjustPanel value={currentAdjust} onCommit={handleAdjustCommit} />}
        <EnhanceSegmented value={selectedPage.enhance} onChange={handleEnhanceChange} />
      </View>

      <ContextBar onPress={handleContextBarPress} ocrRunning={ocrRunning} />

      {cropTarget && selectedPage && (
        <CropOverlay
          uri={selectedPage.uri}
          naturalWidth={selectedPage.width}
          naturalHeight={selectedPage.height}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropTarget(null)}
        />
      )}

      {cropCheckPage && (
        <CropOverlay
          key={cropCheckPage.id}
          uri={cropCheckPage.uri}
          naturalWidth={cropCheckPage.width}
          naturalHeight={cropCheckPage.height}
          initialQuad={cropCheckPage.cropSuggestion}
          stepLabel={`Check crop · ${cropCheckPages.length} left`}
          cancelLabel="Keep as is"
          onConfirm={handleCropCheckConfirm}
          onCancel={handleCropCheckKeep}
        />
      )}

      {mergeCrop && mergeCropPage && (
        <CropOverlay
          uri={mergeCropPage.uri}
          naturalWidth={mergeCropPage.width}
          naturalHeight={mergeCropPage.height}
          stepLabel={mergeCrop.stage === 'first' ? 'Page 1 of 2' : 'Page 2 of 2'}
          onConfirm={handleMergeCropConfirm}
          onCancel={handleMergeCropCancel}
        />
      )}

      {signStep === 'capture' && (
        <SignatureCaptureModal visible onCancel={() => setSignStep(null)} onCapture={handleSignatureCaptured} />
      )}

      <GridPagesModal
        visible={gridOpen}
        pages={pages}
        selectedIndex={sel}
        onSelect={(index) => dispatch({ type: 'review/SELECT_PAGE', index })}
        onDelete={handleDeletePage}
        onMerge={handleMergeRequest}
        onClose={() => setGridOpen(false)}
      />

      {signStep === 'place' && capturedSignature && selectedPage && (
        <SignaturePlacementOverlay
          pageUri={selectedPage.uri}
          pageNaturalWidth={selectedPage.width}
          pageNaturalHeight={selectedPage.height}
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    marginTop: spacing.lg,
  },
  startButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: spacing.sm,
  },
  headerButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  gridToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
  },
  nextLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  ribbonTrack: {
    height: 3,
    overflow: 'hidden',
  },
  ribbonFill: {
    width: 100,
    height: '100%',
  },
  previewArea: {
    flex: 1,
    position: 'relative',
    marginHorizontal: spacing.xl,
    marginVertical: spacing.sm,
    borderRadius: 10,
    overflow: 'hidden',
  },
  previewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errHint: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
  },
  enhanceWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  enhanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  headerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerToggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
