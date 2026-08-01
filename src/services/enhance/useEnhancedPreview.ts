import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { DEFAULT_ADJUST } from './adjust';
import { bakeEnhance } from './skiaEnhance';
import type { AdjustValues, EnhanceMode } from '../../types/models';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Live preview for the Review screen's Auto/Color/Gray/B&W/Scan control plus its brightness/
// contrast/saturation sliders. Every mode now derives a content-adaptive matrix from the page's
// own histogram (see skiaEnhance.ts), so none of them have a cheap non-destructive preview - this
// runs the same `bakeEnhance` used at export time against a scratch cache file whenever mode or
// adjust changes, keeping the preview pixel-identical to what Deliver will actually produce.
export function useEnhancedPreview(uri: string | undefined, mode: EnhanceMode, adjust: AdjustValues = DEFAULT_ADJUST) {
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
    bakeEnhance(uri, mode, adjust).then((baked) => {
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
  }, [uri, mode, adjust.brightness, adjust.contrast, adjust.saturation]);

  // Unmount-only cleanup of whatever the last successful bake produced.
  useEffect(() => {
    return () => {
      if (bakedRef.current) deleteIfExists(bakedRef.current);
    };
  }, []);

  return { previewUri, loading };
}
