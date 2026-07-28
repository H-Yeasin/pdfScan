import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AutoCapturePill } from '../components/capture/AutoCapturePill';
import { CaptureControls } from '../components/capture/CaptureControls';
import { DocumentFrame } from '../components/capture/DocumentFrame';
import { LockStatusPill } from '../components/capture/LockStatusPill';
import { TabBar } from '../components/capture/TabBar';
import { TopControls } from '../components/capture/TopControls';
import { useDocumentLock } from '../hooks/useDocumentLock';
import { colors, spacing } from '../theme';
import type { CapturedPage } from '../types/capture';
import { PermissionGate } from '../components/capture/PermissionGate';

const FLASH_CYCLE: FlashMode[] = ['auto', 'on', 'off'];
const NEXT_PAGE_DELAY_MS = 550;

export function CaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [flashMode, setFlashMode] = useState<FlashMode>('auto');
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [lastPage, setLastPage] = useState<CapturedPage>();

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;

    beginCapture();
    try {
      const photo = await camera.takePictureAsync({ quality: 0.9 });
      if (photo) {
        setLastPage({
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
          capturedAt: Date.now(),
        });
      }
    } finally {
      setTimeout(resetForNextPage, NEXT_PAGE_DELAY_MS);
    }
  }, []);

  const { lockState, beginCapture, resetForNextPage } = useDocumentLock(autoCaptureEnabled, handleCapture);

  const handleCycleFlash = useCallback(() => {
    setFlashMode((current) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(current) + 1) % FLASH_CYCLE.length]);
  }, []);

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return <PermissionGate onRequestPermission={requestPermission} canAskAgain={permission.canAskAgain} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flashMode} />

      <SafeAreaView style={styles.overlay} edges={['top']}>
        <TopControls flashMode={flashMode} onCycleFlash={handleCycleFlash} />

        <View style={styles.frameArea}>
          <DocumentFrame lockState={lockState} />
        </View>

        <View style={styles.statusArea}>
          <LockStatusPill lockState={lockState} />
          <AutoCapturePill enabled={autoCaptureEnabled} onToggle={() => setAutoCaptureEnabled((v) => !v)} />
        </View>

        <View style={styles.controlsArea}>
          <CaptureControls
            onCapturePress={handleCapture}
            disabled={lockState === 'capturing'}
            lastPage={lastPage}
          />
        </View>
      </SafeAreaView>

      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  overlay: {
    flex: 1,
  },
  frameArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusArea: {
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  controlsArea: {
    paddingBottom: spacing.xl,
  },
});
