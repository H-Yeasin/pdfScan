import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { columnCount, deleteRow, insertRow, setCell } from '../../services/edit/textEdit';
import { useT } from '../../i18n/useT';
import { MIN_TOUCH, radii, spacing, useTheme } from '../../theme';
import { computeColumnWidths, MAX_COLUMNS } from './SheetView';

const ROW_NUMBER_WIDTH = 48;

type CsvGridProps = {
  rows: string[][];
  onChange: (rows: string[][]) => void;
};

// §12 D7: the CSV editor's grid. Laid out like SheetView (same column widths), plus a row-number
// column: tap a cell to edit it, tap a row number to insert a row below it or delete it. Edits are
// pure (services/edit/textEdit), so rows that didn't change keep their identity and don't
// re-render.
export function CsvGrid({ rows, onChange }: CsvGridProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [cell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const { widths } = useMemo(() => computeColumnWidths(rows), [rows]);
  // At least one column, so an empty table still has a cell to tap.
  const columns = widths.length > 0 ? widths : [120];
  const width = Math.min(Math.max(columnCount(rows), 1), MAX_COLUMNS);

  // Rows are memoized and keep the handler they were rendered with, so it reads the rows at the
  // time of the tap, not the ones from that render (an edit elsewhere would be lost otherwise).
  const latest = useRef({ rows, onChange });
  latest.current = { rows, onChange };
  const rowActions = useCallback(
    (index: number) => {
      Alert.alert(t('reader.editFile.rowTitle', { row: index + 1 }), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('reader.editFile.deleteRow'), style: 'destructive', onPress: () => latest.current.onChange(deleteRow(latest.current.rows, index)) },
        { text: t('reader.editFile.insertBelow'), onPress: () => latest.current.onChange(insertRow(latest.current.rows, index)) },
      ]);
    },
    [t]
  );

  return (
    <View style={styles.root}>
      {columnCount(rows) > MAX_COLUMNS ? (
        <Text style={[styles.note, { color: tokens.muted }]}>{t('reader.firstColumns', { count: MAX_COLUMNS })}</Text>
      ) : null}
      <ScrollView horizontal style={styles.root}>
        <FlatList
          data={rows}
          keyExtractor={(_, i) => String(i)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <Row row={item} index={index} widths={columns.slice(0, width)} onCell={(col) => setEditingCell({ row: index, col })} onRowNumber={rowActions} />
          )}
          ListFooterComponent={
            <Pressable
              accessibilityRole="button"
              style={[styles.addRow, { borderColor: tokens.edge }]}
              onPress={() => onChange(insertRow(rows, rows.length - 1))}
            >
              <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>{t('reader.editFile.addRow')}</Text>
            </Pressable>
          }
        />
      </ScrollView>
      <CellEditModal
        cell={cell}
        value={cell ? (rows[cell.row]?.[cell.col] ?? '') : ''}
        onCancel={() => setEditingCell(null)}
        onSubmit={(value) => {
          if (cell && value !== (rows[cell.row]?.[cell.col] ?? '')) onChange(setCell(rows, cell.row, cell.col, value));
          setEditingCell(null);
        }}
      />
    </View>
  );
}

type RowProps = {
  row: string[];
  index: number;
  widths: number[];
  onCell: (col: number) => void;
  onRowNumber: (index: number) => void;
};

const Row = memo(function Row({ row, index, widths, onCell, onRowNumber }: RowProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('reader.editFile.rowTitle', { row: index + 1 })}
        onPress={() => onRowNumber(index)}
        style={[styles.rowNumber, { borderColor: tokens.edge, backgroundColor: tokens.surface2 }]}
      >
        <Text style={[styles.rowNumberText, { color: tokens.muted }]}>{index + 1}</Text>
      </Pressable>
      {widths.map((width, col) => (
        <Pressable
          key={col}
          accessibilityRole="button"
          accessibilityLabel={t('reader.editFile.cellTitle', { row: index + 1, col: col + 1 })}
          onPress={() => onCell(col)}
          style={[styles.cell, { width, borderColor: tokens.edge }]}
        >
          <Text numberOfLines={1} style={[styles.cellText, { color: tokens.ink }]}>
            {row[col] ?? ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}, (a, b) => a.row === b.row && a.index === b.index && a.widths.length === b.widths.length && a.widths.every((w, i) => w === b.widths[i]));

// A cell can hold commas, quotes and line breaks (they're quoted on save), and can be cleared, so
// this isn't TextPromptModal (single line, trims, refuses empty).
function CellEditModal({
  cell,
  value,
  onCancel,
  onSubmit,
}: {
  cell: { row: number; col: number } | null;
  value: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (cell) setDraft(value);
  }, [cell, value]);

  return (
    <Modal transparent visible={cell !== null} animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.cardTitle, { color: tokens.ink }]}>
            {cell ? t('reader.editFile.cellTitle', { row: cell.row + 1, col: cell.col + 1 }) : ''}
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            multiline
            style={[styles.input, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={onCancel}>
              <Text style={{ color: tokens.muted, fontWeight: '600' }}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={[styles.primaryButton, { backgroundColor: tokens.accent }]} onPress={() => onSubmit(draft)}>
              <Text style={{ color: tokens.onAccent, fontWeight: '600' }}>{t('reader.editFile.done')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  note: { fontSize: 11.5, paddingHorizontal: spacing.sm, paddingTop: 4 },
  row: { flexDirection: 'row' },
  rowNumber: {
    width: ROW_NUMBER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowNumberText: { fontSize: 12 },
  cell: {
    paddingHorizontal: 6,
    // §9 O4's minimum tap target per cell.
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cellText: { fontSize: 13 },
  addRow: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginVertical: spacing.md,
    marginLeft: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: 88,
    maxHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  ghostButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.full },
});
