import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { DEFAULT_ADJUST } from './adjust';
import { renderPage } from './skiaEnhance';
import { PREVIEW_JPEG_Q, PREVIEW_MAX_DIM } from '../capture/imageSpec';
import type { AdjustValues, EnhanceMode, SessionPage } from '../../types/models';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Live preview for the Review screen's rotation, Auto/Color/Gray/B&W/Scan control and its
// brightness/contrast/saturation sliders. Every mode derives a content-adaptive matrix from the
// page's own histogram (see skiaEnhance.ts), so none of them have a cheap non-destructive preview -
// this runs the same `renderPage` used at export time (at preview resolution) against a scratch
// cache file whenever an edit changes, so the preview matches what Deliver will produce.
export function useEnhancedPreview(
  uri: string | undefined,
  mode: EnhanceMode,
  adjust: AdjustValues = DEFAULT_ADJUST,
  rotation: SessionPage['rotation'] = 0
) {
  const [previewUri, setPreviewUri] = useState<string | undefined>(uri);
  const [loading, setLoading] = useState(false);
  const bakedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!uri) {
      if (bakedRef.current) {
        deleteIfExists(bakedRef.current);
        bakedRef.current = null;
      }
      setLoading(false);
      setPreviewUri(uri);
      return;
    }

    setLoading(true);
    renderPage(uri, { rotation, enhance: mode, adjust }, { maxDim: PREVIEW_MAX_DIM, q: PREVIEW_JPEG_Q }).then((baked) => {
      if (cancelled) {
        deleteIfExists(baked.uri);
        return;
      }
      if (bakedRef.current) deleteIfExists(bakedRef.current);
      bakedRef.current = baked.uri;
      setLoading(false);
      setPreviewUri(baked.uri);
    });

    return () => {
      cancelled = true;
    };
  }, [uri, mode, rotation, adjust.brightness, adjust.contrast, adjust.saturation]);

  // Unmount-only cleanup of whatever the last successful bake produced.
  useEffect(() => {
    return () => {
      if (bakedRef.current) deleteIfExists(bakedRef.current);
    };
  }, []);

  return { previewUri, loading };
}
