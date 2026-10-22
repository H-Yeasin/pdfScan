import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ICONS, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import type { LibraryDocument } from '../../types/models';
import { formatBytes } from '../../utils/format';
import { FileCover } from '../library/FileRow';
import { Button, IconButton, ListItem, Text } from '../ui';
import { useModalAnimation } from '../../navigation/transitions';

// §17 U8: choosing several, for a tool (Merge needs 2 or more). `problem` is what still stops
// Continue ("Pick at least 2"), shown under the list; null when the picked ones can go on.
export type PickerMulti = {
  min: number;
  max: number;
  confirmLabel: string;
  problem: (count: number) => string | null;
  onConfirm: (docs: LibraryDocument[]) => void;
};

type DocumentPickerModalProps = {
  visible: boolean;
  title: string;
  docs: LibraryDocument[];
  // One document: a tap picks it. Not used when `multi` is given.
  onPick?: (doc: LibraryDocument) => void;
  multi?: PickerMulti;
  // §17 U8: "Import a file" at the top, so a file from outside works too. Resolves to the new
  // document (already in the library), which is then picked; undefined when nothing came of it.
  onImport?: () => Promise<LibraryDocument | undefined>;
  // Under the title: what the tool takes ("PDFs and scans").
  hint?: string;
  onClose: () => void;
};

// A list of library documents to pick from: one (§7 R3's "Add pages from another document") or,
// for a Tools tab tool, several, with checkboxes (§17 U8).
export function DocumentPickerModal({ visible, title, docs, onPick, multi, onImport, hint, onClose }: DocumentPickerModalProps) {
  const modalAnimationType = useModalAnimation();
  const { tokens } = useTheme();
  const { t } = useT();
  const [picked, setPicked] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // A fresh choice every time it opens.
  useEffect(() => {
    if (visible) setPicked([]);
  }, [visible]);

  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const max = multi?.max ?? 1;

  const toggle = useCallback(
    (doc: LibraryDocument) => {
      if (!multi) {
        onPick?.(doc);
        return;
      }
      setPicked((now) => {
        if (now.includes(doc.id)) return now.filter((id) => id !== doc.id);
        // One at a time: picking another replaces it, as a radio list would.
        if (max === 1) return [doc.id];
        return now.length >= max ? now : [...now, doc.id];
      });
    },
    [multi, onPick, max]
  );

  const runImport = useCallback(async () => {
    if (!onImport) return;
    setImporting(true);
    try {
      const doc = await onImport();
      if (!doc) return;
      if (!multi) onPick?.(doc);
      else setPicked((now) => (now.includes(doc.id) ? now : max === 1 ? [doc.id] : [...now, doc.id].slice(0, max)));
    } finally {
      setImporting(false);
    }
  }, [onImport, multi, onPick, max]);

  const renderItem = useCallback(
    ({ item }: { item: LibraryDocument }) => (
      <ListItem
        title={item.name}
        subtitle={`${isPageRasterFormat(item.format) ? t('library.pages', { count: item.pages.length }) : item.format} · ${formatBytes(item.sizeBytes)}`}
        leading={<FileCover doc={item} />}
        selected={multi ? picked.includes(item.id) : undefined}
        onPress={() => toggle(item)}
        testID={`picker-row-${item.id}`}
      />
    ),
    [multi, picked, toggle, t]
  );

  // Picked documents in the order they were picked (Merge's order), the ones still there.
  const pickedDocs = picked.map((id) => byId.get(id)).filter((d): d is LibraryDocument => !!d);
  const problem = multi ? multi.problem(pickedDocs.length) : null;

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType={modalAnimationType} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="title" accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            {hint ? (
              <Text variant="caption" color="muted">
                {hint}
              </Text>
            ) : null}
          </View>
          <IconButton icon={ICONS.close} accessibilityLabel={t('common.cancel')} onPress={onClose} />
        </View>
        <FlashList
          data={docs}
          keyExtractor={(doc) => doc.id}
          extraData={picked}
          renderItem={renderItem}
          ListHeaderComponent={
            onImport ? (
              <ListItem title={t('tools.pick.importFile')} subtitle={t('tools.pick.importFileSub')} icon={ICONS.import} disabled={importing} onPress={() => void runImport()} />
            ) : null
          }
          ListEmptyComponent={
            <Text color="muted" style={styles.empty}>
              {t(onImport ? 'tools.pick.empty' : 'reader.edit.noDocuments')}
            </Text>
          }
        />
        {multi ? (
          <View style={[styles.footer, { borderTopColor: tokens.edge }]}>
            <Text variant="caption" color="muted" style={styles.footerNote} accessibilityLiveRegion="polite">
              {problem ?? t('tools.pick.selected', { count: pickedDocs.length })}
            </Text>
            <Button label={multi.confirmLabel} disabled={!!problem} onPress={() => multi.onConfirm(pickedDocs)} testID="picker-confirm" />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerText: { flex: 1, gap: spacing.xs },
  empty: { padding: spacing.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerNote: { flex: 1 },
});
