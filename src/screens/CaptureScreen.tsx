import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CaptureControls } from '../components/capture/CaptureControls';
import { CourseBadge } from '../components/courses/CourseBadge';
import { FolderPickerModal } from '../components/deliver/FolderPickerModal';
import { TabBar } from '../components/shared/TabBar';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { ingestGalleryBatch } from '../services/capture/ingestBatch';
import { runNativeScannerPipeline } from '../services/capture/scannerPipeline';
import { resolveOcrScript } from '../services/scripts/registry';
import { useAppState } from '../store/AppStateContext';
import { captureSpecFor } from '../store/slices/settingsSlice';
import { useFilingCourse } from '../store/useFilingCourse';
import { createId } from '../utils/id';
import { radii, spacing } from '../theme';
import { useCaptureChrome } from '../theme/captureChrome';
import type { CaptureMode } from '../types/models';

export function CaptureScreen() {
  const chrome = useCaptureChrome();
  const { t } = useT();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages, processingStatus, mode, scannerRequested } = state.capture;
  const { loaded: settingsLoaded, firstRun, lastCaptureMode, scannerUnavailable } = state.settings;
  const busyScanning = processingStatus === 'scanning' || processingStatus === 'processing';
  const spec = useMemo(() => captureSpecFor(state.settings, mode), [state.settings, mode]);
  // "Saving to" chip (K5): where this scan will be filed, so it can be changed before scanning.
  const { courseId: filingCourseId } = useFilingCourse();
  const filingCourse = state.library.courses.find((c) => c.id === filingCourseId);
  // §6 L1: the filing course's recognition script, else the app setting.
  const ocrScript = resolveOcrScript({ course: filingCourse, settings: state.settings });
  const hasCourses = state.library.courses.some((c) => !c.archived);
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const restoredMode = useRef(false);

  // Restore the last-used mode once settings are in. Only on the first visit with an empty
  // session: mid-session (e.g. "Add more") the mode the user is already scanning in wins.
  useEffect(() => {
    if (!settingsLoaded || restoredMode.current) return;
    restoredMode.current = true;
    if (pages.length === 0 && mode !== lastCaptureMode) dispatch({ type: 'capture/SET_MODE', mode: lastCaptureMode });
  }, [settingsLoaded, lastCaptureMode, mode, pages.length, dispatch]);

  // Picking a mode (or starting a scan) counts as having seen the picker, which is what turns
  // a requested scanner launch possible on later visits - see the effect below.
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
    runNativeScannerPipeline(dispatch, ocrScript, spec, { scannerUnavailable });
  }, [busyScanning, dispatch, ocrScript, spec, markPickerSeen, scannerUnavailable]);

  // Opens the scanner on arrival only when asked to (capture.scannerRequested: a "scan now" button
  // like Home's Scan, a course's Scan, Retake or Add more). Arriving any other way - the Scan tab,
  // app start, Back from Review - just shows this screen, and the camera opens from the shutter.
  // Never on a first visit either: the mode picker must stay visible instead of being covered by
  // the full-screen scanner. Waits for settings so a returning user's stored firstRun/
  // lastCaptureMode are known; uses the restored mode explicitly because the SET_MODE dispatched
  // by the restore effect hasn't re-rendered yet in this pass.
  useEffect(() => {
    if (!settingsLoaded || !scannerRequested) return;
    dispatch({ type: 'capture/REQUEST_SCANNER', requested: false });
    if (firstRun || busyScanning) return;
    const launchMode = pages.length === 0 ? lastCaptureMode : mode;
    runNativeScannerPipeline(dispatch, ocrScript, captureSpecFor(state.settings, launchMode), { scannerUnavailable });
    // Runs when a request is pending; the request is consumed first, so it launches once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, scannerRequested]);

  return (
    <View style={[styles.container, { backgroundColor: chrome.base }]}>
      <StatusBar style="light" />

      <SafeAreaView style={styles.overlay} edges={['top']}>
        <View style={styles.topRow}>
          {hasCourses ? (
            <Pressable
              onPress={() => setCoursePickerOpen(true)}
              hitSlop={8}
              style={[styles.savingTo, { backgroundColor: chrome.pillBg, borderColor: chrome.pillBorder }]}
              accessibilityRole="button"
              accessibilityLabel={t('capture.savingToA11y', { name: filingCourse?.name ?? t('common.unsorted') })}
            >
              {filingCourse ? <CourseBadge course={filingCourse} size={22} /> : null}
              <Text style={[styles.savingToLabel, { color: chrome.textDim }]}>{t('capture.savingTo')}</Text>
              <Text style={[styles.savingToCourse, { color: chrome.text }]} numberOfLines={1}>
                {filingCourse ? filingCourse.code || filingCourse.name : t('common.unsorted')}
              </Text>
              <Ionicons name="chevron-down" size={14} color={chrome.textDim} />
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={() => go('settings')}
            hitSlop={8}
            style={[styles.settingsButton, { backgroundColor: chrome.pillBg, borderColor: chrome.pillBorder }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.settings')}
          >
            <Ionicons name="settings-outline" size={20} color={chrome.text} />
          </Pressable>
        </View>

        <View style={styles.centerArea}>
          <Ionicons name={spec.icon} size={56} color={chrome.textDim} />
          <Text style={[styles.title, { color: chrome.text }]}>{t(spec.labelKey)}</Text>
          <Text style={[styles.subtitle, { color: chrome.textDim }]}>{t(spec.hintKey)}</Text>
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

      <FolderPickerModal
        visible={coursePickerOpen}
        courses={state.library.courses}
        selectedCourseId={filingCourseId}
        onSelect={(id) => dispatch({ type: 'deliver/SET_COURSE', courseId: id })}
        onCreate={(name) => {
          const id = createId('course');
          dispatch({ type: 'library/CREATE_COURSE', id, name });
          return id;
        }}
        onClose={() => setCoursePickerOpen(false)}
      />

      {busyScanning && (
        <View style={[StyleSheet.absoluteFill, styles.scanOverlay]}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.scanOverlayLabel}>
            {processingStatus === 'scanning' ? t('capture.openingScanner') : t('capture.processingPages')}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  savingTo: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  savingToLabel: {
    fontSize: 13,
  },
  savingToCourse: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
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
