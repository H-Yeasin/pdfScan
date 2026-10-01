import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { bakeEnhance } from './skiaEnhance';
import type { FilterPage } from './filters/drawFiltered';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Live preview for the Review screen's filter picker plus its brightness/contrast/saturation
// sliders. This runs the same `bakeEnhance` used at export time against a scratch cache file
// whenever the filter, sliders or options change, keeping the preview pixel-identical to what
// Deliver will actually produce. E2 replaces it with an SkPicture from drawFiltered (no files).
export function useEnhancedPreview(uri: string | undefined, page: FilterPage | undefined) {
  const [previewUri, setPreviewUri] = useState<string | undefined>(uri);
  const [loading, setLoading] = useState(false);
  const bakedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!uri || !page) {
      if (bakedRef.current) {
        deleteIfExists(bakedRef.current);
        bakedRef.current = null;
      }
      setLoading(false);
      setPreviewUri(uri);
      return;
    }

    setLoading(true);
    bakeEnhance(uri, page).then((baked) => {
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
    // Keyed on the fields that change the output, not `page` identity: unrelated page updates (OCR
    // landing, err flag) must not trigger a re-bake. `stats` is left out on purpose - it only ever
    // goes from undefined to the values drawFiltered would measure anyway, or is dropped together
    // with a `uri` change, so it never changes the rendered pixels on its own.
  }, [uri, page?.enhance, page?.adjust, page?.filterOptions]);

  // Unmount-only cleanup of whatever the last successful bake produced.
  useEffect(() => {
    return () => {
      if (bakedRef.current) deleteIfExists(bakedRef.current);
    };
  }, []);

  return { previewUri, loading };
}
