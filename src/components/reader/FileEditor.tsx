import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { csvToText, loadCsvForEdit, loadTextForEdit, type CsvTable, type EditFormat } from '../../services/edit/textEdit';
import {
  editValue,
  loadSheetsForEdit,
  recordEdit,
  sheetCopyName,
  type EditableSheet,
  type SheetEditFormat,
  type SheetEdits,
} from '../../services/edit/sheetEdit';
import { loadDocxForEdit } from '../../services/edit/docxEdit';
import { useT } from '../../i18n/useT';
import { radii, spacing, touchSlop, useTheme } from '../../theme';
import { CsvGrid } from './CsvGrid';
import { DocxEditor, type DocxEditorHandle } from './DocxEditor';

export type EditorFile = { uri: string; name: string; format: EditFormat | SheetEditFormat | 'DOCX'; external: boolean };

// What Save hands over: a TXT or CSV file's whole text, a workbook's cell edits (§12 D8), or a
// Word file's edited HTML and the pictures its `data-img` tags point at (§12 D9).
export type EditorOutput =
  | { kind: 'text'; text: string }
  | { kind: 'sheet'; edits: SheetEdits }
  | { kind: 'docx'; html: string; images: readonly string[] };

type FileEditorProps = {
  // null: closed.
  file: EditorFile | null;
  // Writes the edit; resolves false when saving failed (the hook reported it), so the edits stay.
  onSave: (output: EditorOutput) => Promise<boolean>;
  onClose: () => void;
};

type Loaded =
  | { kind: 'txt'; text: string; fallbackUsed: boolean }
  | { kind: 'csv'; table: CsvTable; fallbackUsed: false }
  | { kind: 'sheet'; sheets: EditableSheet[]; fallbackUsed: false }
  | { kind: 'docx'; html: string; images: string[]; fallbackUsed: false };

// §12 D7: the full-screen editor for a TXT or CSV file, opened once D1's gate let it (a day pass,
// or an ad that unlocked this document for `edit_unlock_minutes`). Saving never asks again. Back
// and Close ask before throwing edits away. The Reader's viewers stay read-only. §12 D8: an XLSX
// or XLS file's cells, sheet by sheet, saved as a copy after a warning about what may be lost.
// §12 D9: a Word file's text in DocxEditor (a contenteditable WebView), saved as a copy after a
// "layout may change" warning.
export function FileEditor({ file, onSave, onClose }: FileEditorProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  // A workbook: each sheet's rows as edited, which sheet is shown, and the cell edits to apply.
  const [sheetRows, setSheetRows] = useState<string[][][]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [edits, setEdits] = useState<SheetEdits>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // TxtView reads in monospace; prose reads better without it.
  const [mono, setMono] = useState(true);
  const docxRef = useRef<DocxEditorHandle>(null);

  const uri = file?.uri;
  const format = file?.format;
  useEffect(() => {
    if (!uri || !format) return;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setDirty(false);
    setEdits({});
    setActiveSheet(0);
    (async () => {
      try {
        if (format === 'TXT') {
          const { text: read, fallbackUsed } = await loadTextForEdit(uri);
          if (cancelled) return;
          setText(read);
          setLoaded({ kind: 'txt', text: read, fallbackUsed });
        } else if (format === 'DOCX') {
          const { html, images } = await loadDocxForEdit(uri);
          if (cancelled) return;
          setLoaded({ kind: 'docx', html, images, fallbackUsed: false });
        } else if (format === 'XLSX' || format === 'XLS') {
          const sheets = await loadSheetsForEdit(uri);
          if (cancelled) return;
          setSheetRows(sheets.map((sheet) => sheet.rows));
          setLoaded({ kind: 'sheet', sheets, fallbackUsed: false });
        } else {
          const table = await loadCsvForEdit(uri);
          if (cancelled) return;
          setRows(table.rows);
          setLoaded({ kind: 'csv', table, fallbackUsed: false });
        }
      } catch (e) {
        if (cancelled) return;
        console.warn('FileEditor: failed to load', e);
        setError(e instanceof PreviewTooLargeError ? 'tooLarge' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, format]);

  const write = useCallback(
    async (output: EditorOutput) => {
      setSaving(true);
      try {
        if (await onSave(output)) setDirty(false);
      } finally {
        setSaving(false);
      }
    },
    [onSave]
  );

  const save = useCallback(() => {
    if (!loaded || saving) return;
    if (loaded.kind === 'docx') {
      // The page's HTML loses Word's styles, fonts and layout on the way back, so the student is
      // told first; the original is never written.
      const images = loaded.images;
      Alert.alert(t('reader.editFile.sheetSaveTitle'), t('reader.editFile.docxSaveBody', { name: sheetCopyName(file?.name ?? '') }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reader.editFile.sheetSave'),
          onPress: () => {
            const editor = docxRef.current;
            if (!editor) return;
            setSaving(true);
            editor
              .getHtml()
              .then((html) => write({ kind: 'docx', html, images }))
              .catch((e: unknown) => {
                console.warn('FileEditor: could not read the edited document', e);
                setSaving(false);
                Alert.alert(t('reader.editFile.failedTitle'), t('reader.editFile.failed'));
              });
          },
        },
      ]);
      return;
    }
    if (loaded.kind !== 'sheet') {
      void write({ kind: 'text', text: loaded.kind === 'txt' ? text : csvToText({ ...loaded.table, rows }) });
      return;
    }
    // A workbook can lose styles, charts and uncomputed formulas on the way through SheetJS, so
    // the student is told first; the original is never written.
    Alert.alert(t('reader.editFile.sheetSaveTitle'), t('reader.editFile.sheetSaveBody', { name: sheetCopyName(file?.name ?? '') }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('reader.editFile.sheetSave'), onPress: () => void write({ kind: 'sheet', edits }) },
    ]);
  }, [loaded, saving, text, rows, edits, file?.name, write, t]);

  const sheet = loaded?.kind === 'sheet' ? loaded.sheets[activeSheet] : undefined;
  const activeRows = sheetRows[activeSheet] ?? [];

  const close = useCallback(() => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(t('reader.editFile.discardTitle'), t('reader.editFile.discardBody'), [
      { text: t('reader.editFile.keepEditing'), style: 'cancel' },
      { text: t('reader.editFile.discard'), style: 'destructive', onPress: onClose },
    ]);
  }, [dirty, saving, onClose, t]);

  return (
    <Modal visible={file !== null} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.bg }]}>
        <View style={[styles.header, { borderBottomColor: tokens.edge }]}>
          <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={close} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={22} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
            {file?.name ?? ''}
          </Text>
          {format === 'TXT' && loaded ? (
            <Pressable
              hitSlop={touchSlop(44)}
              accessibilityRole="switch"
              accessibilityState={{ checked: mono }}
              accessibilityLabel={t('reader.editFile.monospace')}
              style={[styles.iconButton, mono && { backgroundColor: tokens.accentSoft, borderRadius: radii.chip }]}
              onPress={() => setMono((v) => !v)}
            >
              <Ionicons name="code-slash-outline" size={20} color={mono ? tokens.accentInk : tokens.muted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !dirty || saving }}
            disabled={!dirty || saving}
            onPress={save}
            style={[styles.saveButton, { backgroundColor: tokens.accent, opacity: dirty && !saving ? 1 : 0.5 }]}
          >
            {saving ? <ActivityIndicator color={tokens.onAccent} size="small" /> : <Text style={[styles.saveLabel, { color: tokens.onAccent }]}>{t('reader.editFile.save')}</Text>}
          </Pressable>
        </View>

        {format === 'XLSX' || format === 'XLS' ? (
          <Banner text={t('reader.editFile.sheetNote')} />
        ) : format === 'DOCX' ? (
          <Banner text={t('reader.editFile.docxNote')} />
        ) : file?.external ? (
          <Banner text={t('reader.editFile.outsideNote')} />
        ) : null}
        {loaded?.fallbackUsed ? <Banner text={t('reader.editFile.notUtf8')} /> : null}

        {error ? (
          <View style={styles.empty}>
            <Text style={{ color: tokens.muted }}>{t(error === 'tooLarge' ? 'reader.editFile.tooLarge' : 'reader.openFailed')}</Text>
          </View>
        ) : !loaded ? (
          <View style={styles.empty}>
            <ActivityIndicator color={tokens.accent} />
          </View>
        ) : loaded.kind === 'txt' ? (
          <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TextInput
              value={text}
              onChangeText={(next) => {
                setText(next);
                setDirty(true);
              }}
              multiline
              autoCorrect={false}
              autoCapitalize="sentences"
              placeholder={t('reader.editFile.placeholder')}
              placeholderTextColor={tokens.muted}
              textAlignVertical="top"
              scrollEnabled
              // The system font otherwise: it has every script a student's notes may be in.
              style={[styles.text, { color: tokens.ink }, mono && styles.mono]}
            />
          </KeyboardAvoidingView>
        ) : loaded.kind === 'sheet' && sheet ? (
          <>
            {loaded.sheets.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
                {loaded.sheets.map((s, i) => (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: i === activeSheet }}
                    key={s.name}
                    onPress={() => setActiveSheet(i)}
                    style={[styles.tab, i === activeSheet && { borderBottomColor: tokens.accent, borderBottomWidth: 2 }]}
                  >
                    <Text style={{ color: i === activeSheet ? tokens.accentInk : tokens.muted, fontWeight: '600' }}>{s.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <CsvGrid
              // A fresh grid per sheet: its open cell prompt belongs to the sheet it was opened on.
              key={sheet.name}
              rows={activeRows}
              rowActions={false}
              hint={t('reader.editFile.formulaHint')}
              editValue={(row, col) => editValue(sheet, edits, activeRows, row, col)}
              onCellChange={(row, col, value) => {
                setEdits((prev) => recordEdit(prev, sheet.name, row, col, value));
                setDirty(true);
              }}
              onChange={(next) => {
                setSheetRows((prev) => prev.map((r, i) => (i === activeSheet ? next : r)));
                // Add row changes the rows without a cell edit; nothing to save until a cell is.
              }}
            />
          </>
        ) : loaded.kind === 'docx' ? (
          <DocxEditor
            // A fresh page per file: the WebView owns the text once it has it.
            key={uri}
            ref={docxRef}
            html={loaded.html}
            onDirty={() => setDirty(true)}
          />
        ) : loaded.kind === 'csv' ? (
          <CsvGrid
            rows={rows}
            onChange={(next) => {
              setRows(next);
              setDirty(true);
            }}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function Banner({ text }: { text: string }) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: tokens.accentSoft }]}>
      <Text style={[styles.bannerText, { color: tokens.accentInk }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  saveButton: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontSize: 15, fontWeight: '600' },
  banner: { padding: spacing.sm },
  bannerText: { fontSize: 12.5, textAlign: 'center' },
  tabStrip: { flexGrow: 0, flexDirection: 'row' },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  text: { flex: 1, padding: spacing.lg, fontSize: 15, lineHeight: 22 },
  mono: { fontFamily: 'monospace', fontSize: 14.5, lineHeight: 21 },
});
