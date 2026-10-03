import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { spacing, tokens as themes, useTheme, type ThemeTokens } from '../../theme';
import { loadSheets, PreviewTooLargeError, type Sheet } from '../../services/documents/sheetService';
import { useT } from '../../i18n/useT';

export const MAX_COLUMNS = 200;
const SAMPLE_ROWS_FOR_WIDTH = 50;
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 240;
const CHAR_WIDTH = 8;
const CELL_FONT_SIZE = 13;
const CELL_PADDING_H = 6;
const CELL_PADDING_V = 6;

// §12 D11: pinch zoom scales the grid itself (font, padding, column widths), not a picture of it,
// so text stays sharp and rows stay virtualized. Steps of 0.1 keep a pinch to a handful of renders.
export const SHEET_ZOOM_MIN = 0.6;
export const SHEET_ZOOM_MAX = 2.5;
export function sheetZoom(base: number, pinchScale: number): number {
  const z = Math.round(base * pinchScale * 10) / 10;
  return Math.min(SHEET_ZOOM_MAX, Math.max(SHEET_ZOOM_MIN, z));
}

// Computed once per sheet load and kept static rather than live-measured per cell - real
// auto-fit text measurement would defeat FlatList's row virtualization. Also §12 D7's CSV editor.
export function computeColumnWidths(rows: string[][]): { widths: number[]; totalColumns: number } {
  const sample = rows.slice(0, SAMPLE_ROWS_FOR_WIDTH);
  const totalColumns = sample.reduce((max, row) => Math.max(max, row.length), 0);
  const colCount = Math.min(totalColumns, MAX_COLUMNS);
  const widths = new Array(colCount).fill(MIN_COL_WIDTH);
  sample.forEach((row) => {
    row.slice(0, colCount).forEach((cell, i) => {
      const len = String(cell ?? '').length;
      widths[i] = Math.min(Math.max(widths[i], len * CHAR_WIDTH), MAX_COL_WIDTH);
    });
  });
  return { widths, totalColumns };
}

function findMatches(rows: string[][], query: string): { total: number; firstRowIndex: number } {
  const needle = query.trim().toLowerCase();
  if (!needle) return { total: 0, firstRowIndex: -1 };
  let total = 0;
  let firstRowIndex = -1;
  rows.forEach((row, i) => {
    const hit = row.some((cell) => String(cell ?? '').toLowerCase().includes(needle));
    if (hit) {
      total += 1;
      if (firstRowIndex === -1) firstRowIndex = i;
    }
  });
  return { total, firstRowIndex };
}

type SheetViewProps = {
  uri: string;
  format: 'XLSX' | 'XLS' | 'CSV';
  night: boolean;
  findQuery: string;
  onMatchCount: (count: number) => void;
  onTap?: () => void;
};

// §7 R5's sheet preview. §12 D11: pinch to zoom, and the first row and first column stay in view
// (a frozen header): the row is the list's sticky header, the column is moved back by exactly the
// horizontal scroll on the native driver, so neither waits for JavaScript while scrolling. Find
// scrolls to the first matching row and tints the matching cells.
export function SheetView({ uri, format, night, findQuery, onMatchCount, onTap }: SheetViewProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [zoom, setZoom] = useState(1);
  // The zoom a pinch started from, and the latest one (the gesture's callbacks are made once).
  const zoomAtStart = useRef(1);
  const zoomRef = useRef(1);
  const listRef = useRef<FlatList<string[]>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setError(null);
    setActiveSheet(0);
    loadSheets(uri, format)
      .then((loaded) => {
        if (cancelled) return;
        setSheets(loaded);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('SheetView: failed to load', uri, e);
        setError(e instanceof PreviewTooLargeError ? 'tooLarge' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [uri, format]);

  const rows = sheets?.[activeSheet]?.rows ?? [];
  const { widths: columnWidths, totalColumns } = useMemo(() => computeColumnWidths(rows), [rows]);
  const { total, firstRowIndex } = useMemo(() => findMatches(rows, findQuery), [rows, findQuery]);
  const needle = findQuery.trim().toLowerCase();
  const zoomedWidths = useMemo(() => columnWidths.map((w) => Math.round(w * zoom)), [columnWidths, zoom]);

  useEffect(() => {
    onMatchCount(total);
  }, [total, onMatchCount]);

  useEffect(() => {
    if (firstRowIndex >= 0) listRef.current?.scrollToIndex({ index: firstRowIndex, viewPosition: 0.2 });
  }, [firstRowIndex]);

  // On the JS thread: a pinch only changes `zoom`, a few times per gesture (sheetZoom's steps).
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          zoomAtStart.current = zoomRef.current;
        })
        .onUpdate((e) => {
          const next = sheetZoom(zoomAtStart.current, e.scale);
          if (next !== zoomRef.current) {
            zoomRef.current = next;
            setZoom(next);
          }
        }),
    []
  );

  const onScrollX = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }),
    [scrollX]
  );

  if (error) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t(error === 'tooLarge' ? 'reader.tooLargeToPreview' : 'reader.openFailed')}</Text>
      </View>
    );
  }

  if (!sheets) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.loading')}</Text>
      </View>
    );
  }

  // Night mode reads like the dark theme, whatever the app theme is.
  const colors = night ? themes.dark : tokens;
  // A single row has nothing to stay above.
  const freezeHeader = rows.length > 1;

  return (
    <GestureDetector gesture={pinch}>
      <View style={[styles.container, { backgroundColor: colors.bg }]} collapsable={false}>
        {sheets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
            {sheets.map((sheet, i) => (
              <Pressable accessibilityRole="button"
                key={sheet.name}
                onPress={() => setActiveSheet(i)}
                style={[styles.tab, i === activeSheet && { borderBottomColor: tokens.accent, borderBottomWidth: 2 }]}
              >
                <Text style={{ color: i === activeSheet ? tokens.accentInk : tokens.muted, fontWeight: '600' }}>
                  {sheet.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {totalColumns > MAX_COLUMNS && (
          <Text style={[styles.truncNote, { color: tokens.muted }]}>{t('reader.firstColumns', { count: MAX_COLUMNS })}</Text>
        )}
        <Animated.ScrollView horizontal onScroll={onScrollX} scrollEventThrottle={16}>
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(_, i) => String(i)}
            extraData={`${zoom}|${needle}|${night}`}
            stickyHeaderIndices={freezeHeader ? STICKY_FIRST_ROW : undefined}
            renderItem={({ item: row, index }) => (
              <SheetRow
                row={row}
                widths={zoomedWidths}
                zoom={zoom}
                header={freezeHeader && index === 0}
                needle={needle}
                scrollX={scrollX}
                colors={colors}
                onTap={onTap}
              />
            )}
            onScrollToIndexFailed={() => {}}
          />
        </Animated.ScrollView>
      </View>
    </GestureDetector>
  );
}

const STICKY_FIRST_ROW = [0];

type SheetRowProps = {
  row: string[];
  widths: number[];
  zoom: number;
  header: boolean;
  needle: string;
  scrollX: Animated.Value;
  colors: ThemeTokens;
  onTap?: () => void;
};

const SheetRow = memo(function SheetRow({ row, widths, zoom, header, needle, scrollX, colors, onTap }: SheetRowProps) {
  const cellSize = {
    fontSize: CELL_FONT_SIZE * zoom,
    paddingHorizontal: CELL_PADDING_H * zoom,
    paddingVertical: CELL_PADDING_V * zoom,
    borderColor: colors.edge,
  };
  const rowBg = header ? colors.surface2 : colors.bg;
  const tint = (value: string) => (needle && value.toLowerCase().includes(needle) ? colors.accentSoft : undefined);
  return (
    <Pressable accessibilityRole="button" style={[styles.row, { backgroundColor: rowBg }]} onPress={onTap}>
      {widths.map((width, i) => {
        const value = String(row[i] ?? '');
        const style = [
          styles.cell,
          cellSize,
          { width, color: colors.ink, backgroundColor: tint(value) ?? (i === 0 ? rowBg : undefined) },
          header && styles.headerCell,
        ];
        // The first column is moved right by the horizontal scroll, so it stays at the left edge;
        // drawn above the cells sliding under it.
        return i === 0 ? (
          <Animated.Text key={i} numberOfLines={1} style={[style, styles.frozenCell, { transform: [{ translateX: scrollX }] }]}>
            {value}
          </Animated.Text>
        ) : (
          <Text key={i} numberOfLines={1} style={style}>
            {value}
          </Text>
        );
      })}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabStrip: { flexGrow: 0, flexDirection: 'row' },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  truncNote: { fontSize: 11.5, paddingHorizontal: spacing.sm, paddingTop: 4 },
  row: { flexDirection: 'row' },
  cell: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: { fontWeight: '700' },
  frozenCell: { zIndex: 1 },
});
