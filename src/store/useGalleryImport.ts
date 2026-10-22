import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from '../navigation/router';
import { ingestGalleryBatch } from '../services/capture/ingestBatch';
import { useAppDispatch, useAppStore } from './AppStateContext';
import { captureSpecFor } from './slices/settingsSlice';
import { scanOcrScriptNow } from './useScanOcrScript';
import { useSpaceGuard } from './useSpaceGuard';

// "Import from gallery": pick photos, then the same ingest as scans (master, thumbnail, OCR, the
// current mode's filter), one photo at a time with per-page progress in Review. Moved out of
// CaptureScreen (§9 O3) so Review's empty state can offer it too. §17 U5: callable from anywhere
// (the Scan mode sheet, Tools, Review): it reads the session, the mode and the course when it
// runs, so the screen that holds it doesn't re-render on every scan change. `onPicked` runs once
// photos are chosen, before ingest starts.
export function useGalleryImport(onPicked?: () => void): () => Promise<void> {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { go } = useRouter();
  const { beforeScan } = useSpaceGuard();

  return useCallback(async () => {
    if (!(await beforeScan())) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      // Full quality: ingestPage does the one encode to the master spec.
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    onPicked?.();
    const state = store.getState();
    go('review');
    void ingestGalleryBatch(
      dispatch,
      result.assets.map((asset) => asset.uri),
      scanOcrScriptNow(state),
      captureSpecFor(state.settings, state.capture.mode)
    );
  }, [beforeScan, onPicked, go, dispatch, store]);
}
