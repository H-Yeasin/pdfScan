import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PixelRatio, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AdjustPanel } from '../components/review/AdjustPanel';
import { useLiveAdjust } from '../components/review/useLiveAdjust';
import { ReviewToolbar, type ReviewToolId } from '../components/review/ReviewToolbar';
import { SuggestionChip } from '../components/review/SuggestionChip';
import { CropOverlay } from '../components/review/CropOverlay';
import { FilteredPreview } from '../components/review/FilteredPreview';
import { FilterStrip } from '../components/review/FilterStrip';
import { FilterOptionsPanel } from '../components/review/FilterOptionsPanel';
import { GridPagesModal } from '../components/review/GridPagesModal';
import { PagePeekCarousel } from '../components/review/PagePeekCarousel';
import { PreviewControls } from '../components/review/PreviewControls';
import { ProcessingProgress } from '../components/review/ProcessingProgress';
import { ThumbnailStrip } from '../components/review/ThumbnailStrip';
import { askDiscardScan } from '../components/capture/askDiscardScan';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { Button, Menu, ScreenHeader, Text, Touchable, type MenuSection } from '../components/ui';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { useBackHandler } from '../navigation/useBackHandler';
import { DEFAULT_ADJUST, isDefaultAdjust } from '../services/enhance/adjust';
import { CAPTURE_MODES, getCaptureModeSpec } from '../services/capture/captureModes';
import { masterGeometryKey } from '../services/capture/geometryKey';
import { composeIdCardPages, recomposeIdCard, scanIdCardSide } from '../services/capture/idCardPages';
import { splitSpreadPage } from '../services/capture/ingestBatch';
import { reapplyMode } from '../services/capture/reapplyMode';
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
import { reviewSuggestion, type Suggestion } from '../services/review/suggestion';
import { applySignatureToPage } from '../services/signature/signatureCompositeService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { useAppDispatch, useAppSlices, useAppStore } from '../store/AppStateContext';
import { defaultEnhanceFor } from '../store/slices/settingsSlice';
import { useScanOcrScript } from '../store/useScanOcrScript';
import { ICONS, radii, spacing, useTheme, type IoniconName } from '../theme';
import { createId } from '../utils/id';
import { useResolvedAcademicConfig } from '../store/useDeliverContext';
import type { AdjustValues, CaptureMode, EnhanceMode, FilterOptions, IdCardSize, SessionPage, SourceImage } from '../types/models';
import { EmptyState } from '../components/shared/EmptyState';
import { Hint } from '../components/shared/Hint';
import { useHint } from '../components/shared/useHint';
import { useGalleryImport } from '../store/useGalleryImport';
import { useReducedMotion } from '../theme/useReducedMotion';

const OCR_SPARSE_THRESHOLD = 6;

type MoreId =
  | 'retake'
  | 'sign'
  | 'searchable'
  | 'deletePage'
  | 'addPages'
  | 'reorder'
  | 'applyToAll'
  | 'swapSides'
  | 'retakeBack';

type MergeCropState = {
  ids: [string, string];
  stage: 'first' | 'second';
  firstResult?: { uri: string; width: number; height: number };
} | null;

export function ReviewScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go, back } = useRouter();
  const dispatch = useAppDispatch();
  const store = useAppStore();
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
  // §17 U9: the panel over the toolbar. The filter strip is open to start with (it's what most
  // pages need); Adjust takes its place while open.
  const [panel, setPanel] = useState<'filter' | 'adjust' | null>('filter');
  const adjustOpen = panel === 'adjust';
  // §9 O1: Android back closes the Adjust panel before leaving Review.
  useBackHandler(() => setPanel('filter'), adjustOpen);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  // The mode being re-applied (Book split, ID card compose): nothing else changes the pages meanwhile.
  const [modeBusy, setModeBusy] = useState<CaptureMode | null>(null);
  // Suggestions closed with ×, by suggestionKey (per page; the crop check for the session).
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [mergeCrop, setMergeCrop] = useState<MergeCropState>(null);

  const selectedPage = pages[sel] ?? pages[0];
  const multiPage = pages.length > 1;
  const coverConfig = academicConfig?.coverPage;
  const currentAdjust = selectedPage?.adjust ?? DEFAULT_ADJUST;
  const adjustable = selectedPage ? getFilter(selectedPage.enhance).adjustable : true;
  // A filter with nothing to adjust (picked while Adjust was open) shows the filter strip instead.
  const shownPanel = panel === 'adjust' && !adjustable ? 'filter' : panel;

  // §16 G7: the slider values under the finger, as shared values. The sliders write them and the
  // preview draws from them on the UI thread, so this screen doesn't render while one is dragged;
  // the store gets the final values from handleAdjustCommit.
  const liveAdjust = useLiveAdjust(currentAdjust);
  // While the panel is open the preview is recorded without the adjustment and applies it live.
  const adjustLive = adjustOpen && adjustable;
  useEffect(() => {
    setOfferApplyAll(false);
  }, [selectedPage?.id]);

  // A batch measures each page's stats after it is in (ingestBatch, §16 G7); a page shown before
  // that, merged halves and pages
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
    adjustLive,
    prefetchUris: [pages[sel - 1]?.uri, pages[sel + 1]?.uri],
    overlay: stampActive ? stampOverlay : undefined,
  });
  const showCompare =
    !!preview &&
    !!selectedPage &&
    (selectedPage.enhance !== 'original' || !isDefaultAdjust(currentAdjust) || stampActive);
  const shownPicture = preview && (comparing ? preview.originalPicture : preview.picture);

  // Indeterminate ribbon for OCR and the moment before per-page progress is known; once a batch
  // reports progress, ProcessingProgress (determinate, with Cancel) takes over.
  const showRibbon = ocrRunning || (scanProcessing && !progress);
  const ribbon = useRef(new Animated.Value(0)).current;
  // With reduce motion on (§9 O4b) the ribbon stands still: the progress text says what's happening.
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!showRibbon) return;
    if (reducedMotion) {
      ribbon.setValue(0.5);
      return;
    }
    ribbon.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ribbon, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [showRibbon, ribbon, reducedMotion]);

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

  // "Make text searchable" (More): the page is read again, for when the automatic reading found
  // little (a faint page, then B&W).
  const handleOcr = useCallback(async () => {
    if (!selectedPage || ocrRunning) return;
    dispatch({ type: 'review/SET_OCR_RUNNING', running: true });
    const ocr = await runOcr(selectedPage.uri, ocrScript);
    const err = !ocr || ocr.text.trim().length < OCR_SPARSE_THRESHOLD;
    const ocrGeometry = ocr ? masterGeometryKey(selectedPage, ocrScript) : undefined;
    dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: { ocr, ocrGeometry, err } });
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
    // §17 U5: the scanner opens over Review (ScanLauncher), which stays where it is.
    dispatch({ type: 'capture/SET_RETAKE_TARGET', id: selectedPage.id });
    dispatch({ type: 'capture/REQUEST_SCANNER', requested: true });
  }, [dispatch, selectedPage]);

  const handleAddPages = useCallback(() => {
    dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
    dispatch({ type: 'capture/REQUEST_SCANNER', requested: true });
  }, [dispatch]);

  // §17 U9: the × asks before the unsaved scan goes, as Android Back does, then returns to the tab
  // the scan was started on.
  const handleClose = useCallback(() => {
    const count = store.getState().capture.pages.length;
    if (count === 0) {
      dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
      back();
      return;
    }
    askDiscardScan(dispatch, count, back);
  }, [dispatch, store, back]);

  // §17 U9: the mode after scanning. The session is made again as if scanned in `to`
  // (services/capture/reapplyMode.ts), as one undo step that also puts the mode back.
  const handleModeChange = useCallback(
    async (to: CaptureMode) => {
      const { capture, settings } = store.getState();
      if (to === capture.mode || modeBusy || scanProcessing) return;
      const from = capture.mode;
      const before = capture.pages;
      const label = t(getCaptureModeSpec(to).labelKey);
      setModeBusy(to);
      try {
        const pagesNext = await reapplyMode(
          { pages: before, from, to, fromEnhance: defaultEnhanceFor(settings, from), toEnhance: defaultEnhanceFor(settings, to), script: ocrScript },
          { splitSpreadPage, composeIdCardPages: (run, script) => composeIdCardPages(run, script, { keepThumbs: true }), createId }
        );
        // Something else changed the pages meanwhile (a page still coming in, a delete): this
        // result was made from the old ones, so it isn't applied.
        if (store.getState().capture.pages !== before) throw new Error('pages changed while switching mode');
        dispatch({ type: 'capture/APPLY_MODE', mode: to, pages: pagesNext });
        dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: to });
        dispatch({ type: 'review/SELECT_PAGE', index: Math.min(store.getState().review.sel, Math.max(0, pagesNext.length - 1)) });
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: t('review.modeSheet.applied', { mode: label }),
          action: t('review.undo'),
          onAction: () => dispatch({ type: 'review/UNDO' }),
        });
      } catch (error) {
        console.warn('ReviewScreen: mode switch failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('review.modeSheet.failed') });
      } finally {
        setModeBusy(null);
      }
    },
    [dispatch, store, modeBusy, scanProcessing, ocrScript, t]
  );

  const handleToolPress = useCallback(
    (id: ReviewToolId) => {
      if (id === 'crop') setCropTarget(selectedPage?.id ?? null);
      else if (id === 'rotate') handleRotate();
      else if (id === 'filter') setPanel((open) => (open === 'filter' ? null : 'filter'));
      else if (id === 'adjust') setPanel((open) => (open === 'adjust' ? 'filter' : 'adjust'));
      else if (id === 'mode') setModeOpen(true);
      else setMoreOpen(true);
    },
    [selectedPage, handleRotate]
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
  // §9 O3: "Swipe to try filters", once, when nothing covers the strip.
  const filterHint = useHint(
    'reviewFilters',
    !!selectedPage && shownPanel === 'filter' && !cropTarget && !gridOpen && signStep === null && !mergeCrop && !checkingCrops && !moreOpen && !modeOpen
  );
  const importFromGallery = useGalleryImport();
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

  // ID card mode: recompose the page (real size or large) from its kept card images.
  const [idCardBusy, setIdCardBusy] = useState(false);
  const updateIdCard = useCallback(
    async (
      getNext: () => Promise<{ front: SourceImage; back?: SourceImage; size?: IdCardSize } | null>,
      doneMsg: string
    ) => {
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
    void updateIdCard(async () => ({ front: card.back!, back: card.front, size: card.size }), t('review.idCardSwapped'));
  }, [selectedPage, updateIdCard]);

  const handleRetakeIdBack = useCallback(() => {
    const card = selectedPage?.idCard;
    if (!card) return;
    void updateIdCard(async () => {
      const back = await scanIdCardSide(ocrScript);
      return back ? { front: card.front, back, size: card.size } : null;
    }, card.back ? t('review.idBackReplaced') : t('review.idBackAdded'));
  }, [selectedPage, updateIdCard, ocrScript]);

  const handleToggleIdSize = useCallback(() => {
    const card = selectedPage?.idCard;
    if (!card) return;
    const size: IdCardSize = card.size === 'large' ? 'real' : 'large';
    void updateIdCard(
      async () => ({ ...card, size }),
      size === 'large' ? t('review.idCardEnlarged') : t('review.idCardRealSize')
    );
  }, [selectedPage, updateIdCard]);

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

  // §17 U9: one suggestion at a time, the most important (services/review/suggestion.ts).
  const suggestion = reviewSuggestion({
    page: selectedPage,
    mode: state.capture.mode,
    cropCheckCount: cropCheckPages.length,
    processing: scanProcessing,
    dismissed,
  });
  const dismissSuggestion = useCallback((key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
  }, []);

  const handleMoreSelect = useCallback(
    (id: MoreId) => {
      if (!selectedPage) return;
      switch (id) {
        case 'retake':
          return handleRetake();
        case 'sign':
          return handleSignPress();
        case 'searchable':
          return void handleOcr();
        case 'deletePage':
          return handleDeletePage(selectedPage.id);
        case 'addPages':
          return handleAddPages();
        case 'reorder':
          return setGridOpen(true);
        case 'applyToAll':
          return handleApplyToAll();
        case 'swapSides':
          return handleSwapIdSides();
        case 'retakeBack':
          return handleRetakeIdBack();
      }
    },
    [selectedPage, handleRetake, handleSignPress, handleOcr, handleDeletePage, handleAddPages, handleApplyToAll, handleSwapIdSides, handleRetakeIdBack]
  );

  const moreSections = useMemo((): MenuSection<MoreId>[] => {
    const card = selectedPage?.idCard;
    return [
      {
        items: [
          { id: 'retake', label: t('review.more.retake'), icon: ICONS.camera },
          { id: 'sign', label: t('review.more.sign'), icon: ICONS.sign },
          { id: 'searchable', label: t('review.more.searchable'), hint: t('review.more.searchableHint'), icon: ICONS.searchable, disabled: ocrRunning },
          { id: 'deletePage', label: t('review.more.deletePage'), icon: ICONS.delete, destructive: true },
        ],
      },
      {
        items: [
          { id: 'addPages', label: t('review.more.addPages'), icon: ICONS.addPage },
          ...(multiPage
            ? [
                { id: 'reorder' as const, label: t('review.more.reorder'), icon: ICONS.reorder },
                { id: 'applyToAll' as const, label: t('review.more.applyToAll'), icon: ICONS.applyToAll },
              ]
            : []),
        ],
      },
      {
        title: card ? t('review.more.idCard') : undefined,
        items: card
          ? [
              ...(card.back ? [{ id: 'swapSides' as const, label: t('review.swapSides'), icon: ICONS.swapSides, disabled: idCardBusy }] : []),
              { id: 'retakeBack', label: card.back ? t('review.retakeBack') : t('review.addBack'), icon: ICONS.retakeBack, disabled: idCardBusy },
            ]
          : [],
      },
    ];
  }, [t, selectedPage?.idCard, ocrRunning, multiPage, idCardBusy]);

  const modeSections = useMemo(
    (): MenuSection<CaptureMode>[] => [
      {
        items: CAPTURE_MODES.map((spec) => ({
          id: spec.id,
          label: t(spec.labelKey),
          hint: t(spec.hintKey),
          icon: spec.icon,
          badge: spec.id === state.capture.mode ? { label: t('review.modeSheet.current'), tone: 'accent' as const } : undefined,
        })),
      },
    ],
    [t, state.capture.mode]
  );

  if (!selectedPage) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        {scanProcessing ? (
          <>
            <ActivityIndicator color={tokens.accent} size="large" />
            <Text color="muted" style={styles.emptyLine}>
              {progress ? t('review.processingPage', { current: Math.min(progress.done + 1, progress.total), total: progress.total }) : t('capture.processingPages')}
            </Text>
            {progress ? <Button label={t('common.cancel')} variant="ghost" size="md" onPress={cancelProcessing} style={styles.emptyLine} /> : null}
          </>
        ) : (
          <EmptyState
            title={t('review.empty')}
            body={t('review.emptyBody')}
            action={{ label: t('review.startCapture'), onPress: handleAddPages }}
            secondaryAction={{ label: t('capture.gallery'), onPress: () => void importFromGallery() }}
          />
        )}
      </View>
    );
  }

  const suggestionView = suggestion ? renderSuggestion(suggestion) : null;
  function renderSuggestion(s: Suggestion) {
    const page = selectedPage!;
    const dismiss = () => dismissSuggestion(s.key);
    const chip = (icon: IoniconName, message: string, action?: { label: string; onPress: () => void; disabled?: boolean }) => (
      <SuggestionChip key={s.key} icon={icon} message={message} action={action} onDismiss={dismiss} />
    );
    switch (s.kind) {
      case 'cropCheck':
        return chip(ICONS.crop, t('review.cropCheck', { count: cropCheckPages.length }), {
          label: t('review.checkCrops', { count: cropCheckPages.length }),
          onPress: () => setCheckingCrops(true),
        });
      case 'lowContrast':
        return chip(ICONS.enhance, t('review.suggest.lowContrast', { page: sel + 1 }), {
          label: t('review.suggest.useBw'),
          onPress: () => handleEnhanceChange('bw'),
        });
      case 'bookSpread':
        return chip(ICONS.split, t('review.suggest.book'), {
          label: t('review.suggest.split'),
          onPress: () => void handleModeChange('book'),
          disabled: !!modeBusy || scanProcessing,
        });
      case 'splitFrom':
        return chip(ICONS.split, t('review.splitFrom'), { label: t('review.undoSplit'), onPress: handleUndoSplit });
      case 'idCard': {
        const large = page.idCard?.size === 'large';
        return chip(
          ICONS.cardSize,
          idCardBusy ? t('review.idCardUpdating') : large ? t('review.idCardInfoLarge') : t('review.idCardInfo'),
          { label: large ? t('review.idCardMakeReal') : t('review.idCardMakeLarge'), onPress: handleToggleIdSize, disabled: idCardBusy }
        );
      }
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {/* §17 U9: × asks before the scan goes; Android Back does the same (navigation/backHandling.ts). */}
      <ScreenHeader
        title={t('review.title')}
        subtitle={t('review.pageOf', { current: sel + 1, total: pages.length })}
        back={handleClose}
        backIcon={ICONS.close}
        backLabel={t('review.close')}
        actions={[
          { icon: ICONS.undo, label: t('review.undo'), onPress: () => dispatch({ type: 'review/UNDO' }), disabled: !canUndo || !!modeBusy },
          { icon: ICONS.redo, label: t('review.redo'), onPress: () => dispatch({ type: 'review/REDO' }), disabled: !canRedo || !!modeBusy },
        ]}
        trailing={<Button label={t('review.next')} size="md" onPress={() => go('deliver')} disabled={!!modeBusy} style={styles.next} testID="review-next" />}
      />

      {progress ? (
        <ProcessingProgress done={progress.done} total={progress.total} onCancel={cancelProcessing} />
      ) : null}

      <View style={[styles.ribbonTrack, { backgroundColor: tokens.edge, opacity: showRibbon || modeBusy ? 1 : 0 }]}>
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
        onAddMore={handleAddPages}
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
              // Compare shows the untouched original: no sliders, no stamp.
              <FilteredPreview
                picture={shownPicture}
                contentWidth={preview.width}
                contentHeight={preview.height}
                liveAdjust={preview.adjustLive && !comparing ? liveAdjust : undefined}
                overlayPicture={comparing ? undefined : preview.overlayPicture}
              />
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
        {/* §16 G7: the page is here before its text is; over the preview, so nothing moves when it goes. */}
        {selectedPage.ocrPending || modeBusy ? (
          <View style={[styles.readingChip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]} pointerEvents="none">
            <Text variant="caption" color="muted">
              {modeBusy ? t('review.modeSheet.applying', { mode: t(getCaptureModeSpec(modeBusy).labelKey) }) : t('review.readingText')}
            </Text>
          </View>
        ) : null}
        <PreviewControls
          showCompare={showCompare}
          comparing={comparing}
          onCompareIn={() => setComparing(true)}
          onCompareOut={() => setComparing(false)}
        />
      </View>

      {suggestionView}

      {shownPanel ? (
        <View style={styles.enhanceWrap}>
          {offerApplyAll ? (
            <Touchable accessibilityRole="button" style={[styles.applyAllButton, { backgroundColor: tokens.accentSoft }]} onPress={handleApplyToAll}>
              <Text variant="caption" weight="semibold" color="accentInk" chrome>
                {t('review.applyToAll')}
              </Text>
            </Touchable>
          ) : null}
          {shownPanel === 'adjust' ? (
            <AdjustPanel value={currentAdjust} live={liveAdjust} onCommit={handleAdjustCommit} />
          ) : (
            <>
              {filterHint.visible ? (
                <Hint text={t('shared.hint.reviewFilters')} onDismiss={filterHint.dismiss} arrow="down" style={styles.filterHint} />
              ) : null}
              <FilterStrip page={selectedPage} value={selectedPage.enhance} onChange={handleEnhanceChange} />
              <FilterOptionsPanel mode={selectedPage.enhance} value={selectedPage.filterOptions} onChange={handleFilterOptionsChange} />
            </>
          )}
        </View>
      ) : null}

      <ReviewToolbar onPress={handleToolPress} open={shownPanel} adjustable={adjustable} busy={!!modeBusy} />

      <Menu visible={moreOpen} onClose={() => setMoreOpen(false)} onSelect={handleMoreSelect} sections={moreSections} title={t('review.more.title')} />
      <Menu visible={modeOpen} onClose={() => setModeOpen(false)} onSelect={(mode) => void handleModeChange(mode)} sections={modeSections} title={t('review.modeSheet.title')} />

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
  emptyLine: {
    marginTop: spacing.md,
  },
  filterHint: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  next: {
    marginLeft: spacing.xs,
    marginRight: spacing.sm,
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
    borderRadius: radii.thumb,
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
  readingChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  enhanceWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  applyAllButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radii.full,
    marginBottom: spacing.sm,
  },
});
