import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContextBar } from '../components/review/ContextBar';
import { CropOverlay } from '../components/review/CropOverlay';
import { EnhanceSegmented } from '../components/review/EnhanceSegmented';
import { ThumbnailStrip } from '../components/review/ThumbnailStrip';
import { ZoomableImage } from '../components/shared/ZoomableImage';
import { useRouter } from '../navigation/router';
import { rotatePage } from '../services/enhance/enhanceService';
import { cropPage } from '../services/enhance/enhanceService';
import { useEnhancedPreview } from '../services/enhance/useEnhancedPreview';
import { runOcr } from '../services/ocr/ocrService';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';

const OCR_SPARSE_THRESHOLD = 6;

export function ReviewScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages } = state.capture;
  const { sel, ocrRunning } = state.review;
  const [cropTarget, setCropTarget] = useState<string | null>(null);

  const selectedPage = pages[sel] ?? pages[0];
  const multiPage = pages.length > 1;

  const { previewUri, loading: enhancePreviewLoading } = useEnhancedPreview(
    selectedPage?.uri,
    selectedPage?.enhance ?? 'auto'
  );

  const ribbon = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ocrRunning) return;
    ribbon.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ribbon, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [ocrRunning, ribbon]);

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      dispatch({ type: 'capture/REORDER_PAGES', fromIndex, toIndex });
      dispatch({ type: 'review/SELECT_PAGE', index: toIndex });
    },
    [dispatch]
  );

  const handleEnhanceChange = useCallback(
    (enhance: typeof selectedPage.enhance) => {
      if (!selectedPage) return;
      dispatch({ type: 'capture/SET_PAGE_ENHANCE', id: selectedPage.id, enhance });
    },
    [dispatch, selectedPage]
  );

  const handleRotate = useCallback(async () => {
    if (!selectedPage) return;
    const rotated = await rotatePage(selectedPage.uri, 90);
    dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: rotated });
  }, [dispatch, selectedPage]);

  const handleOcr = useCallback(async () => {
    if (!selectedPage || ocrRunning) return;
    dispatch({ type: 'review/SET_OCR_RUNNING', running: true });
    const ocr = await runOcr(selectedPage.uri);
    const err = !ocr || ocr.text.trim().length < OCR_SPARSE_THRESHOLD;
    dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: { ocr, err } });
    dispatch({ type: 'review/SET_OCR_RUNNING', running: false });
    dispatch({
      type: 'ui/SHOW_SNACK',
      msg: ocr && !err ? 'OCR finished · text is searchable' : 'OCR finished · little or no text found',
    });
  }, [dispatch, selectedPage, ocrRunning]);

  const handleContextBarPress = useCallback(
    (id: 'crop' | 'rotate' | 'retake' | 'ocr') => {
      if (id === 'crop') setCropTarget(selectedPage?.id ?? null);
      else if (id === 'rotate') handleRotate();
      else if (id === 'retake') go('capture', 'back');
      else if (id === 'ocr') handleOcr();
    },
    [selectedPage, handleRotate, handleOcr, go]
  );

  const handleCropConfirm = useCallback(
    async (cropRect: { originX: number; originY: number; width: number; height: number }) => {
      if (!selectedPage) return;
      const cropped = await cropPage(selectedPage.uri, cropRect);
      dispatch({ type: 'capture/UPDATE_PAGE', id: selectedPage.id, patch: cropped });
      setCropTarget(null);
    },
    [dispatch, selectedPage]
  );

  const showErrHint = !!selectedPage?.err && selectedPage.enhance !== 'bw';

  if (!selectedPage) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>No pages captured yet.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('capture', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Review</Text>
        <Pressable style={[styles.nextButton, { backgroundColor: tokens.accent }]} onPress={() => go('deliver')}>
          <Text style={styles.nextLabel}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.ribbonTrack, { backgroundColor: tokens.edge, opacity: ocrRunning ? 1 : 0 }]}>
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

      {multiPage && (
        <ThumbnailStrip
          pages={pages}
          selectedIndex={sel}
          onSelect={(index) => dispatch({ type: 'review/SELECT_PAGE', index })}
          onReorder={handleReorder}
          onAddMore={() => go('capture')}
        />
      )}

      <View style={styles.previewArea}>
        <ZoomableImage uri={previewUri ?? selectedPage.uri} />
        {enhancePreviewLoading && (
          <View style={styles.previewLoading} pointerEvents="none">
            <ActivityIndicator color={tokens.accent} />
          </View>
        )}
      </View>

      {showErrHint && (
        <View style={[styles.errHint, { backgroundColor: `${tokens.danger}1A` }]}>
          <Text style={{ color: tokens.danger, fontSize: 13, fontWeight: '500' }}>
            Low contrast on page {sel + 1} — try B&W.
          </Text>
        </View>
      )}

      <View style={styles.enhanceWrap}>
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
});
