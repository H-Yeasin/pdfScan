import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from '../navigation/router';
import { ingestGalleryBatch } from '../services/capture/ingestBatch';
import { useAppDispatch, useAppSlices } from './AppStateContext';
import { captureSpecFor } from './slices/settingsSlice';
import { useScanOcrScript } from './useScanOcrScript';
import { useSpaceGuard } from './useSpaceGuard';

// "Import from gallery": pick photos, then the same ingest as scans (master, thumbnail, OCR, the
// current mode's filter), one photo at a time with per-page progress in Review. Moved out of
// CaptureScreen (§9 O3) so Review's empty state can offer it too. `onPicked` runs once photos
// are chosen, before ingest starts.
export function useGalleryImport(onPicked?: () => void): () => Promise<void> {
  const dispatch = useAppDispatch();
  const { go } = useRouter();
  const state = useAppSlices('capture', 'settings');
  const ocrScript = useScanOcrScript();
  const { beforeScan } = useSpaceGuard();
  const spec = captureSpecFor(state.settings, state.capture.mode);

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
    go('review');
    void ingestGalleryBatch(
      dispatch,
      result.assets.map((asset) => asset.uri),
      ocrScript,
      spec
    );
  }, [beforeScan, onPicked, go, dispatch, ocrScript, spec]);
}
