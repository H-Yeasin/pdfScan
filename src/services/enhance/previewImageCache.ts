import { FilterMode, MipmapMode, Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';

// Decoded, preview-sized SkImages for the Review screen, keyed by uri + size. Holds the selected
// page and its two neighbours only (LRU of 3): a 1400 px RGBA image is ~7.5 MB, so caching the
// whole session would be the memory spike the one-page-at-a-time convention exists to avoid.
// Nothing here touches the file system beyond reading the page itself.

const MAX_ENTRIES = 3;

// Map iteration order is insertion order, so re-inserting on access keeps the oldest entry first.
const cache = new Map<string, Promise<SkImage>>();

function cacheKey(uri: string, maxDim: number) {
  return `${maxDim}|${uri}`;
}

async function decodeDownscaled(uri: string, maxDim: number): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const full = Skia.Image.MakeImageFromEncoded(data);
  if (!full) throw new Error(`Skia failed to decode image at ${uri}`);
  const srcW = full.width();
  const srcH = full.height();
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  if (scale === 1) return full;

  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Skia failed to create the preview offscreen surface');
  surface
    .getCanvas()
    .drawImageRectOptions(full, Skia.XYWHRect(0, 0, srcW, srcH), Skia.XYWHRect(0, 0, width, height), FilterMode.Linear, MipmapMode.Linear);
  surface.flush();
  // An offscreen-surface snapshot is a GPU texture owned by that surface's context; the on-screen
  // <Canvas> draws on a different one, so it needs a CPU-backed copy.
  const snapshot = surface.makeImageSnapshot();
  return snapshot.makeNonTextureImage() ?? snapshot;
}

export function loadPreviewImage(uri: string, maxDim: number): Promise<SkImage> {
  const key = cacheKey(uri, maxDim);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const pending = decodeDownscaled(uri, maxDim);
  // A failed decode must not stay cached, or the page could never be retried.
  pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  cache.set(key, pending);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return pending;
}

// Warms the cache for a neighbour so swiping to it shows the filtered preview straight away.
// Callers must load the current page first: the LRU then evicts pages two or more swipes away,
// never the one on screen.
export function prefetchPreviewImage(uri: string, maxDim: number) {
  loadPreviewImage(uri, maxDim).catch(() => undefined);
}
