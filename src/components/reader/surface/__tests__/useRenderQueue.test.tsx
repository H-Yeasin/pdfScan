import { File } from 'expo-file-system';
import { act, create } from 'react-test-renderer';
import PdfNative from '../../../../../modules/pdf-native';
import { acquirePdfSession, type PdfSession } from '../../../../services/pdf/pdfSession';
import { NIGHT_PALETTES, nightMatrix, paletteKey } from '../../../../services/reader/darkMatrix';
import { openPageCache, type PageCache } from '../../../../services/reader/pageCache';
import { RENDER_QUALITY, type RenderSpec } from '../../../../services/reader/renderPlan';
import { createRenderImages, renderToCache, usePageImages, useRenderQueue, type PageImages, type RenderQueueHandle } from '../useRenderQueue';

const native = PdfNative as unknown as { renderPageImage: jest.Mock; decodeImage: jest.Mock };

const frame = { x: 0, y: 0, width: 1, height: 1 };
const pdfSpec = (page: number, width: number, extra: Partial<RenderSpec> = {}): RenderSpec => ({
  key: `p${page}-w${width}`,
  lane: 'pdf',
  priority: 1,
  page,
  kind: 'base',
  width,
  height: Math.round(width * 1.414),
  turn: 0,
  frame,
  source: { kind: 'pdf', page },
  ...extra,
});
const tileSpec = (page: number, col: number, bucket: number): RenderSpec =>
  pdfSpec(page, 512, { key: `p${page}-w1080-t${col}_0_${bucket}`, kind: 'tile', tile: { col, row: 0, bucket }, source: { kind: 'pdf', page, matrix: [9, 0, 0, 9, -col * 512, 0] } });
const scanSpec = (uri: string, width: number, extra: Partial<RenderSpec> = {}): RenderSpec => ({
  key: `i${uri.length}-w${width}`,
  lane: 'image',
  priority: 1,
  page: 0,
  kind: 'base',
  width,
  height: width,
  turn: 0,
  frame,
  source: { kind: 'image', uri },
  ...extra,
});

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('§18 W9 renderToCache', () => {
  let cache: PageCache;
  let session: PdfSession;
  beforeEach(async () => {
    jest.clearAllMocks();
    cache = openPageCache(`doc_${Math.random()}`);
    session = await acquirePdfSession('file:///x.pdf');
  });
  afterEach(() => session.release());

  it('draws a PDF page through the session, into the cache, once', async () => {
    const spec = pdfSpec(3, 1080);
    const uri = await renderToCache(spec, { cache, session });
    expect(uri).toBe(cache.uriFor('p3-w1080'));
    expect(new File(uri).exists).toBe(true);
    expect(native.renderPageImage).toHaveBeenCalledWith(expect.any(String), 3, {
      width: 1080,
      height: 1527,
      matrix: undefined,
      colorMatrix: undefined,
      annotations: true,
      quality: RENDER_QUALITY,
      out: uri,
    });
    // The file is there: no second render.
    expect(await renderToCache(spec, { cache, session })).toBe(uri);
    expect(native.renderPageImage).toHaveBeenCalledTimes(1);
  });

  it('passes a tile’s matrix and the night matrix', async () => {
    const colorMatrix = nightMatrix(NIGHT_PALETTES.medium);
    await renderToCache(tileSpec(0, 2, 4), { cache, session, colorMatrix });
    expect(native.renderPageImage.mock.calls[0][2]).toMatchObject({ matrix: [9, 0, 0, 9, -1024, 0], colorMatrix });
  });

  it('decodes a scan’s image, region and all, without a session', async () => {
    const region = { x: 10, y: 20, width: 300, height: 400 };
    const uri = await renderToCache(scanSpec('file:///library/d/page_1.jpg', 512, { source: { kind: 'image', uri: 'file:///library/d/page_1.jpg', region } }), { cache });
    expect(native.decodeImage).toHaveBeenCalledWith('file:///library/d/page_1.jpg', { width: 512, height: 512, region, colorMatrix: undefined, quality: RENDER_QUALITY, out: uri });
    await expect(renderToCache(pdfSpec(0, 1080), { cache })).rejects.toThrow('session');
  });
});

describe('§18 W9 rendered images', () => {
  it('holds a page’s placeholder, base and tiles, and tells only that page', () => {
    const images = createRenderImages();
    const heard: number[] = [];
    images.subscribe(1, () => heard.push(1));
    const off = images.subscribe(2, () => heard.push(2));
    expect(images.get(1)).toBe(images.get(2));
    images.add(pdfSpec(1, 320, { kind: 'low' }), 'low.jpg');
    images.add(pdfSpec(1, 1080), 'base.jpg');
    images.add(tileSpec(1, 0, 3), 't0.jpg');
    images.add(tileSpec(1, 1, 3), 't1.jpg');
    expect(heard).toEqual([1, 1, 1, 1]);
    expect(images.get(1)).toMatchObject({ low: { uri: 'low.jpg' }, base: { uri: 'base.jpg' } });
    expect(images.get(1).tiles.map((t) => t.uri)).toEqual(['t0.jpg', 't1.jpg']);
    // A snapshot is stable until the page changes.
    expect(images.get(1)).toBe(images.get(1));
    off();
    images.add(pdfSpec(2, 1080), 'other.jpg');
    expect(heard).toEqual([1, 1, 1, 1]);
  });

  it('covers: a sharper base serves a smaller one and the placeholder; tiles by key', () => {
    const images = createRenderImages();
    expect(images.covers(pdfSpec(1, 1080))).toBe(false);
    images.add(pdfSpec(1, 1080), 'base.jpg');
    expect(images.covers(pdfSpec(1, 1080))).toBe(true);
    expect(images.covers(pdfSpec(1, 320, { kind: 'low' }))).toBe(true);
    expect(images.covers(pdfSpec(1, 1697))).toBe(false);
    expect(images.covers(pdfSpec(2, 1080))).toBe(false);
    images.add(pdfSpec(1, 1697), 'sharp.jpg');
    // Zoomed back out: the sharp one stays.
    expect(images.covers(pdfSpec(1, 1080))).toBe(true);
    expect(images.get(1).base?.uri).toBe('sharp.jpg');
    expect(images.covers(tileSpec(1, 0, 3))).toBe(false);
    images.add(tileSpec(1, 0, 3), 't.jpg');
    expect(images.covers(tileSpec(1, 0, 3))).toBe(true);
    expect(images.covers(tileSpec(1, 0, 4))).toBe(false);
  });

  it('a newer bucket’s tiles go on top; the oldest go past the cap', () => {
    const images = createRenderImages();
    images.add(tileSpec(0, 0, 3), 'old.jpg');
    images.add(tileSpec(0, 0, 4), 'new.jpg');
    // The same tile again replaces itself and moves to the top.
    images.add(tileSpec(0, 0, 3), 'old-again.jpg');
    expect(images.get(0).tiles.map((t) => t.uri)).toEqual(['new.jpg', 'old-again.jpg']);
    for (let col = 1; col <= 60; col += 1) images.add(tileSpec(0, col, 4), `t${col}.jpg`);
    const tiles = images.get(0).tiles;
    expect(tiles).toHaveLength(48);
    expect(tiles[tiles.length - 1].uri).toBe('t60.jpg');
    expect(tiles.some((t) => t.uri === 'new.jpg')).toBe(false);
  });

  it('a page whose file changed (re-cropped, turned) lets go of the old images', () => {
    const images = createRenderImages();
    images.add(scanSpec('file:///a.jpg', 320, { kind: 'low' }), 'low.jpg');
    images.add(scanSpec('file:///a.jpg', 1080), 'base.jpg');
    expect(images.covers(scanSpec('file:///a-cropped.jpg', 1080))).toBe(false);
    expect(images.covers(scanSpec('file:///a.jpg', 1080, { turn: 90 }))).toBe(false);
    images.add(scanSpec('file:///a-cropped.jpg', 1080), 'new.jpg');
    expect(images.get(0)).toEqual({ low: undefined, base: expect.objectContaining({ uri: 'new.jpg' }), tiles: [] });
  });

  it('trim, forget, fail and reset', () => {
    const images = createRenderImages();
    const heard: number[] = [];
    [0, 1, 2, 3].forEach((page) => {
      images.add(pdfSpec(page, 1080), `${page}.jpg`);
      images.subscribe(page, () => heard.push(page));
    });
    images.trim({ first: 1, last: 2 });
    expect(heard).toEqual([0, 3]);
    expect(images.get(0).base).toBeUndefined();
    expect(images.get(1).base?.uri).toBe('1.jpg');
    images.forget(1);
    expect(images.covers(pdfSpec(1, 1080))).toBe(false);
    // A failed render isn't asked for again.
    images.fail(pdfSpec(5, 1080));
    expect(images.covers(pdfSpec(5, 1080))).toBe(true);
    images.reset();
    expect(images.covers(pdfSpec(5, 1080))).toBe(false);
    expect(images.get(2).base).toBeUndefined();
  });
});

describe('§18 W9 useRenderQueue', () => {
  let handle!: RenderQueueHandle;
  let shown: PageImages = { tiles: [] };
  let renders = 0;

  function Page({ images }: { images: RenderQueueHandle['images'] }) {
    shown = usePageImages(images, 0);
    renders += 1;
    return null;
  }
  function Host(props: Parameters<typeof useRenderQueue>[0]) {
    handle = useRenderQueue(props);
    return <Page images={handle.images} />;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    renders = 0;
  });

  it('renders what is wanted, hands it to the page, and starts over for another palette', async () => {
    const cache = openPageCache(`doc_${Math.random()}`);
    const session = await acquirePdfSession('file:///x.pdf');
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<Host cache={cache} session={session} />);
    });
    expect(handle.night).toBeUndefined();
    const firstEpoch = handle.epoch;
    expect(firstEpoch).toBeGreaterThan(0);

    await act(async () => {
      handle.want([pdfSpec(0, 1080), pdfSpec(1, 1080), scanSpec('file:///library/d/page_1.jpg', 800)]);
      await settle();
    });
    expect(shown.base?.uri).toBe(cache.uriFor('p0-w1080'));
    expect(native.renderPageImage).toHaveBeenCalledTimes(2);
    expect(native.decodeImage).toHaveBeenCalledTimes(1);
    // Page 1 arriving didn't re-render page 0's view.
    const before = renders;
    await act(async () => {
      handle.want([pdfSpec(0, 1080), pdfSpec(1, 1080), pdfSpec(2, 1080)]);
      await settle();
    });
    // Held already: only page 2 was drawn.
    expect(native.renderPageImage).toHaveBeenCalledTimes(3);
    expect(renders).toBe(before);

    // Night: nothing held, a new epoch, and the matrix goes to native code.
    act(() => root.update(<Host cache={cache} session={session} palette={NIGHT_PALETTES.high} />));
    expect(handle.night).toBe(paletteKey(NIGHT_PALETTES.high));
    expect(handle.epoch).toBeGreaterThan(firstEpoch);
    expect(shown.base).toBeUndefined();
    await act(async () => {
      handle.want([pdfSpec(0, 1080, { key: `p0-w1080-n${handle.night}` })]);
      await settle();
    });
    expect(native.renderPageImage.mock.calls[3][2].colorMatrix).toEqual(nightMatrix(NIGHT_PALETTES.high));
    expect(shown.base?.uri).toBe(cache.uriFor(`p0-w1080-n${handle.night}`));

    act(() => root.unmount());
    session.release();
  });

  it('a PDF page waits for the session; a failed render is not retried', async () => {
    const cache = openPageCache(`doc_${Math.random()}`);
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<Host cache={cache} session={null} />);
    });
    await act(async () => {
      handle.want([pdfSpec(0, 1080)]);
      await settle();
    });
    expect(native.renderPageImage).not.toHaveBeenCalled();

    const session = await acquirePdfSession('file:///x.pdf');
    const epoch = handle.epoch;
    act(() => root.update(<Host cache={cache} session={session} />));
    expect(handle.epoch).toBeGreaterThan(epoch);
    native.renderPageImage.mockRejectedValueOnce(new Error('broken page'));
    await act(async () => {
      handle.want([pdfSpec(0, 1080)]);
      await settle();
    });
    await act(async () => {
      handle.want([pdfSpec(0, 1080)]);
      await settle();
    });
    expect(native.renderPageImage).toHaveBeenCalledTimes(1);
    expect(shown.base).toBeUndefined();

    act(() => root.unmount());
    session.release();
  });
});
