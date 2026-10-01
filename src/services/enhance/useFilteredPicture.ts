import { useEffect, useMemo, useState } from 'react';
import { Skia } from '@shopify/react-native-skia';
import type { SkCanvas, SkImage, SkPicture } from '@shopify/react-native-skia';
import { drawFiltered } from './filters/drawFiltered';
import type { FilterPage } from './filters/drawFiltered';
import { loadPreviewImage, prefetchPreviewImage } from './previewImageCache';
import type { AdjustValues } from '../../types/models';

// Draws extra content (e.g. the academic border/header/footer) on top of the filtered page, in the
// preview image's own pixel space. Must be memoized by the caller: a new function re-records.
export type PictureOverlay = (canvas: SkCanvas, width: number, height: number) => void;

type FilteredPictureOptions = {
  // Live slider values while dragging; they override page.adjust without touching the store.
  adjust?: AdjustValues;
  // Neighbouring pages' uris, decoded ahead of time so swiping lands on a ready preview.
  prefetchUris?: (string | undefined)[];
  overlay?: PictureOverlay;
};

export type FilteredPicture = {
  picture: SkPicture;
  // The unfiltered page from the same decoded image, for press-and-hold Compare.
  originalPicture: SkPicture;
  width: number;
  height: number;
};

function recordPicture(width: number, height: number, draw: (canvas: SkCanvas) => void): SkPicture {
  const recorder = Skia.PictureRecorder();
  draw(recorder.beginRecording(Skia.XYWHRect(0, 0, width, height)));
  return recorder.finishRecordingAsPicture();
}

// Live Review preview with no temporary files. The page is decoded once into a preview-sized
// SkImage (previewImageCache), and every filter, option or slider change only re-records
// drawFiltered - the exact call the export makes - into an SkPicture, which is cheap (it records
// draw commands; the GPU does the pixel work when the <Canvas> renders it). The preview differs
// from the export only in resolution.
export function useFilteredPicture(
  page: (FilterPage & { uri: string }) | undefined,
  previewMaxDim: number,
  { adjust, prefetchUris, overlay }: FilteredPictureOptions = {}
) {
  const uri = page?.uri;
  const [loaded, setLoaded] = useState<{ uri: string; maxDim: number; image: SkImage } | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    loadPreviewImage(uri, previewMaxDim)
      .then((image) => {
        if (!cancelled) setLoaded({ uri, maxDim: previewMaxDim, image });
      })
      .catch((error) => {
        console.warn('useFilteredPicture: failed to decode preview image', error);
        if (!cancelled) setFailedUri(uri);
      });
    return () => {
      cancelled = true;
    };
  }, [uri, previewMaxDim]);

  const prefetchKey = (prefetchUris ?? []).join('\n');
  useEffect(() => {
    // After the current page's load above (effects run in order), so the LRU keeps it.
    if (!prefetchKey) return;
    for (const neighbour of prefetchKey.split('\n')) if (neighbour) prefetchPreviewImage(neighbour, previewMaxDim);
  }, [prefetchKey, previewMaxDim]);

  // Only the image for the CURRENT uri counts: right after a swipe or crop, `loaded` still holds
  // the previous page, and drawing the new page's filter over the old pixels would flash wrong.
  const image = loaded && loaded.uri === uri && loaded.maxDim === previewMaxDim ? loaded.image : null;
  const enhance = page?.enhance;
  const effectiveAdjust = adjust ?? page?.adjust;
  const stats = page?.stats;
  const filterOptions = page?.filterOptions;

  // Recorded once per decoded image; slider drags re-record only the filtered picture below.
  const originalPicture = useMemo(() => {
    if (!image) return null;
    const rect = Skia.XYWHRect(0, 0, image.width(), image.height());
    return recordPicture(rect.width, rect.height, (canvas) => canvas.drawImageRect(image, rect, rect, Skia.Paint()));
  }, [image]);

  const result = useMemo<FilteredPicture | null>(() => {
    if (!image || !enhance || !originalPicture) return null;
    const width = image.width();
    const height = image.height();
    const rect = Skia.XYWHRect(0, 0, width, height);
    const filterPage: FilterPage = { enhance, adjust: effectiveAdjust, stats, filterOptions };
    const picture = recordPicture(width, height, (canvas) => {
      drawFiltered(canvas, image, filterPage, rect);
      overlay?.(canvas, width, height);
    });
    return { picture, originalPicture, width, height };
  }, [image, originalPicture, enhance, effectiveAdjust, stats, filterOptions, overlay]);

  return {
    preview: result,
    loading: !!uri && !result && failedUri !== uri,
    failed: !!uri && failedUri === uri,
  };
}
