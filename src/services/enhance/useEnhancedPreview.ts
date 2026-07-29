import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { bakeEnhance, isBakeableEnhance } from './skiaEnhance';
import type { EnhanceMode } from '../../types/models';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Live preview for the Review screen's Auto/Color/Gray/B&W/Scan segmented control. gray/bw/
// document_scan have no cheap non-destructive preview (document_scan in particular is a
// RuntimeEffect shader, not a color matrix), so this runs the same `bakeEnhance` used at export
// time against a scratch cache file whenever the mode changes, keeping the preview pixel-identical
// to what Deliver will actually produce. auto/color are pass-through and never bake.
export function useEnhancedPreview(uri: string | undefined, mode: EnhanceMode) {
  const [previewUri, setPreviewUri] = useState<string | undefined>(uri);
  const [loading, setLoading] = useState(false);
  const bakedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!uri || !isBakeableEnhance(mode)) {
      if (bakedRef.current) {
        deleteIfExists(bakedRef.current);
        bakedRef.current = null;
      }
      setLoading(false);
      setPreviewUri(uri);
      return;
    }

    setLoading(true);
    bakeEnhance(uri, mode).then((baked) => {
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
  }, [uri, mode]);

  // Unmount-only cleanup of whatever the last successful bake produced.
  useEffect(() => {
    return () => {
      if (bakedRef.current) deleteIfExists(bakedRef.current);
    };
  }, []);

  return { previewUri, loading };
}
