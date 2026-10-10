import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, tokens as themes, useTheme, type ThemeTokens } from '../../theme';
import { cachedSheetPreview, PreviewTooLargeError, type SheetFormat, type SheetPreview } from '../../services/documents/sheetService';
import {
  CELL_FONT_SIZE,
  CELL_PADDING_H,
  cellAddress,
  cellMatches,
  columnAt,
  columnLetter,
  columnOffsets,
  columnWindow,
  computeColumnWidths,
  firstCellFrom,
  focalColumnScroll,
  focalScroll,
  gutterWidth,
  matchedColumns,
  MAX_COLUMNS,
  NO_CELL_MATCHES,
  rowHeight,
  sameWindow,
  scrollIntoView,
  SHEET_ZOOM_MAX,
  SHEET_ZOOM_MIN,
  sheetLineHeight,
  sheetPaddingV,
  sheetZoom,
  type ColumnWindow,
} from '../../services/documents/sheetWindow';
import { useAppDispatch } from '../../store/AppStateContext';
import { formatNumber } from '../../i18n';
import { useT } from '../../i18n/useT';
import { CellDetailSheet } from './CellDetailSheet';
import type { ViewerProps } from './viewers/types';
import { useDebounced, useScrollDirection } from './viewers/useScrollDirection';

// Find waits for a pause in the typing: a search reads every cell of the sheet.
const FIND_DEBOUNCE_MS = 150;
// Where a found cell's row is put when it was out of view: this share of the way down the rows.
const FIND_BAND_SHARE = 0.3;
const NO_COLUMNS: ColumnWindow = { first: 0, last: -1 };

type SheetViewProps = ViewerProps & {
  format: SheetFormat;
  // useReaderChrome's progress (1: the bars are shown). The frozen rows sit under the top bar and
  // move up with it; without it they stay where the bar's inset puts them.
  chrome?: SharedValue<number>;
};

// §7 R5's sheet preview; §12 D11: pinch to zoom, frozen first row. §18 W21: column letters and
// row numbers that stay in view, only the columns near the screen drawn (a 150-column sheet used
// to draw every cell of every row), a pinch shown as a transform and laid out once at its end
// around the fingers, a tap on a cell for its whole text, Find over cells on both axes, the
// position remembered; and one sheet read at a time, at most 5,000 rows of it (sheetService).
//
// The parts: a vertical list of rows inside a horizontal scroll view (the body), and over it a
// header block (tabs, notes, the letters, the frozen first row) that takes no part in either
// scroll: it follows the horizontal one on the native driver, as the row numbers in each row do.
export function SheetView({ uri, format, night, insets, onTap, find, onFindResult, initialPosition, onPosition, onScrollDirection, chrome }: SheetViewProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const safe = useSafeAreaInsets();
  const opening = useRef(initialPosition?.kind === 'sheet' ? initialPosition : undefined);
  const [names, setNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(opening.current?.sheet ?? 0);
  const [sheet, setSheet] = useState<SheetPreview | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setSheet(null);
    setError(null);
    cachedSheetPreview(uri, format, activeSheet)
      .then((loaded) => {
        if (cancelled) return;
        setNames(loaded.names);
        setSheet(loaded);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('SheetView: failed to load', uri, e);
        setError(e instanceof PreviewTooLargeError ? 'tooLarge' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [uri, format, activeSheet]);

  const rows = sheet?.rows ?? NO_ROWS;
  // A single row has nothing to stay above.
  const freeze = rows.length > 1;
  const lead = freeze ? 1 : 0;
  const body = useMemo(() => (freeze ? rows.slice(1) : rows), [rows, freeze]);
  const { widths: baseWidths, totalColumns } = useMemo(() => computeColumnWidths(rows), [rows]);
  const widths = useMemo(() => baseWidths.map((w) => Math.round(w * zoom)), [baseWidths, zoom]);
  const offsets = useMemo(() => columnOffsets(widths), [widths]);
  const gridWidth = offsets[offsets.length - 1] ?? 0;
  const gutter = gutterWidth(rows.length, zoom);
  const rowH = rowHeight(zoom);

  // --- what the view has measured, and where it is scrolled to ---
  const [size, setSize] = useState({ width: 0, height: 0 });
  const windowX = useRef(0);
  const containerRef = useRef<View>(null);
  // The header block's height with the bars shown: what the first row starts under. A guess until
  // it is laid out (the bar's inset, the letters, the frozen row).
  const [headerHeight, setHeaderHeight] = useState(0);
  const padTop = headerHeight || insets.top + rowH * (1 + lead);
  const scroll = useRef({ x: 0, y: 0 });
  const scrollX = useRef(new Animated.Value(0)).current;
  const headerX = useMemo(() => Animated.multiply(scrollX, -1), [scrollX]);
  const listRef = useRef<FlatList<string[]>>(null);
  const sideRef = useRef<ScrollView>(null);
  const [columns, setColumns] = useState<ColumnWindow>(NO_COLUMNS);

  // Everything the callbacks below read, as it is now (they are made once).
  const now = useRef({ offsets, gutter, rowH, padTop, size, lead, bodyCount: body.length, insets, rows, zoom, baseWidths });
  now.current = { offsets, gutter, rowH, padTop, size, lead, bodyCount: body.length, insets, rows, zoom, baseWidths };

  const windowFor = useCallback((x: number) => {
    const g = now.current;
    return columnWindow(g.offsets, x, Math.max(0, g.size.width - g.gutter));
  }, []);
  // The window follows the layout (another sheet, a zoom, a turn of the phone).
  useLayoutEffect(() => {
    setColumns((prev) => {
      const next = windowFor(scroll.current.x);
      return sameWindow(prev, next) ? prev : next;
    });
  }, [offsets, gutter, size.width, windowFor]);

  const report = useRef(onPosition);
  report.current = onPosition;
  const placed = useRef(false);
  const sheetNow = useRef(activeSheet);
  sheetNow.current = activeSheet;
  const reportPosition = useCallback(() => {
    if (!placed.current) return;
    const g = now.current;
    const row = Math.min(Math.max(0, Math.floor(scroll.current.y / g.rowH)), Math.max(0, g.bodyCount - 1)) + g.lead;
    report.current({ kind: 'sheet', sheet: sheetNow.current, row, col: columnAt(g.offsets, scroll.current.x) });
  }, []);

  const onScrollX = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          scroll.current.x = e.nativeEvent.contentOffset.x;
          const next = windowFor(scroll.current.x);
          setColumns((prev) => (sameWindow(prev, next) ? prev : next));
          reportPosition();
        },
      }),
    [scrollX, windowFor, reportPosition]
  );

  const said = useScrollDirection(onScrollDirection);
  const onScrollY = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      scroll.current.y = contentOffset.y;
      said(contentOffset.y, contentSize.height - layoutMeasurement.height);
      reportPosition();
    },
    [said, reportPosition]
  );

  const scrollTo = useCallback((x: number, y: number, animated: boolean) => {
    if (x !== scroll.current.x) sideRef.current?.scrollTo({ x, animated });
    if (y !== scroll.current.y) listRef.current?.scrollToOffset({ offset: y, animated });
  }, []);

  // A sheet is on screen: go to the saved cell (the first sheet shown only), else its top-left.
  useEffect(() => {
    if (!sheet || size.height <= 0) return;
    const g = now.current;
    const at = opening.current;
    opening.current = undefined;
    scroll.current = { x: 0, y: 0 };
    scrollX.setValue(0);
    if (at && at.sheet === sheet.index) {
      const x = g.offsets[Math.min(at.col, Math.max(0, g.offsets.length - 2))] ?? 0;
      const y = Math.max(0, Math.min(at.row - g.lead, g.bodyCount - 1)) * g.rowH;
      // After the list has its rows: a scroll asked for before that is dropped.
      requestAnimationFrame(() => {
        scrollTo(x, y, false);
        placed.current = true;
      });
    } else {
      sideRef.current?.scrollTo({ x: 0, animated: false });
      placed.current = true;
      // Another tab is a new position even before anything scrolls.
      reportPosition();
    }
    // Once per sheet loaded and laid out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, size.height > 0]);

  // --- Find ---
  const query = useDebounced(find.query, FIND_DEBOUNCE_MS, (q) => !q.trim());
  const found = useMemo(() => (rows.length ? cellMatches(rows, query, widths.length) : NO_CELL_MATCHES), [rows, query, widths.length]);
  const cells = found.cells;
  // The match this viewer chose for a new query: the first from the row at the top.
  const [picked, setPicked] = useState(-1);
  useEffect(() => {
    if (cells.length === 0) {
      setPicked(-1);
      return;
    }
    const g = now.current;
    const first = firstCellFrom(cells, { row: Math.floor(scroll.current.y / g.rowH) + g.lead, col: 0 });
    setPicked(first < cells.length ? first : 0);
  }, [cells]);
  const current = cells.length === 0 ? -1 : find.index >= 0 ? Math.min(find.index, cells.length - 1) : Math.min(picked, cells.length - 1);
  const currentCell = current >= 0 ? cells[current] : undefined;

  useEffect(() => {
    onFindResult({ count: cells.length, index: current, partial: found.partial });
  }, [cells.length, current, found.partial, onFindResult]);

  // The match Find is on, into view: sideways as well as down, and no further than it needs.
  useEffect(() => {
    if (!currentCell) return;
    const g = now.current;
    const x = scrollIntoView(scroll.current.x, Math.max(0, g.size.width - g.gutter), g.offsets[currentCell.col] ?? 0, (g.offsets[currentCell.col + 1] ?? 0) - (g.offsets[currentCell.col] ?? 0));
    let y = scroll.current.y;
    // The frozen row is always in view.
    if (currentCell.row >= g.lead) {
      const band = Math.max(g.rowH, g.size.height - g.padTop - g.insets.bottom);
      const top = (currentCell.row - g.lead) * g.rowH;
      if (scrollIntoView(y, band, top, g.rowH) !== y) y = Math.max(0, top - band * FIND_BAND_SHARE);
    }
    scrollTo(x, y, true);
  }, [currentCell, scrollTo]);

  // --- pinch: a transform while the fingers are down, one new layout when they lift ---
  const preview = useRef(new Animated.Value(1)).current;
  const previewX = useRef(new Animated.Value(0)).current;
  const previewY = useRef(new Animated.Value(0)).current;
  const pinchState = useRef({ fx: 0, fy: 0, scale: 1 });
  // The scroll to put in place once the grid has been laid out at the new zoom.
  const afterZoom = useRef<{ x: number; y: number } | null>(null);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart((e) => {
          pinchState.current = { fx: e.focalX, fy: e.focalY, scale: 1 };
        })
        .onUpdate((e) => {
          const g = now.current;
          const p = pinchState.current;
          p.scale = Math.min(SHEET_ZOOM_MAX / g.zoom, Math.max(SHEET_ZOOM_MIN / g.zoom, e.scale));
          // The view scales about its centre; this keeps the point under the fingers still.
          previewX.setValue((p.fx - g.size.width / 2) * (1 - p.scale));
          previewY.setValue((p.fy - g.size.height / 2) * (1 - p.scale));
          preview.setValue(p.scale);
        })
        .onEnd(() => {
          const g = now.current;
          const p = pinchState.current;
          const next = sheetZoom(g.zoom, p.scale);
          if (next === g.zoom) {
            preview.setValue(1);
            previewX.setValue(0);
            previewY.setValue(0);
            return;
          }
          const nextOffsets = columnOffsets(g.baseWidths.map((w) => Math.round(w * next)));
          const nextRowH = rowHeight(next);
          const nextGutter = gutterWidth(g.rows.length, next);
          // The header's rows grow with the zoom; the rest of it (the bar's inset, tabs) doesn't.
          const nextPadTop = g.padTop + (1 + g.lead) * (nextRowH - g.rowH);
          afterZoom.current = {
            x: focalColumnScroll(g.offsets, nextOffsets, scroll.current.x, p.fx, g.gutter, nextGutter),
            y: focalScroll(scroll.current.y, p.fy, nextRowH / g.rowH, g.padTop, nextPadTop),
          };
          setZoom(next);
        }),
    [preview, previewX, previewY]
  );
  useLayoutEffect(() => {
    const to = afterZoom.current;
    if (!to) return;
    afterZoom.current = null;
    // A frame later, when the rows have their new height: then the transform goes and the scroll
    // takes its place.
    requestAnimationFrame(() => {
      sideRef.current?.scrollTo({ x: to.x, animated: false });
      listRef.current?.scrollToOffset({ offset: to.y, animated: false });
      preview.setValue(1);
      previewX.setValue(0);
      previewY.setValue(0);
    });
  }, [zoom, preview, previewX, previewY]);

  // --- taps ---
  const [detail, setDetail] = useState<{ address: string; text: string } | null>(null);
  // One handler for every row: the column comes from where on the screen the tap was.
  const onRowPress = useCallback(
    (row: number, e: GestureResponderEvent) => {
      const g = now.current;
      const inView = e.nativeEvent.pageX - windowX.current;
      // The row numbers, or beyond the last column: a tap with nothing to open.
      const x = inView - g.gutter + scroll.current.x;
      const col = inView < g.gutter || x >= (g.offsets[g.offsets.length - 1] ?? 0) ? -1 : columnAt(g.offsets, x);
      const text = col >= 0 ? String(g.rows[row]?.[col] ?? '') : '';
      if (text) setDetail({ address: cellAddress(row, col), text });
      else onTap();
    },
    [onTap]
  );
  const copyCell = useCallback(
    (text: string) => {
      Clipboard.setStringAsync(text)
        .then(() => dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.cell.copied') }))
        .catch(() => undefined);
      setDetail(null);
    },
    [dispatch, t]
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    containerRef.current?.measureInWindow((x) => {
      windowX.current = x;
    });
  }, []);

  // The header block rides up with the top bar: by the bar's own height, which is the inset less
  // the status bar.
  const local = useSharedValue(1);
  const progress = chrome ?? local;
  const rise = Math.max(0, insets.top - safe.top);
  const headerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (progress.value - 1) * rise }] }), [rise]);

  // Night mode reads like the dark theme, whatever the app theme is.
  const colors = night ? themes.dark : tokens;
  const metrics = useMemo<RowMetrics>(
    () => ({ zoom, rowH, gutter, gridWidth, widths, offsets }),
    [zoom, rowH, gutter, gridWidth, widths, offsets]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<string[]> | null | undefined, index: number) => ({ length: rowH, offset: rowH * index, index }),
    [rowH]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: string[]; index: number }) => {
      const row = index + lead;
      return (
        <SheetRow
          row={row}
          cells={item}
          label={String(row + 1)}
          columns={columns}
          metrics={metrics}
          colors={colors}
          // As a string, so a row whose matches didn't change isn't drawn again.
          matched={cells.length ? matchedColumns(cells, row).join(',') : ''}
          current={currentCell?.row === row ? currentCell.col : -1}
          scrollX={scrollX}
          onPress={onRowPress}
        />
      );
    },
    [lead, columns, metrics, colors, cells, currentCell, scrollX, onRowPress]
  );

  const letters = useLetters(columns);

  if (error) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t(error === 'tooLarge' ? 'reader.tooLargeToPreview' : 'reader.openFailed')}</Text>
      </View>
    );
  }

  return (
    // Sideways (landscape) the grid keeps clear of the cut-out and the side bar.
    <View style={[styles.container, { backgroundColor: colors.bg, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <View ref={containerRef} style={styles.container} onLayout={onLayout}>
      {sheet ? (
        <GestureDetector gesture={pinch}>
          <Animated.View style={[styles.container, { transform: [{ translateX: previewX }, { translateY: previewY }, { scale: preview }] }]} collapsable={false}>
            <Animated.ScrollView ref={sideRef} horizontal onScroll={onScrollX} scrollEventThrottle={16} showsHorizontalScrollIndicator={false}>
              <FlatList
                // Another sheet starts at its own top.
                key={sheet.index}
                ref={listRef}
                style={{ width: Math.max(gutter + gridWidth, size.width) }}
                data={body}
                keyExtractor={rowKey}
                renderItem={renderItem}
                getItemLayout={getItemLayout}
                onScroll={onScrollY}
                scrollEventThrottle={64}
                initialNumToRender={30}
                maxToRenderPerBatch={20}
                windowSize={7}
                contentContainerStyle={{ paddingTop: padTop, paddingBottom: insets.bottom }}
              />
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
      ) : (
        <View style={styles.empty}>
          <Text style={{ color: colors.muted }}>{t('reader.loading')}</Text>
        </View>
      )}

      <Reanimated.View
        style={[styles.header, { backgroundColor: colors.bg }, headerStyle]}
        onLayout={(e) => setHeaderHeight(Math.round(e.nativeEvent.layout.height))}
      >
        {/* Under the top bar while it shows; over the status bar once the block has ridden up. */}
        <Pressable accessible={false} onPress={onTap} style={{ height: insets.top }} />
        {names.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
            {names.map((name, i) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: i === activeSheet }}
                key={`${i}:${name}`}
                onPress={() => setActiveSheet(i)}
                style={[styles.tab, i === activeSheet && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              >
                <Text style={{ color: i === activeSheet ? colors.accentInk : colors.muted, fontWeight: '600' }}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {sheet?.truncated ? (
          <Text style={[styles.truncNote, { color: colors.muted }]}>
            {sheet.totalRows
              ? t('reader.firstRowsOf', { count: formatNumber(rows.length), total: formatNumber(sheet.totalRows) })
              : t('reader.firstRows', { count: formatNumber(rows.length) })}
          </Text>
        ) : null}
        {totalColumns > MAX_COLUMNS && (
          <Text style={[styles.truncNote, { color: colors.muted }]}>{t('reader.firstColumns', { count: MAX_COLUMNS })}</Text>
        )}
        {sheet && widths.length > 0 ? (
          <>
            <FrozenRow label="" cells={letters} byColumn={false} columns={columns} metrics={metrics} colors={colors} headerX={headerX} strong onPress={onTap} />
            {freeze ? (
              <FrozenRow
                label="1"
                cells={rows[0]}
                byColumn
                columns={columns}
                metrics={metrics}
                colors={colors}
                headerX={headerX}
                strong
                matched={cells.length ? matchedColumns(cells, 0).join(',') : ''}
                current={currentCell?.row === 0 ? currentCell.col : -1}
                onPress={(e) => onRowPress(0, e)}
              />
            ) : null}
          </>
        ) : null}
      </Reanimated.View>

      <CellDetailSheet cell={detail} onCopy={copyCell} onClose={() => setDetail(null)} />
    </View>
    </View>
  );
}

const NO_ROWS: string[][] = [];

function rowKey(_: string[], index: number): string {
  return String(index);
}

// The letters of the columns in the window, as the cells of the header's first row.
function useLetters(columns: ColumnWindow): string[] {
  return useMemo(() => {
    const out: string[] = [];
    for (let c = columns.first; c <= columns.last; c += 1) out.push(columnLetter(c));
    return out;
  }, [columns]);
}

type RowMetrics = { zoom: number; rowH: number; gutter: number; gridWidth: number; widths: number[]; offsets: number[] };

function cellSize(metrics: RowMetrics, colors: ThemeTokens) {
  return {
    fontSize: CELL_FONT_SIZE * metrics.zoom,
    lineHeight: sheetLineHeight(metrics.zoom),
    paddingHorizontal: CELL_PADDING_H * metrics.zoom,
    paddingVertical: sheetPaddingV(metrics.zoom),
    borderColor: colors.edge,
  };
}

type CellsProps = {
  // The row's cells: by column (`byColumn`), or just the ones of the window, in order.
  cells: readonly string[];
  byColumn: boolean;
  columns: ColumnWindow;
  metrics: RowMetrics;
  colors: ThemeTokens;
  matched?: string;
  current?: number;
  strong?: boolean;
};

// The cells of the column window, after a spacer as wide as the columns left out before it.
function WindowCells({ cells, byColumn, columns, metrics, colors, matched = '', current = -1, strong }: CellsProps) {
  const size = cellSize(metrics, colors);
  const hits = matched ? matched.split(',').map(Number) : NO_HITS;
  const out = [<View key="lead" style={{ width: metrics.offsets[columns.first] ?? 0 }} />];
  for (let c = columns.first; c <= columns.last; c += 1) {
    const isCurrent = c === current;
    const tint = isCurrent ? colors.accent : hits.includes(c) ? colors.accentSoft : undefined;
    out.push(
      <Text
        key={c}
        numberOfLines={1}
        style={[styles.cell, size, { width: metrics.widths[c], color: isCurrent ? colors.onAccent : colors.ink, backgroundColor: tint }, strong && styles.strong]}
      >
        {String((byColumn ? cells[c] : cells[c - columns.first]) ?? '')}
      </Text>
    );
  }
  return <>{out}</>;
}

const NO_HITS: number[] = [];

type SheetRowProps = {
  row: number;
  cells: string[];
  label: string;
  columns: ColumnWindow;
  metrics: RowMetrics;
  colors: ThemeTokens;
  matched: string;
  current: number;
  scrollX: Animated.Value;
  onPress: (row: number, e: GestureResponderEvent) => void;
};

// A row of the list: its number, then the window's cells. The number is moved right by exactly
// the horizontal scroll (on the native driver), so it stays at the left edge, over the cells
// sliding under it.
const SheetRow = memo(function SheetRow({ row, cells, label, columns, metrics, colors, matched, current, scrollX, onPress }: SheetRowProps) {
  return (
    <Pressable accessible={false} style={[styles.row, { height: metrics.rowH, width: metrics.gutter + metrics.gridWidth }]} onPress={(e) => onPress(row, e)}>
      <Animated.Text
        numberOfLines={1}
        style={[styles.cell, styles.gutter, cellSize(metrics, colors), { width: metrics.gutter, color: colors.muted, backgroundColor: colors.surface2, transform: [{ translateX: scrollX }] }]}
      >
        {label}
      </Animated.Text>
      <WindowCells cells={cells} byColumn columns={columns} metrics={metrics} colors={colors} matched={matched} current={current} />
    </Pressable>
  );
});

type FrozenRowProps = CellsProps & {
  label: string;
  headerX: Animated.AnimatedInterpolation<number>;
  onPress: (e: GestureResponderEvent) => void;
};

// A row of the header block: its corner stays, its cells follow the body's horizontal scroll.
function FrozenRow({ label, headerX, onPress, ...cellsProps }: FrozenRowProps) {
  const { metrics, colors } = cellsProps;
  return (
    <Pressable accessible={false} style={[styles.row, styles.frozen, { height: metrics.rowH, backgroundColor: colors.surface2 }]} onPress={onPress}>
      <Text numberOfLines={1} style={[styles.cell, styles.gutter, cellSize(metrics, colors), { width: metrics.gutter, color: colors.muted, backgroundColor: colors.surface2 }]}>
        {label}
      </Text>
      <View style={styles.frozenCells}>
        <Animated.View style={[styles.row, { width: metrics.gridWidth, transform: [{ translateX: headerX }] }]}>
          <WindowCells {...cellsProps} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  tabStrip: { flexGrow: 0, flexDirection: 'row' },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  truncNote: { fontSize: 11.5, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  row: { flexDirection: 'row' },
  frozen: { overflow: 'hidden' },
  frozenCells: { flex: 1, overflow: 'hidden' },
  cell: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gutter: { zIndex: 1, textAlign: 'center' },
  strong: { fontWeight: '700' },
});
