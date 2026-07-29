import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AutoCapturePill } from '../components/capture/AutoCapturePill';
import { CaptureControls } from '../components/capture/CaptureControls';
import { DocumentFrame } from '../components/capture/DocumentFrame';
import { FirstRunSheet } from '../components/capture/FirstRunSheet';
import { LockStatusPill } from '../components/capture/LockStatusPill';
import { PermissionGate } from '../components/capture/PermissionGate';
import { TopControls } from '../components/capture/TopControls';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { runNativeScannerPipeline } from '../services/capture/scannerPipeline';
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
  const { flash, auto, pages, processingStatus, errorMessage } = state.capture;
  const { firstRun } = state.settings;
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
  const flashOpacity = useRef(new Animated.Value(0)).current;

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

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || capturing) return;

    setCapturing(true);
    flashOpacity.setValue(0.85);
    Animated.timing(flashOpacity, { toValue: 0, duration: CAPTURE_FLASH_MS, useNativeDriver: true }).start();

    try {
      const photo = await camera.takePictureAsync({ quality: 0.9 });
      if (photo) {
        addPagesFromAssets([{ uri: photo.uri, width: photo.width, height: photo.height }]);
      }
    } finally {
      setCapturing(false);
    }
  }, [capturing, flashOpacity, addPagesFromAssets]);

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
          onSmartScanPress={() => runNativeScannerPipeline(dispatch)}
          smartScanDisabled={busyScanning}
        />

        <View style={styles.frameArea}>
          <DocumentFrame locked={auto} />
        </View>

        <View style={styles.statusArea}>
          <LockStatusPill locked={auto} />
          <AutoCapturePill enabled={auto} onToggle={() => dispatch({ type: 'capture/TOGGLE_AUTO' })} />
        </View>

        <View style={styles.controlsArea}>
          <CaptureControls
            onCapturePress={handleCapture}
            onGalleryPress={handleImport}
            onTrayPress={() => go('review')}
            disabled={capturing}
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
            {processingStatus === 'scanning' ? 'Scanning…' : 'Processing pages…'}
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
  statusArea: {
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  controlsArea: {
    paddingBottom: spacing.lg,
  },
});
