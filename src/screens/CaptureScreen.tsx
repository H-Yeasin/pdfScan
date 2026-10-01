import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CaptureControls } from '../components/capture/CaptureControls';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import { getCaptureModeSpec } from '../services/capture/captureModes';
import { ingestGalleryBatch } from '../services/capture/ingestBatch';
import { runNativeScannerPipeline } from '../services/capture/scannerPipeline';
import { useAppState } from '../store/AppStateContext';
import { radii, spacing } from '../theme';
import { useCaptureChrome } from '../theme/captureChrome';
import type { CaptureMode } from '../types/models';

export function CaptureScreen() {
  const chrome = useCaptureChrome();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages, processingStatus, mode } = state.capture;
  const { ocrScript, loaded: settingsLoaded, firstRun, lastCaptureMode } = state.settings;
  const busyScanning = processingStatus === 'scanning' || processingStatus === 'processing';
  const spec = getCaptureModeSpec(mode);
  const hasAutoLaunched = useRef(false);
  const restoredMode = useRef(false);

  // Restore the last-used mode once settings are in. Only on the first visit with an empty
  // session: mid-session (e.g. "Add more") the mode the user is already scanning in wins.
  useEffect(() => {
    if (!settingsLoaded || restoredMode.current) return;
    restoredMode.current = true;
    if (pages.length === 0 && mode !== lastCaptureMode) dispatch({ type: 'capture/SET_MODE', mode: lastCaptureMode });
  }, [settingsLoaded, lastCaptureMode, mode, pages.length, dispatch]);

  // Picking a mode (or starting a scan) counts as having seen the picker, which is what turns
  // the auto-launch on for later visits - see the effect below.
  const markPickerSeen = useCallback(() => {
    if (firstRun) dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: false });
  }, [dispatch, firstRun]);

  const handleModeChange = useCallback(
    (next: CaptureMode) => {
      dispatch({ type: 'capture/SET_MODE', mode: next });
      dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: next });
      markPickerSeen();
    },
    [dispatch, markPickerSeen]
  );

  // Success/error handling and the post-scan navigation to Review now live in AppNavigator
  // (always mounted), not here - this screen unmounts as soon as the native scan hands off raw
  // images (status flips to 'processing'), so it can no longer be the one reacting to the
  // eventual 'success'/'error' that lands after the slow downscale/OCR loop finishes.

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

    markPickerSeen();
    go('review');
    // Same ingest as scans (master, thumbnail, OCR, the mode's filter), one photo at a time with
    // per-page progress in Review.
    void ingestGalleryBatch(
      dispatch,
      result.assets.map((asset) => asset.uri),
      ocrScript,
      spec
    );
  }, [dispatch, go, markPickerSeen, ocrScript, spec]);

  const handleScan = useCallback(() => {
    if (busyScanning) return;
    markPickerSeen();
    runNativeScannerPipeline(dispatch, ocrScript, spec);
  }, [busyScanning, dispatch, ocrScript, spec, markPickerSeen]);

  // Opens the scanner straight away on entering this tab - but only once the user has picked a
  // mode at least once (firstRun false). On a first visit the picker must stay visible instead
  // of being covered by the full-screen scanner. Waits for settings so a returning user's
  // stored firstRun/lastCaptureMode are known; uses the restored mode explicitly because the
  // SET_MODE dispatched by the restore effect hasn't re-rendered yet in this pass.
  useEffect(() => {
    if (!settingsLoaded || hasAutoLaunched.current) return;
    hasAutoLaunched.current = true;
    if (firstRun || busyScanning) return;
    const launchMode = pages.length === 0 ? lastCaptureMode : mode;
    runNativeScannerPipeline(dispatch, ocrScript, getCaptureModeSpec(launchMode));
    // Once per mount (i.e. once per visit to this tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

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
          <Ionicons name={spec.icon} size={56} color={chrome.textDim} />
          <Text style={[styles.title, { color: chrome.text }]}>{spec.label}</Text>
          <Text style={[styles.subtitle, { color: chrome.textDim }]}>{spec.hint}</Text>
        </View>

        <View style={styles.controlsArea}>
          <CaptureControls
            onScanPress={handleScan}
            onGalleryPress={handleImport}
            onTrayPress={() => go('review')}
            busy={busyScanning}
            pageCount={pages.length}
            lastPage={pages[pages.length - 1]}
            mode={mode}
            onModeChange={handleModeChange}
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
