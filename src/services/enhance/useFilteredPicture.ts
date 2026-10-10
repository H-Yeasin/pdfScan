import { useEffect, useMemo, useState } from 'react';
import { Skia } from '@shopify/react-native-skia';
import type { SkCanvas, SkImage, SkPicture } from '@shopify/react-native-skia';
import { drawFiltered, drawRotated, rotatedSize } from './filters/drawFiltered';
import type { FilterPage } from './filters/drawFiltered';
import { loadPreviewImage, prefetchPreviewImage } from './previewImageCache';
import { DEFAULT_ADJUST } from './adjust';
import type { SessionPage } from '../../types/models';

// Draws extra content (e.g. the academic border/header/footer) on top of the filtered page, in the
// preview's own (already rotated) pixel space. Must be memoized by the caller: a new function re-records.
export type PictureOverlay = (canvas: SkCanvas, width: number, height: number) => void;

type FilteredPictureOptions = {
  // §16 G7: record the page without its slider adjustment (and without the overlay, returned as
  // `overlayPicture`): the caller applies the sliders as it draws, from shared values, so a drag
  // re-records nothing (components/review/FilteredPreview). Only for a filter that takes them.
  adjustLive?: boolean;
  // Neighbouring pages' uris, decoded ahead of time so swiping lands on a ready preview.
  prefetchUris?: (string | undefined)[];
  overlay?: PictureOverlay;
};

export type FilteredPicture = {
  picture: SkPicture;
  // The unfiltered page from the same decoded image, for press-and-hold Compare.
  originalPicture: SkPicture;
  // With `adjustLive`: what goes over the adjusted page, when there is an overlay.
  overlayPicture?: SkPicture;
  // True when `picture` still needs the sliders applied by whoever draws it.
  adjustLive: boolean;
  width: number;
  height: number;
};

function recordPicture(width: number, height: number, draw: (canvas: SkCanvas) => void): SkPicture {
  const recorder = Skia.PictureRecorder();
  draw(recorder.beginRecording(Skia.XYWHRect(0, 0, width, height)));
  return recorder.finishRecordingAsPicture();
}

// Live Review preview with no temporary files. The page is decoded once into a preview-sized
// SkImage (previewImageCache), and every filter or option change only re-records
// drawFiltered - the exact call the export makes - into an SkPicture, which is cheap (it records
// draw commands; the GPU does the pixel work when the <Canvas> renders it). The preview differs
// from the export only in resolution. A slider drag doesn't even re-record (`adjustLive`).
export function useFilteredPicture(
  page: (FilterPage & { uri: string; rotation?: SessionPage['rotation'] }) | undefined,
  previewMaxDim: number,
  { adjustLive = false, prefetchUris, overlay }: FilteredPictureOptions = {}
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
  const effectiveAdjust = adjustLive ? DEFAULT_ADJUST : page?.adjust;
  const stats = page?.stats;
  const filterOptions = page?.filterOptions;
  const rotation = page?.rotation ?? 0;

  // Recorded once per decoded image.
  const originalPicture = useMemo(() => {
    if (!image) return null;
    const out = { ...rotatedSize(image.width(), image.height(), rotation), scale: 1 };
    return recordPicture(out.width, out.height, (canvas) =>
      drawRotated(canvas, image.width(), image.height(), rotation, out, (rect) =>
        canvas.drawImageRect(image, rect, rect, Skia.Paint())
      )
    );
  }, [image, rotation]);

  const result = useMemo<FilteredPicture | null>(() => {
    if (!image || !enhance || !originalPicture) return null;
    const out = { ...rotatedSize(image.width(), image.height(), rotation), scale: 1 };
    const filterPage: FilterPage = { enhance, adjust: effectiveAdjust, stats, filterOptions };
    const picture = recordPicture(out.width, out.height, (canvas) => {
      drawRotated(canvas, image.width(), image.height(), rotation, out, (rect) =>
        drawFiltered(canvas, image, filterPage, rect)
      );
      if (!adjustLive) overlay?.(canvas, out.width, out.height);
    });
    // Apart from the page, so the sliders' paint doesn't tint the border and the header.
    const overlayPicture =
      adjustLive && overlay ? recordPicture(out.width, out.height, (canvas) => overlay(canvas, out.width, out.height)) : undefined;
    return { picture, originalPicture, overlayPicture, adjustLive, width: out.width, height: out.height };
  }, [image, originalPicture, rotation, enhance, effectiveAdjust, adjustLive, stats, filterOptions, overlay]);

  return {
    preview: result,
    loading: !!uri && !result && failedUri !== uri,
    failed: !!uri && failedUri === uri,
  };
}
