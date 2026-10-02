import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdjustPanel } from '../components/review/AdjustPanel';
import { ContextBar } from '../components/review/ContextBar';
import { CropOverlay } from '../components/review/CropOverlay';
import { FilteredPreview } from '../components/review/FilteredPreview';
import { FilterStrip } from '../components/review/FilterStrip';
import { FilterOptionsPanel } from '../components/review/FilterOptionsPanel';
import { GridPagesModal } from '../components/review/GridPagesModal';
import { PagePeekCarousel } from '../components/review/PagePeekCarousel';
import { PreviewControls } from '../components/review/PreviewControls';
import { ProcessingProgress } from '../components/review/ProcessingProgress';
import { ThumbnailStrip } from '../components/review/ThumbnailStrip';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { useBackHandler } from '../navigation/useBackHandler';
import { DEFAULT_ADJUST, isDefaultAdjust } from '../services/enhance/adjust';
import { recomposeIdCard, scanIdCardSide } from '../services/capture/idCardPages';
import { cancelProcessing } from '../services/capture/processingSession';
import { compositeHalfPages } from '../services/enhance/compositeHalfPages';
import { getFilter } from '../services/enhance/filters/registry';
import { analyzeImageUri } from '../services/enhance/filters/stats';
import { warpPerspectiveCrop } from '../services/enhance/perspectiveCrop';
import type { Point } from '../services/enhance/perspective';
import { useFilteredPicture } from '../services/enhance/useFilteredPicture';
import type { PictureOverlay } from '../services/enhance/useFilteredPicture';
import { runOcr } from '../services/ocr/ocrService';
import { cleanTemporaryCache } from '../services/persistence/libraryFiles';
import { drawAcademicStamp, hasContentPageStamp } from '../services/pdf/academicRasterService';
import { applySignatureToPage } from '../services/signature/signatureCompositeService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { useScanOcrScript } from '../store/useScanOcrScript';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';
import { createId } from '../utils/id';
import { useResolvedAcademicConfig } from '../store/useDeliverContext';
import type { AdjustValues, EnhanceMode, FilterOptions, SessionPage, SourceImage } from '../types/models';

const OCR_SPARSE_THRESHOLD = 6;

type MergeCropState = {
  ids: [string, string];
  stage: 'first' | 'second';
  firstResult?: { uri: string; width: number; height: number };
} | null;

export function ReviewScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('capture', 'review', 'signature');
  // §6 L1: re-OCR and ID card sides use the filing course's script, like the original scan.
  const ocrScript = useScanOcrScript();
  const { pages, processingStatus, progress } = state.capture;
  const { sel, ocrRunning, history } = state.review;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const scanProcessing = processingStatus === 'scanning' || processingStatus === 'processing';
  // As Deliver will draw it: `{name}` etc. in the header/footer filled in.
  const academicConfig = useResolvedAcademicConfig();
  const [cropTarget, setCropTarget] = useState<string | null>(null);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  // Set after a filter, option or slider change on one page of a multi-page scan, to offer
  // "Apply to all pages" right where the change was made. Cleared on page change or apply.
  const [offerApplyAll, setOfferApplyAll] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  // §9 O1: Android back closes the Adjust panel before leaving Review.
  useBackHandler(() => setAdjustOpen(false), adjustOpen);
  const [mergeCrop, setMergeCrop] = useState<MergeCropState>(null);

  const selectedPage = pages[sel] ?? pages[0];
  const multiPage = pages.length > 1;
  const coverConfig = academicConfig?.coverPage;
  const currentAdjust = selectedPage?.adjust ?? DEFAULT_ADJUST;
  const adjustable = selectedPage ? getFilter(selectedPage.enhance).adjustable : true;

  // Slider values while a drag is in progress. Only the preview sees them; the store gets the
  // final values from handleAdjustCommit, which clears this.
  const [liveAdjust, setLiveAdjust] = useState<AdjustValues | null>(null);
  useEffect(() => {
    setLiveAdjust(null);
    setOfferApplyAll(false);
  }, [selectedPage?.id]);

  // Scanned pages arrive with stats measured at ingest; gallery imports, merged halves and pages
  // whose image changed (crop, rotate, sign - the reducer drops stale stats) are measured here, once,
  // the first time they're shown. SET_PAGE_STATS ignores the result if the uri moved on meanwhile.
  const statsPageId = selectedPage && !selectedPage.stats ? selectedPage.id : undefined;
  const statsPageUri = statsPageId ? selectedPage?.uri : undefined;
  useEffect(() => {
    if (!statsPageId || !statsPageUri) return;
    analyzeImageUri(statsPageUri).then((stats) => {
      if (stats) dispatch({ type: 'capture/SET_PAGE_STATS', id: statsPageId, uri: statsPageUri, stats });
    });
  }, [dispatch, statsPageId, statsPageUri]);

  // Border/header-footer drawn on top of the filtered picture, mirroring the save pipeline's order
  // (filter, then stamp) with the same drawAcademicStamp the saved copies use.
  const stampActive = hasContentPageStamp(academicConfig);
  const stampBorder = academicConfig?.enableBorder;
  const stampHeader = academicConfig?.headerText;
  const stampFooter = academicConfig?.footerText;
  const pageNumber = sel + 1;
  const totalPages = pages.length;
  const stampOverlay = useCallback<PictureOverlay>(
    (canvas, width, height) => {
      const config = { enableBorder: !!stampBorder, headerText: stampHeader, footerText: stampFooter };
      drawAcademicStamp(canvas, width, height, config, pageNumber, totalPages);
    },
    [stampBorder, stampHeader, stampFooter, pageNumber, totalPages]
  );

  // Decoded at roughly screen resolution: enough for a sharp full-screen page, and a fraction of
  // the master's memory.
  const windowSize = useWindowDimensions();
  const previewMaxDim = Math.min(1400, Math.round(Math.max(windowSize.width, windowSize.height) * PixelRatio.get()));
  const { preview, loading: mainPreviewLoading } = useFilteredPicture(selectedPage, previewMaxDim, {
    adjust: liveAdjust ?? undefined,
    prefetchUris: [pages[sel - 1]?.uri, pages[sel + 1]?.uri],
    overlay: stampActive ? stampOverlay : undefined,
  });
  const showCompare =
    !!preview &&
    !!selectedPage &&
    (selectedPage.enhance !== 'original' || !isDefaultAdjust(liveAdjust ?? currentAdjust) || stampActive);
  const shownPicture = preview && (comparing ? preview.originalPicture : preview.picture);

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
      dispatch({
        type: 'ui/SHOW_SNACK',
        msg: t('review.pageRemoved', { count: nextLength }),
        action: t('review.undo'),
        onAction: () => dispatch({ type: 'review/UNDO' }),
      });
    },
    [dispatch, pages, sel]
  );

  const handleEnhanceChange = useCallback(
    (enhance: EnhanceMode) => {
      if (!selectedPage || enhance === selectedPage.enhance) return;
      dispatch({ type: 'capture/SET_PAGE_ENHANCE', id: selectedPage.id, enhance });
      setOfferApplyAll(multiPage);
    },
    [dispatch, selectedPage, multiPage]
  );

  const handleFilterOptionsChange = useCallback(
    (options: FilterOptions) => {
      if (!selectedPage) return;
      dispatch({ type: 'capture/SET_FILTER_OPTIONS', id: selectedPage.id, options });
      setOfferApplyAll(multiPage);
    },
    [dispatch, selectedPage, multiPage]
  );

  const handleAdjustCommit = useCallback(
    (adjust: AdjustValues) => {
      if (!selectedPage) return;
      dispatch({ type: 'capture/SET_PAGE_ADJUST', id: selectedPage.id, adjust });
      setLiveAdjust(null);
      setOfferApplyAll(multiPage);
    },
    [dispatch, selectedPage, multiPage]
  );

  // Copies this page's whole look (filter, its options, sliders) to every page as one undo step,
  // and remembers the filter as this capture mode's default for the next scan.
  const handleApplyToAll = useCallback(() => {
    if (!selectedPage) return;
    dispatch({
      type: 'capture/APPLY_LOOK_TO_ALL',
      enhance: selectedPage.enhance,
      adjust: selectedPage.adjust,
      filterOptions: selectedPage.filterOptions,
    });
    dispatch({ type: 'settings/SET_DEFAULT_ENHANCE', mode: state.capture.mode, enhance: selectedPage.enhance });
    dispatch({
      type: 'ui/SHOW_SNACK',
      msg: t('review.appliedToAll', { count: pages.length }),
      action: t('review.undo'),
      onAction: () => dispatch({ type: 'review/UNDO' }),
    });
    setOfferApplyAll(false);
  }, [dispatch, selectedPage, state.capture.mode, pages.length]);

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
    const ocr = await runOcr(selectedPage.uri, ocrScript);
    const err = !ocr || ocr.text.trim().length < OCR_SPARSE_THRESHOLD;
    dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: { ocr, err } });
    dispatch({ type: 'review/SET_OCR_RUNNING', running: false });
    dispatch({
      type: 'ui/SHOW_SNACK',
      msg: ocr && !err ? t('review.ocrDone') : t('review.ocrSparse'),
    });
  }, [dispatch, selectedPage, ocrRunning, ocrScript]);

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
    dispatch({ type: 'capture/REQUEST_SCANNER', requested: true });
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
      const firstPage = pages.find((p) => p.id === mergeCrop.ids[0]);
      const newPage: SessionPage = {
        id: createId('page'),
        uri: merged.uri,
        width: merged.width,
        height: merged.height,
        rotation: 0,
        // The merged page keeps the first half's look rather than resetting to a default.
        enhance: firstPage?.enhance ?? 'auto',
        adjust: firstPage?.adjust,
        filterOptions: firstPage?.filterOptions,
      };
      const insertIndex = pages.findIndex((p) => p.id === mergeCrop.ids[0]);

      dispatch({ type: 'capture/REPLACE_PAGES', ids: mergeCrop.ids, page: newPage });
      dispatch({ type: 'review/SELECT_PAGE', index: Math.max(0, insertIndex) });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('review.merged') });
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
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('review.signed', { page: sel + 1 }) });
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
        const patch = await recomposeIdCard(selectedPage, next, ocrScript);
        dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch });
        dispatch({ type: 'ui/SHOW_SNACK', msg: doneMsg });
      } catch (error) {
        console.warn('ReviewScreen: ID card update failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('review.idCardFailed') });
      } finally {
        setIdCardBusy(false);
      }
    },
    [dispatch, idCardBusy, selectedPage, ocrScript]
  );

  const handleSwapIdSides = useCallback(() => {
    const card = selectedPage?.idCard;
    if (!card?.back) return;
    void updateIdCard(async () => ({ front: card.back!, back: card.front }), t('review.idCardSwapped'));
  }, [selectedPage, updateIdCard]);

  const handleRetakeIdBack = useCallback(() => {
    const card = selectedPage?.idCard;
    if (!card) return;
    void updateIdCard(async () => {
      const back = await scanIdCardSide(ocrScript);
      return back ? { front: card.front, back } : null;
    }, card.back ? t('review.idBackReplaced') : t('review.idBackAdded'));
  }, [selectedPage, updateIdCard, ocrScript]);

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
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('review.spreadRestored') });
  }, [dispatch, pages, selectedPage]);

  if (!selectedPage) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        {scanProcessing ? (
          <>
            <ActivityIndicator color={tokens.accent} size="large" />
            <Text style={{ color: tokens.muted, marginTop: spacing.md }}>
              {progress ? t('review.processingPage', { current: Math.min(progress.done + 1, progress.total), total: progress.total }) : t('capture.processingPages')}
            </Text>
            {progress ? (
              <Pressable onPress={cancelProcessing} hitSlop={8} style={{ marginTop: spacing.md }} accessibilityRole="button">
                <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>{t('common.cancel')}</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Text style={{ color: tokens.muted }}>{t('review.empty')}</Text>
            <Pressable
              style={[styles.startButton, { backgroundColor: tokens.accent }]}
              onPress={() => {
                dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
                dispatch({ type: 'capture/REQUEST_SCANNER', requested: true });
                go('capture');
              }}
            >
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.startButtonLabel}>{t('review.startCapture')}</Text>
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
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>{t('common.back')}</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('review.title')}</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.historyButton}
            onPress={() => dispatch({ type: 'review/UNDO' })}
            disabled={!canUndo}
            hitSlop={4}
            accessibilityLabel={t('review.undo')}
          >
            <Ionicons name="arrow-undo-outline" size={20} color={canUndo ? tokens.ink : tokens.edge} />
          </Pressable>
          <Pressable
            style={styles.historyButton}
            onPress={() => dispatch({ type: 'review/REDO' })}
            disabled={!canRedo}
            hitSlop={4}
            accessibilityLabel={t('review.redo')}
          >
            <Ionicons name="arrow-redo-outline" size={20} color={canRedo ? tokens.ink : tokens.edge} />
          </Pressable>
          {multiPage && (
            <Pressable
              style={[styles.gridToggle, { borderColor: tokens.edge }]}
              onPress={() => setGridOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('review.grid.title')}
            >
              <Ionicons name="grid-outline" size={18} color={tokens.ink} />
            </Pressable>
          )}
          <Pressable style={[styles.nextButton, { backgroundColor: tokens.accent }]} onPress={() => go('deliver')}>
            <Text style={styles.nextLabel}>{t('review.next')}</Text>
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
          dispatch({ type: 'capture/REQUEST_SCANNER', requested: true });
          go('capture');
        }}
        onDelete={handleDeletePage}
        cover={coverConfig ? { mode: coverConfig.mode, importedUri: coverConfig.mode === 'imported_image' ? coverConfig.importedUri : undefined } : null}
        onPressCover={() => go('academicOptions')}
      />

      <View style={styles.previewArea}>
        <PagePeekCarousel
          pages={pages}
          sel={sel}
          currentContent={
            preview && shownPicture ? (
              <FilteredPreview picture={shownPicture} contentWidth={preview.width} contentHeight={preview.height} />
            ) : undefined
          }
          onCommitPrev={goPrevPage}
          onCommitNext={goNextPage}
          onCompareStart={() => setComparing(true)}
          onCompareEnd={() => setComparing(false)}
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
            {t('review.cropCheck', { count: cropCheckPages.length })}
          </Text>
          <Pressable onPress={() => setCheckingCrops(true)} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>
              {t('review.checkCrops', { count: cropCheckPages.length })}
            </Text>
          </Pressable>
        </View>
      )}

      {selectedPage.idCard && (
        <View style={[styles.splitChip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={{ color: tokens.muted, fontSize: 13, flex: 1 }}>
            {idCardBusy ? t('review.idCardUpdating') : t('review.idCardInfo')}
          </Text>
          {selectedPage.idCard.back && (
            <Pressable onPress={handleSwapIdSides} disabled={idCardBusy} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>{t('review.swapSides')}</Text>
            </Pressable>
          )}
          <Pressable onPress={handleRetakeIdBack} disabled={idCardBusy} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>
              {selectedPage.idCard.back ? t('review.retakeBack') : t('review.addBack')}
            </Text>
          </Pressable>
        </View>
      )}

      {selectedPage.splitFrom && (
        <View style={[styles.splitChip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={{ color: tokens.muted, fontSize: 13, flex: 1 }}>{t('review.splitFrom')}</Text>
          <Pressable onPress={handleUndoSplit} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>{t('review.undoSplit')}</Text>
          </Pressable>
        </View>
      )}

      {showErrHint && (
        <View style={[styles.errHint, { backgroundColor: `${tokens.danger}1A` }]}>
          <Text style={{ color: tokens.danger, fontSize: 13, fontWeight: '500' }}>
            {t('review.lowContrast', { page: sel + 1 })}
          </Text>
        </View>
      )}

      <View style={styles.enhanceWrap}>
        {(offerApplyAll || adjustable) && (
          <View style={styles.enhanceHeaderRow}>
            {offerApplyAll && (
              <Pressable
                style={[styles.applyAllButton, { backgroundColor: tokens.accentSoft }]}
                onPress={handleApplyToAll}
                hitSlop={4}
              >
                <Ionicons name="copy-outline" size={15} color={tokens.accentInk} />
                <Text style={[styles.headerToggleLabel, { color: tokens.accentInk }]}>{t('review.applyToAll')}</Text>
              </Pressable>
            )}
            {adjustable && (
              <Pressable style={styles.headerToggle} onPress={() => setAdjustOpen((v) => !v)} hitSlop={4}>
                <Ionicons name="options-outline" size={18} color={adjustOpen ? tokens.accent : tokens.muted} />
                <Text style={[styles.headerToggleLabel, { color: adjustOpen ? tokens.accent : tokens.muted }]}>
                  {t('review.adjust')}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        {adjustOpen && adjustable && (
          <AdjustPanel value={currentAdjust} onCommit={handleAdjustCommit} onLive={setLiveAdjust} />
        )}
        <FilterStrip page={selectedPage} value={selectedPage.enhance} onChange={handleEnhanceChange} />
        <FilterOptionsPanel
          mode={selectedPage.enhance}
          value={selectedPage.filterOptions}
          onChange={handleFilterOptionsChange}
        />
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
          stepLabel={t('review.checkCropStep', { count: cropCheckPages.length })}
          cancelLabel={t('review.keepAsIs')}
          onConfirm={handleCropCheckConfirm}
          onCancel={handleCropCheckKeep}
        />
      )}

      {mergeCrop && mergeCropPage && (
        <CropOverlay
          uri={mergeCropPage.uri}
          naturalWidth={mergeCropPage.width}
          naturalHeight={mergeCropPage.height}
          stepLabel={t('review.mergeStep', { current: mergeCrop.stage === 'first' ? 1 : 2, total: 2 })}
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
  historyButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radii.full,
    marginRight: 'auto',
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
