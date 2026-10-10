import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { decodeImage } from '../../../services/pdf/pdfNative';
import type { PdfColorMatrix } from '../../../services/pdf/pdfNative';
import type { PdfSession } from '../../../services/pdf/pdfSession';
import { nightMatrix, paletteKey, type NightPalette } from '../../../services/reader/darkMatrix';
import type { PageCache } from '../../../services/reader/pageCache';
import { RENDER_QUALITY, type PageRange, type RenderSpec } from '../../../services/reader/renderPlan';
import { createRenderQueue, type RenderQueue } from '../../../services/reader/renderQueue';

// §18 W9: the render queue (services/reader/renderQueue) wired to the things that draw: a pdfium
// session for PDF pages, decodeImage for scans, the page cache for where the files go. The
// surface plans what it wants (renderPlan.planRenders) and calls `want`; each page's view reads
// what has arrived for it with `usePageImages` and re-renders alone when that changes.

export type RenderContext = {
  cache: PageCache;
  // Needed for PDF pages only.
  session?: PdfSession | null;
  // Night: applied natively while drawing.
  colorMatrix?: PdfColorMatrix;
};

// Draws one spec into the cache and returns its file. A file that is already there is the
// answer: keys name their content (page, size, tile, palette, and the folder the file's state).
export async function renderToCache(spec: RenderSpec, context: RenderContext): Promise<string> {
  const out = context.cache.uriFor(spec.key);
  if (context.cache.has(spec.key)) return out;
  const common = { width: spec.width, height: spec.height, colorMatrix: context.colorMatrix, quality: RENDER_QUALITY, out };
  if (spec.source.kind === 'image') {
    await decodeImage(spec.source.uri, { ...common, region: spec.source.region });
    return out;
  }
  if (!context.session) throw new Error('A PDF page was wanted without an open session');
  // The PDF's own annotations and form values are part of the page.
  await context.session.renderPage(spec.source.page, { ...common, matrix: spec.source.matrix, annotations: true });
  return out;
}

export type RenderedImage = { uri: string; spec: RenderSpec };
export type PageImages = {
  low?: RenderedImage;
  base?: RenderedImage;
  // In the order they arrived: draw them in this order, so a newer bucket covers an older one.
  tiles: readonly RenderedImage[];
};

const NO_IMAGES: PageImages = { tiles: [] };
// A screen of tiles at the worst case (zoom 2.5, bucket 3) is about 30; with the previous
// bucket's still underneath, this is where the oldest go.
const MAX_TILES_PER_PAGE = 48;

function sameSource(a: RenderSpec, b: RenderSpec): boolean {
  if (a.source.kind === 'pdf') return b.source.kind === 'pdf' && a.source.page === b.source.page;
  return b.source.kind === 'image' && a.source.uri === b.source.uri && a.turn === b.turn;
}

function pixels(spec: RenderSpec): number {
  return spec.width * spec.height;
}

export type RenderImages = {
  get: (page: number) => PageImages;
  subscribe: (page: number, listener: () => void) => () => void;
  add: (spec: RenderSpec, uri: string) => void;
  // True when rendering `spec` would show nothing new.
  covers: (spec: RenderSpec) => boolean;
  fail: (spec: RenderSpec) => void;
  // Lets go of every page outside `keep` (renderPlan.memoryWindow's `images`).
  trim: (keep: PageRange) => void;
  // A file turned out to be gone (the system cleared the cache): the page renders again.
  forget: (page: number) => void;
  reset: () => void;
};

// What has been rendered, by page. Only names of files: the decoded images belong to the views.
export function createRenderImages(): RenderImages {
  const pages = new Map<number, PageImages>();
  const listeners = new Map<number, Set<() => void>>();
  // Keys that failed: not tried again until the queue is rebuilt, or every settle would retry a
  // page that can't be drawn.
  const failed = new Set<string>();

  const set = (page: number, next: PageImages | undefined) => {
    if (next) pages.set(page, next);
    else if (!pages.delete(page)) return;
    listeners.get(page)?.forEach((listener) => listener());
  };

  return {
    get: (page) => pages.get(page) ?? NO_IMAGES,
    subscribe(page, listener) {
      const group = listeners.get(page) ?? new Set();
      listeners.set(page, group);
      group.add(listener);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(page);
      };
    },
    add(spec, uri) {
      const held = pages.get(spec.page) ?? NO_IMAGES;
      const image = { uri, spec };
      // Images of the page as it was (re-cropped, turned) go when the first new one arrives.
      const stale = (other?: RenderedImage) => !!other && !sameSource(other.spec, spec);
      const base = stale(held.base) ? undefined : held.base;
      const low = stale(held.low) ? undefined : held.low;
      const tiles = held.tiles.filter((tile) => !stale(tile) && tile.spec.key !== spec.key);
      if (spec.kind === 'tile') set(spec.page, { low, base, tiles: [...tiles, image].slice(-MAX_TILES_PER_PAGE) });
      else if (spec.kind === 'base') set(spec.page, { low, base: image, tiles });
      else set(spec.page, { low: image, base, tiles });
    },
    covers(spec) {
      if (failed.has(spec.key)) return true;
      const held = pages.get(spec.page);
      if (!held) return false;
      if (spec.kind === 'tile') return held.tiles.some((tile) => tile.spec.key === spec.key);
      // A base at least as sharp serves for a smaller base (zoomed back out) and for a placeholder.
      const base = held.base;
      if (base && sameSource(base.spec, spec) && pixels(base.spec) >= pixels(spec)) return true;
      return spec.kind === 'low' && !!held.low && held.low.spec.key === spec.key;
    },
    fail: (spec) => {
      failed.add(spec.key);
    },
    trim(keep) {
      for (const page of [...pages.keys()]) {
        if (page < keep.first || page > keep.last) set(page, undefined);
      }
    },
    forget: (page) => set(page, undefined),
    reset() {
      failed.clear();
      for (const page of [...pages.keys()]) set(page, undefined);
    },
  };
}

// One page's images; the component re-renders only when they change.
export function usePageImages(images: RenderImages, page: number): PageImages {
  const subscribe = useCallback((listener: () => void) => images.subscribe(page, listener), [images, page]);
  return useSyncExternalStore(subscribe, () => images.get(page));
}

export type RenderQueueOptions = {
  // The open document's cache folder (pageCache.openPageCache); null until the document is known.
  cache: PageCache | null;
  session?: PdfSession | null;
  // Night pages; null or undefined by day.
  palette?: NightPalette | null;
};

export type RenderQueueHandle = {
  images: RenderImages;
  // Replaces what is wanted (call on every settle, with planRenders' list).
  want: (specs: readonly RenderSpec[]) => void;
  // Pass to planRenders as `night`, so the keys match what this queue draws.
  night: string | undefined;
  // Changes when the queue was rebuilt (another document, session or palette) and holds nothing:
  // plan and `want` again.
  epoch: number;
};

export function useRenderQueue({ cache, session, palette }: RenderQueueOptions): RenderQueueHandle {
  const images = useMemo(createRenderImages, []);
  const queue = useRef<RenderQueue<RenderSpec> | null>(null);
  const [epoch, setEpoch] = useState(0);
  const night = palette ? paletteKey(palette) : undefined;
  const cacheName = cache?.name;

  useEffect(() => {
    if (!cache) return;
    const context: RenderContext = { cache, session, colorMatrix: palette ? nightMatrix(palette) : undefined };
    const built = createRenderQueue<RenderSpec, string>({
      run: (spec) => renderToCache(spec, context),
      onDone: (spec, uri) => images.add(spec, uri),
      // Rendering is best-effort: the page keeps what it shows (its thumbnail, a placeholder).
      onError: (spec) => images.fail(spec),
      // A PDF page before its session is open waits for the rebuild that the session causes.
      skip: (spec) => images.covers(spec) || (spec.source.kind === 'pdf' && !session),
    });
    queue.current = built;
    setEpoch((value) => value + 1);
    return () => {
      built.dispose();
      if (queue.current === built) queue.current = null;
      images.reset();
    };
    // The cache is the same folder as long as its name is; the palette is its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheName, session, night, images]);

  const want = useCallback((specs: readonly RenderSpec[]) => queue.current?.want(specs), []);
  return { images, want, night, epoch };
}
