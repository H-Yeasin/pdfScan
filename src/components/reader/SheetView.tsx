import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { loadSheets, PreviewTooLargeError, type Sheet } from '../../services/documents/sheetService';
import { useT } from '../../i18n/useT';

const MAX_COLUMNS = 200;
const SAMPLE_ROWS_FOR_WIDTH = 50;
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 240;
const CHAR_WIDTH = 8;

// Computed once per sheet load and kept static rather than live-measured per cell - real
// auto-fit text measurement would defeat FlatList's row virtualization.
function computeColumnWidths(rows: string[][]): { widths: number[]; totalColumns: number } {
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

export function SheetView({ uri, format, night, findQuery, onMatchCount, onTap }: SheetViewProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const listRef = useRef<FlatList<string[]>>(null);

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

  useEffect(() => {
    onMatchCount(total);
  }, [total, onMatchCount]);

  useEffect(() => {
    if (firstRowIndex >= 0) listRef.current?.scrollToIndex({ index: firstRowIndex, viewPosition: 0.2 });
  }, [firstRowIndex]);

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

  const bg = night ? '#14120f' : tokens.bg;
  const ink = night ? '#f2eade' : tokens.ink;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {sheets.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
          {sheets.map((sheet, i) => (
            <Pressable
              key={sheet.name}
              onPress={() => setActiveSheet(i)}
              style={[styles.tab, i === activeSheet && { borderBottomColor: tokens.accent, borderBottomWidth: 2 }]}
            >
              <Text style={{ color: i === activeSheet ? tokens.accent : tokens.muted, fontWeight: '600' }}>
                {sheet.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {totalColumns > MAX_COLUMNS && (
        <Text style={[styles.truncNote, { color: tokens.muted }]}>{t('reader.firstColumns', { count: MAX_COLUMNS })}</Text>
      )}
      <ScrollView horizontal>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item: row }) => (
            <Pressable style={styles.row} onPress={onTap}>
              {columnWidths.map((width, i) => (
                <Text
                  key={i}
                  numberOfLines={1}
                  style={[styles.cell, { width, color: ink, borderColor: tokens.edge }]}
                >
                  {row[i] ?? ''}
                </Text>
              ))}
            </Pressable>
          )}
          onScrollToIndexFailed={() => {}}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabStrip: { flexGrow: 0, flexDirection: 'row' },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  truncNote: { fontSize: 11.5, paddingHorizontal: spacing.sm, paddingTop: 4 },
  row: { flexDirection: 'row' },
  cell: {
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
