import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontFamily, radii, spacing, typeScale, useTheme, touchSlop } from '../../theme';
import { useT } from '../../i18n/useT';
import type { LibraryDocument } from '../../types/models';
import {
  editedPages,
  isEdited,
  movePages,
  removePages,
  rotatePages,
  startEdit,
  type PageEdit,
} from '../../services/persistence/pageEdits';
import { PageGrid } from '../shared/PageGrid';

type EditPagesModalProps = {
  visible: boolean;
  doc: LibraryDocument;
  // Something is being written (save, extract, add); the editor waits.
  busy: boolean;
  onClose: () => void;
  onSave: (edit: PageEdit) => void;
  onExtract: (pageIds: string[]) => void;
  onAddFromScan: () => void;
  onAddFromDocument: () => void;
};

type ToolId = 'rotate' | 'earlier' | 'later' | 'extract' | 'delete';
const TOOLS: { id: ToolId; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'rotate', icon: 'refresh-outline' },
  { id: 'earlier', icon: 'arrow-back-outline' },
  { id: 'later', icon: 'arrow-forward-outline' },
  { id: 'extract', icon: 'copy-outline' },
  { id: 'delete', icon: 'trash-outline' },
];

// §7 R3 "Edit pages" for a saved document: Review's page grid in a library mode. Changes are a
// draft until Save (one rebuild, not one per tap): tap pages to select them, then turn, move or
// delete them - a delete can be undone right here until Save. Extract and Add pages act on the
// saved document straight away, so they wait until the draft is saved.
export function EditPagesModal({ visible, doc, busy, onClose, onSave, onExtract, onAddFromScan, onAddFromDocument }: EditPagesModalProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [edit, setEdit] = useState<PageEdit>(() => startEdit(doc));
  const [selected, setSelected] = useState<string[]>([]);
  // The draft before the last delete, for Undo.
  const [beforeDelete, setBeforeDelete] = useState<{ edit: PageEdit; count: number } | null>(null);

  // A fresh draft each time it opens, and whenever the saved document changes under it.
  useEffect(() => {
    if (!visible) return;
    setEdit(startEdit(doc));
    setSelected([]);
    setBeforeDelete(null);
  }, [visible, doc]);

  const pages = useMemo(() => editedPages(doc, edit), [doc, edit]);
  const dirty = isEdited(doc, edit);
  const gridPages = pages.map((p) => ({ id: p.id, uri: p.thumbUri || p.fileUri, rotation: p.rotation }));

  const toggle = (id: string) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const disabled = (tool: ToolId) => {
    if (busy || selected.length === 0) return true;
    // A document keeps at least one page.
    if (tool === 'delete') return selected.length >= pages.length;
    if (tool === 'extract') return dirty;
    return false;
  };

  const handleTool = (tool: ToolId) => {
    if (disabled(tool)) return;
    if (tool === 'rotate') setEdit(rotatePages(edit, selected, 90));
    else if (tool === 'earlier') setEdit(movePages(edit, selected, -1));
    else if (tool === 'later') setEdit(movePages(edit, selected, 1));
    else if (tool === 'extract') onExtract(pages.filter((p) => selected.includes(p.id)).map((p) => p.id));
    else {
      setBeforeDelete({ edit, count: selected.length });
      setEdit(removePages(edit, selected));
      setSelected([]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable hitSlop={touchSlop(36)} accessibilityRole="button" style={styles.iconButton} onPress={onClose} accessibilityLabel={t('common.cancel')} disabled={busy}>
            <Ionicons name="close" size={22} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>
            {selected.length ? t('review.grid.selected', { count: selected.length }) : t('reader.edit.title')}
          </Text>
          <Pressable accessibilityRole="button"
            style={[styles.saveButton, { backgroundColor: tokens.accent, opacity: dirty && !busy ? 1 : 0.38 }]}
            onPress={() => onSave(edit)}
            disabled={!dirty || busy}
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveLabel}>{t('reader.save')}</Text>}
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: tokens.muted }]}>{t('reader.edit.hint')}</Text>

        <View style={styles.grid}>
          <PageGrid pages={gridPages} selecting selectedIds={selected} onPress={(_, page) => toggle(page.id)} />
        </View>

        {beforeDelete ? (
          <View style={[styles.undoBar, { backgroundColor: tokens.surface2 }]}>
            <Text style={{ color: tokens.ink }}>{t('reader.edit.removed', { count: beforeDelete.count })}</Text>
            <Pressable accessibilityRole="button"
              onPress={() => {
                setEdit(beforeDelete.edit);
                setBeforeDelete(null);
              }}
              hitSlop={8}
            >
              <Text style={[styles.undoLabel, { color: tokens.accent }]}>{t('library.undo')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.bar, { backgroundColor: tokens.surface, borderTopColor: tokens.edge }]}>
          {selected.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
              {TOOLS.map((tool) => (
                <Pressable accessibilityRole="button"
                  key={tool.id}
                  style={[styles.tool, disabled(tool.id) && styles.off]}
                  onPress={() => handleTool(tool.id)}
                  disabled={disabled(tool.id)}
                >
                  <Ionicons name={tool.icon} size={20} color={tool.id === 'delete' ? tokens.danger : tokens.ink} />
                  <Text style={[styles.toolLabel, { color: tool.id === 'delete' ? tokens.danger : tokens.ink }]}>
                    {t(`reader.edit.tools.${tool.id}`)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.addRow}>
              <Text style={[styles.addTitle, { color: tokens.muted }]}>{dirty ? t('reader.edit.saveFirst') : t('reader.edit.addPages')}</Text>
              <Pressable accessibilityRole="button" style={[styles.addButton, { borderColor: tokens.edge }, (dirty || busy) && styles.off]} onPress={onAddFromScan} disabled={dirty || busy}>
                <Ionicons name="scan-outline" size={18} color={tokens.ink} />
                <Text style={{ color: tokens.ink }}>{t('reader.edit.fromScan')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[styles.addButton, { borderColor: tokens.edge }, (dirty || busy) && styles.off]} onPress={onAddFromDocument} disabled={dirty || busy}>
                <Ionicons name="documents-outline" size={18} color={tokens.ink} />
                <Text style={{ color: tokens.ink }}>{t('reader.edit.fromDocument')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  title: { flex: 1, fontSize: typeScale.title.fontSize },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  saveButton: { minWidth: 72, alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.full },
  saveLabel: { color: '#fff', fontWeight: '700' },
  hint: { paddingHorizontal: spacing.lg, fontSize: 13 },
  grid: { flex: 1 },
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
  },
  undoLabel: { fontWeight: '700' },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
  tools: { paddingHorizontal: spacing.md, gap: spacing.xs },
  tool: { alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: 2 },
  toolLabel: { fontSize: 12 },
  off: { opacity: 0.38 },
  addRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  addTitle: { fontSize: 13 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
