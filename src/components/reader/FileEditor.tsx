import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { csvToText, loadCsvForEdit, loadTextForEdit, type CsvTable, type EditFormat } from '../../services/edit/textEdit';
import { useT } from '../../i18n/useT';
import { radii, spacing, touchSlop, useTheme } from '../../theme';
import { CsvGrid } from './CsvGrid';

export type EditorFile = { uri: string; name: string; format: EditFormat; external: boolean };

type FileEditorProps = {
  // null: closed.
  file: EditorFile | null;
  // Writes the text; resolves false when saving failed (the hook reported it), so the edits stay.
  onSave: (text: string) => Promise<boolean>;
  onClose: () => void;
};

type Loaded = { kind: 'txt'; text: string; fallbackUsed: boolean } | { kind: 'csv'; table: CsvTable; fallbackUsed: false };

// §12 D7: the full-screen editor for a TXT or CSV file, opened once D1's gate let it (a day pass,
// or an ad that unlocked this document for `edit_unlock_minutes`). Saving never asks again. Back
// and Close ask before throwing edits away. The Reader's viewers stay read-only.
export function FileEditor({ file, onSave, onClose }: FileEditorProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // TxtView reads in monospace; prose reads better without it.
  const [mono, setMono] = useState(true);

  const uri = file?.uri;
  const format = file?.format;
  useEffect(() => {
    if (!uri || !format) return;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setDirty(false);
    (async () => {
      try {
        if (format === 'TXT') {
          const { text: read, fallbackUsed } = await loadTextForEdit(uri);
          if (cancelled) return;
          setText(read);
          setLoaded({ kind: 'txt', text: read, fallbackUsed });
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

  const save = useCallback(async () => {
    if (!loaded || saving) return;
    setSaving(true);
    try {
      const out = loaded.kind === 'txt' ? text : csvToText({ ...loaded.table, rows });
      if (await onSave(out)) setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [loaded, saving, text, rows, onSave]);

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
            onPress={() => void save()}
            style={[styles.saveButton, { backgroundColor: tokens.accent, opacity: dirty && !saving ? 1 : 0.5 }]}
          >
            {saving ? <ActivityIndicator color={tokens.onAccent} size="small" /> : <Text style={[styles.saveLabel, { color: tokens.onAccent }]}>{t('reader.editFile.save')}</Text>}
          </Pressable>
        </View>

        {file?.external ? <Banner text={t('reader.editFile.outsideNote')} /> : null}
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
        ) : (
          <CsvGrid
            rows={rows}
            onChange={(next) => {
              setRows(next);
              setDirty(true);
            }}
          />
        )}
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  text: { flex: 1, padding: spacing.lg, fontSize: 15, lineHeight: 22 },
  mono: { fontFamily: 'monospace', fontSize: 14.5, lineHeight: 21 },
});
