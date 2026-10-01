import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CaptureControls } from '../components/capture/CaptureControls';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { ingestPage } from '../services/capture/ingest';
import { runNativeScannerPipeline } from '../services/capture/scannerPipeline';
import { useAppState } from '../store/AppStateContext';
import { radii, spacing } from '../theme';
import { useCaptureChrome } from '../theme/captureChrome';
import type { SessionPage } from '../types/models';

export function CaptureScreen() {
  const chrome = useCaptureChrome();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages, processingStatus } = state.capture;
  const { ocrScript } = state.settings;
  const busyScanning = processingStatus === 'scanning' || processingStatus === 'processing';
  const hasAutoLaunched = useRef(false);

  // Success/error handling and the post-scan navigation to Review now live in AppNavigator
  // (always mounted), not here - this screen unmounts as soon as the native scan hands off raw
  // images (status flips to 'processing'), so it can no longer be the one reacting to the
  // eventual 'success'/'error' that lands after the slow downscale/OCR loop finishes.

  // Gallery photos go through the same ingest as scans (master downscale, thumbnail, OCR), one at
  // a time - full-size phone photos are large enough that doing them concurrently risks OOM.
  const addPagesFromAssets = useCallback(
    async (assets: { uri: string }[]) => {
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
      const newPages: SessionPage[] = [];
      try {
        for (const asset of assets) newPages.push(await ingestPage(asset.uri, ocrScript));
        dispatch({ type: 'capture/BULK_ADD_PAGES', pages: newPages });
        dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
      } catch (error) {
        if (newPages.length > 0) dispatch({ type: 'capture/BULK_ADD_PAGES', pages: newPages });
        dispatch({
          type: 'capture/SET_PROCESSING_STATUS',
          status: 'error',
          errorMessage: `Couldn't import ${assets.length - newPages.length} photo(s)`,
        });
      }
    },
    [dispatch, ocrScript]
  );

  const handleImport = useCallback(async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      // Full quality: ingestPage does the one encode to the master spec.
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    go('review');
    addPagesFromAssets(result.assets);
  }, [addPagesFromAssets, go]);

  const handleScan = useCallback(() => {
    if (busyScanning) return;
    runNativeScannerPipeline(dispatch, ocrScript);
  }, [busyScanning, dispatch, ocrScript]);

  useEffect(() => {
    if (hasAutoLaunched.current) return;
    hasAutoLaunched.current = true;
    handleScan();
    // Auto-launch only once per mount (i.e. once per visit to this tab) — handleScan itself
    // guards against being triggered again while a scan is already in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: chrome.base }]}>
      <StatusBar style="light" />

      <SafeAreaView style={styles.overlay} edges={['top']}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => go('settings')}
            hitSlop={8}
            style={[styles.settingsButton, { backgroundColor: chrome.pillBg, borderColor: chrome.pillBorder }]}
          >
            <Ionicons name="settings-outline" size={20} color={chrome.text} />
          </Pressable>
        </View>

        <View style={styles.centerArea}>
          <Ionicons name="scan-outline" size={56} color={chrome.textDim} />
          <Text style={[styles.title, { color: chrome.text }]}>Ready to scan</Text>
          <Text style={[styles.subtitle, { color: chrome.textDim }]}>
            Tap the scan button to capture a document.
          </Text>
        </View>

        <View style={styles.controlsArea}>
          <CaptureControls
            onScanPress={handleScan}
            onGalleryPress={handleImport}
            onTrayPress={() => go('review')}
            busy={busyScanning}
            pageCount={pages.length}
            lastPage={pages[pages.length - 1]}
          />
        </View>
      </SafeAreaView>

      <TabBar
        active="capture"
        background="rgba(0,0,0,.5)"
        activeColor={chrome.text}
        inactiveColor={chrome.textDim}
        accent={chrome.accent}
      />

      {busyScanning && (
        <View style={[StyleSheet.absoluteFill, styles.scanOverlay]}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.scanOverlayLabel}>
            {processingStatus === 'scanning' ? 'Opening scanner…' : 'Processing pages…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  scanOverlay: {
    backgroundColor: 'rgba(0,0,0,.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  scanOverlayLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  controlsArea: {
    paddingBottom: spacing.lg,
  },
});
