import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CaptureControls } from '../components/capture/CaptureControls';
import { DocumentFrame, type FrameRect } from '../components/capture/DocumentFrame';
import { FirstRunSheet } from '../components/capture/FirstRunSheet';
import { PermissionGate } from '../components/capture/PermissionGate';
import { TopControls } from '../components/capture/TopControls';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { mapFrameToPhotoCropRect } from '../services/capture/guideCrop';
import { runNativeScannerPipeline } from '../services/capture/scannerPipeline';
import { cropPage } from '../services/enhance/enhanceService';
import { useAppState } from '../store/AppStateContext';
import { spacing } from '../theme';
import { useCaptureChrome } from '../theme/captureChrome';
import type { SessionPage } from '../types/models';
import { createId } from '../utils/id';

const CAPTURE_FLASH_MS = 150;

export function CaptureScreen() {
  const chrome = useCaptureChrome();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { flash, pages, processingStatus, errorMessage } = state.capture;
  const { firstRun, ocrScript } = state.settings;
  const busyScanning = processingStatus === 'scanning' || processingStatus === 'processing';

  useEffect(() => {
    if (processingStatus === 'success') {
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Scan complete' });
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    } else if (processingStatus === 'error') {
      dispatch({ type: 'ui/SHOW_SNACK', msg: errorMessage ?? 'Scan failed' });
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    }
  }, [processingStatus, errorMessage, dispatch]);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [frameRect, setFrameRect] = useState<FrameRect | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const busy = busyScanning || capturing;

  const addPagesFromAssets = useCallback(
    (assets: { uri: string; width: number; height: number }[]) => {
      assets.forEach((asset) => {
        const page: SessionPage = {
          id: createId('page'),
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          rotation: 0,
          enhance: 'auto',
        };
        dispatch({ type: 'capture/ADD_PAGE', page });
      });
    },
    [dispatch]
  );

  const handleImport = useCallback(async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled || result.assets.length === 0) return;

    addPagesFromAssets(result.assets);
    go('review');
  }, [addPagesFromAssets, go]);

  const handleQuickCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy) return;

    setCapturing(true);
    flashOpacity.setValue(0.85);
    Animated.timing(flashOpacity, { toValue: 0, duration: CAPTURE_FLASH_MS, useNativeDriver: true }).start();

    try {
      const photo = await camera.takePictureAsync({ quality: 0.9 });
      if (!photo) return;

      let asset = { uri: photo.uri, width: photo.width, height: photo.height };
      if (frameRect) {
        const crop = mapFrameToPhotoCropRect(
          frameRect,
          { width: screenWidth, height: screenHeight },
          { width: photo.width, height: photo.height }
        );
        try {
          asset = await cropPage(photo.uri, {
            originX: crop.x,
            originY: crop.y,
            width: crop.width,
            height: crop.height,
          });
        } catch {
          // Guide-crop failed — fall back to the uncropped photo rather than losing the capture.
        }
      }
      addPagesFromAssets([asset]);
    } finally {
      setCapturing(false);
    }
  }, [busy, flashOpacity, addPagesFromAssets, frameRect, screenWidth, screenHeight]);

  const handleScan = useCallback(() => {
    if (busy) return;
    runNativeScannerPipeline(dispatch, ocrScript);
  }, [busy, dispatch, ocrScript]);

  const handleAllowFirstRun = useCallback(async () => {
    dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: false });
    await requestPermission();
  }, [dispatch, requestPermission]);

  const handleFirstRunImportInstead = useCallback(() => {
    dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: false });
    handleImport();
  }, [dispatch, handleImport]);

  if (!permission) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: chrome.base }]}>
        <ActivityIndicator color={chrome.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <PermissionGate
        onRequestPermission={requestPermission}
        onImportInstead={handleImport}
        canAskAgain={permission.canAskAgain}
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flashOpacity }]}
      />

      <SafeAreaView style={styles.overlay} edges={['top']}>
        <TopControls
          flashMode={flash}
          onCycleFlash={() => dispatch({ type: 'capture/TOGGLE_FLASH' })}
          onSettingsPress={() => go('settings')}
        />

        <View style={styles.frameArea}>
          <DocumentFrame onMeasured={setFrameRect} />
        </View>

        <View style={styles.controlsArea}>
          <CaptureControls
            onQuickCapturePress={handleQuickCapture}
            onScanPress={handleScan}
            onGalleryPress={handleImport}
            onTrayPress={() => go('review')}
            busy={busy}
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

      {firstRun && (
        <FirstRunSheet onAllow={handleAllowFirstRun} onImportInstead={handleFirstRunImportInstead} />
      )}

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
    backgroundColor: '#0e100f',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
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
  frameArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsArea: {
    paddingBottom: spacing.lg,
  },
});
