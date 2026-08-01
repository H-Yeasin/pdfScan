import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { DEFAULT_ADJUST } from './adjust';
import { bakeEnhance, needsBake } from './skiaEnhance';
import type { AdjustValues, EnhanceMode } from '../../types/models';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Live preview for the Review screen's Auto/Color/Gray/B&W/Scan control plus its brightness/
// contrast/saturation sliders. gray/bw/document_scan have no cheap non-destructive preview
// (document_scan in particular is a RuntimeEffect shader, not a color matrix), and neither does
// any non-default adjust value, so this runs the same `bakeEnhance` used at export time against a
// scratch cache file whenever mode or adjust changes, keeping the preview pixel-identical to what
// Deliver will actually produce. auto/color with untouched sliders stay pass-through and never bake.
export function useEnhancedPreview(uri: string | undefined, mode: EnhanceMode, adjust: AdjustValues = DEFAULT_ADJUST) {
  const [previewUri, setPreviewUri] = useState<string | undefined>(uri);
  const [loading, setLoading] = useState(false);
  const bakedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!uri || !needsBake(mode, adjust)) {
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
