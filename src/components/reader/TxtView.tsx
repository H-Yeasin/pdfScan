import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { spacing, tokens as themes, useTheme } from '../../theme';
import { readTextPrefix, TXT_MAX_BYTES } from '../../services/documents/txtService';
import {
  averageHeight,
  buildTxtIndex,
  chunkAt,
  chunkHasMatch,
  chunkOf,
  chunkSegments,
  findAll,
  firstMatchAfter,
  fractionInChunk,
  NO_TXT_MATCHES,
  type TxtIndex,
  type TxtSegment,
} from '../../services/documents/txtIndex';
import { formatBytes } from '../../utils/format';
import { useT } from '../../i18n/useT';
import type { ViewerProps } from './viewers/types';
import { useDebounced, useScrollDirection } from './viewers/useScrollDirection';

// A jump to a chunk that was never laid out lands by the average height so far; the chunk is then
// drawn and measured, and the next try puts it right (§18 W4). A few tries are enough.
const SCROLL_RETRIES = 5;
const SCROLL_RETRY_MS = 80;
// Where a found match is put: this share of the way down the band between the bars.
const FIND_BAND_SHARE = 0.3;
// A chunk's height before any is measured: about 60 lines.
const CHUNK_HEIGHT_GUESS = 1200;
// Find waits for a pause in the typing; the search itself is one pass over the lower-cased text.
const FIND_DEBOUNCE_MS = 120;
const LINE_HEIGHT = 21;

type Loaded = { index: TxtIndex; fallbackUsed: boolean; truncated: boolean };
// Where a jump is going: a chunk, how far down it, and where in the band that point goes.
type Aim = { chunk: number; fraction: number; share: number };

// §7 R5's text preview. §18 W19/W20: it reads under the Reader's bars (viewers/types), Find
// highlights every match and steps through them, and it opens where it was left.
export function TxtView({ uri, night, insets, onTap, find, onFindResult, initialPosition, onPosition, onScrollDirection }: ViewerProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    let cancelled = false;
    readTextPrefix(uri)
      .then(({ text, fallbackUsed, truncated }) => {
        if (!cancelled) setLoaded({ index: buildTxtIndex(text), fallbackUsed, truncated });
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('TxtView: failed to read', uri, e);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const index = loaded?.index ?? null;

  // What the list has measured: each chunk's height, the banners above them, its own height.
  const heights = useRef<(number | undefined)[]>([]);
  const headerHeight = useRef(0);
  const viewport = useRef(0);
  const scrollY = useRef(0);
  const insetsNow = useRef(insets);
  insetsNow.current = insets;

  // The text offset at the top of the band: where Find starts from.
  const readingOffset = useCallback(() => {
    if (!index) return 0;
    const at = chunkAt(heights.current, index.chunks.length, scrollY.current - headerHeight.current, CHUNK_HEIGHT_GUESS);
    return index.offsets[at.chunk] + Math.floor(at.fy * index.chunks[at.chunk].length);
  }, [index]);

  // --- jumps ---
  const aim = useRef<Aim | null>(null);
  const retriesLeft = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);
  useEffect(() => stopRetry, [stopRetry]);

  const tryJump = useCallback(() => {
    const to = aim.current;
    if (!to) return;
    const known = heights.current[to.chunk];
    const height = known ?? averageHeight(heights.current, CHUNK_HEIGHT_GUESS);
    const band = Math.max(0, viewport.current - insetsNow.current.top - insetsNow.current.bottom);
    listRef.current?.scrollToIndex({
      index: to.chunk,
      animated: false,
      viewPosition: 0,
      viewOffset: insetsNow.current.top + band * to.share - to.fraction * height,
    });
    // Its height was a guess: look again once it has been drawn.
    if (known !== undefined || retriesLeft.current <= 0) return;
    retriesLeft.current -= 1;
    stopRetry();
    retryTimer.current = setTimeout(tryJump, SCROLL_RETRY_MS);
  }, [stopRetry]);

  const jumpTo = useCallback(
    (to: Aim) => {
      stopRetry();
      aim.current = to;
      retriesLeft.current = SCROLL_RETRIES;
      tryJump();
    },
    [stopRetry, tryJump]
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // Before anything is measured the list's own average is 0.
      const average = info.averageItemLength || averageHeight(heights.current, CHUNK_HEIGHT_GUESS);
      listRef.current?.scrollToOffset({ offset: average * info.index, animated: false });
      if (retriesLeft.current <= 0) return;
      retriesLeft.current -= 1;
      stopRetry();
      retryTimer.current = setTimeout(tryJump, SCROLL_RETRY_MS);
    },
    [stopRetry, tryJump]
  );

  // --- the position ---
  // Read once: the list goes there when it first has a height. Until then nothing is reported,
  // so the top of the file is never saved over the place being restored.
  const opening = useRef(initialPosition?.kind === 'txt' ? initialPosition : undefined);
  const placed = useRef(false);
  const place = useCallback(() => {
    if (placed.current || !index || viewport.current <= 0) return;
    placed.current = true;
    const at = opening.current;
    if (at && (at.chunk > 0 || at.fy > 0)) jumpTo({ chunk: Math.min(at.chunk, index.chunks.length - 1), fraction: at.fy, share: 0 });
  }, [index, jumpTo]);
  useEffect(place, [place]);

  const said = useScrollDirection(onScrollDirection);
  const report = useRef(onPosition);
  report.current = onPosition;
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      scrollY.current = contentOffset.y;
      said(contentOffset.y, contentSize.height - layoutMeasurement.height);
      if (!index || !placed.current || retryTimer.current) return;
      const at = chunkAt(heights.current, index.chunks.length, contentOffset.y - headerHeight.current, CHUNK_HEIGHT_GUESS);
      report.current({ kind: 'txt', chunk: at.chunk, fy: at.fy });
    },
    [index, said]
  );

  // --- Find ---
  const query = useDebounced(find.query, FIND_DEBOUNCE_MS, (q) => !q.trim());
  const found = useMemo(() => (index ? findAll(index, query) : NO_TXT_MATCHES), [index, query]);
  const matches = found.matches;
  // The match this viewer chose for a new query: the first from where reading is.
  const [picked, setPicked] = useState(-1);
  useEffect(() => {
    if (matches.length === 0) {
      setPicked(-1);
      return;
    }
    const first = firstMatchAfter(matches, readingOffset());
    setPicked(first < matches.length ? first : 0);
    // A new set of matches is a new search; reading moving on doesn't choose again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);
  const current = matches.length === 0 ? -1 : find.index >= 0 ? Math.min(find.index, matches.length - 1) : Math.min(picked, matches.length - 1);

  useEffect(() => {
    onFindResult({ count: matches.length, index: current, partial: found.partial });
  }, [matches.length, current, found.partial, onFindResult]);

  useEffect(() => {
    const match = current >= 0 ? matches[current] : undefined;
    if (!index || !match) return;
    const chunk = chunkOf(index, match.start);
    jumpTo({ chunk, fraction: fractionInChunk(index, chunk, match.start), share: FIND_BAND_SHARE });
  }, [index, matches, current, jumpTo]);

  // Night mode reads like the dark theme, whatever the app theme is.
  const colors = night ? themes.dark : tokens;
  const palette = useMemo<ChunkPalette>(
    () => ({ ink: colors.ink, match: colors.accentSoft, current: colors.accent, onCurrent: colors.onAccent }),
    [colors]
  );

  const onChunkHeight = useCallback((chunk: number, height: number) => {
    heights.current[chunk] = height;
  }, []);

  const renderItem = useCallback(
    ({ item, index: chunk }: { item: string; index: number }) => (
      <TxtChunk
        chunk={chunk}
        text={item}
        segments={index && chunkHasMatch(index, chunk, matches) ? chunkSegments(index, chunk, matches, current) : null}
        palette={palette}
        onHeight={onChunkHeight}
        onTap={onTap}
      />
    ),
    [index, matches, current, palette, onChunkHeight, onTap]
  );

  const onListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewport.current = e.nativeEvent.layout.height;
      place();
    },
    [place]
  );

  if (error) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.openFailed')}</Text>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.loading')}</Text>
      </View>
    );
  }

  // The notes scroll with the text (they sat under the top bar, hidden, when they were fixed).
  const banners =
    loaded.fallbackUsed || loaded.truncated ? (
      <View
        onLayout={(e) => {
          headerHeight.current = e.nativeEvent.layout.height;
        }}
      >
        {loaded.fallbackUsed && (
          <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.bannerText, { color: colors.accentInk }]}>{t('reader.notUtf8')}</Text>
          </View>
        )}
        {loaded.truncated && (
          <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.bannerText, { color: colors.accentInk }]}>{t('reader.firstBytes', { size: formatBytes(TXT_MAX_BYTES) })}</Text>
          </View>
        )}
      </View>
    ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        ref={listRef}
        data={loaded.index.chunks}
        keyExtractor={chunkKey}
        renderItem={renderItem}
        ListHeaderComponent={banners}
        onLayout={onListLayout}
        onScroll={onScroll}
        scrollEventThrottle={64}
        // A finger on the list ends a jump that was still looking for its place.
        onScrollBeginDrag={stopRetry}
        onScrollToIndexFailed={onScrollToIndexFailed}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + spacing.lg,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      />
    </View>
  );
}

function chunkKey(_: string, index: number): string {
  return String(index);
}

type ChunkPalette = { ink: string; match: string; current: string; onCurrent: string };

type TxtChunkProps = {
  chunk: number;
  text: string;
  // null: no match in this chunk, so it is one plain Text.
  segments: TxtSegment[] | null;
  palette: ChunkPalette;
  onHeight: (chunk: number, height: number) => void;
  onTap: () => void;
};

const TxtChunk = memo(function TxtChunk({ chunk, text, segments, palette, onHeight, onTap }: TxtChunkProps) {
  return (
    <Pressable accessible={false} onPress={onTap} onLayout={(e) => onHeight(chunk, e.nativeEvent.layout.height)} style={styles.chunk}>
      <Text style={[styles.text, { color: palette.ink }]}>
        {segments
          ? segments.map((segment, i) =>
              segment.hit === 'none' ? (
                segment.text
              ) : (
                <Text
                  key={i}
                  style={segment.hit === 'current' ? { backgroundColor: palette.current, color: palette.onCurrent } : { backgroundColor: palette.match }}
                >
                  {segment.text}
                </Text>
              )
            )
          : text}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chunk: { paddingHorizontal: spacing.lg },
  text: { fontSize: 14.5, lineHeight: LINE_HEIGHT, fontFamily: 'monospace' },
  banner: { padding: spacing.sm },
  bannerText: { fontSize: 12.5, textAlign: 'center' },
});
