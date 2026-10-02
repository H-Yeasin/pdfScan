import { Ionicons } from '@expo/vector-icons';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontFamily, spacing, typeScale, useTheme, touchSlop } from '../../theme';
import { useT } from '../../i18n/useT';
import type { LibraryDocument } from '../../types/models';

type DocumentPickerModalProps = {
  visible: boolean;
  title: string;
  docs: LibraryDocument[];
  onPick: (doc: LibraryDocument) => void;
  onClose: () => void;
};

// A plain list of library documents to pick one from (§7 R3: "Add pages from another document").
export function DocumentPickerModal({ visible, title, docs, onPick, onClose }: DocumentPickerModalProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>{title}</Text>
          <Pressable hitSlop={touchSlop(36)} accessibilityRole="button" style={styles.closeButton} onPress={onClose} accessibilityLabel={t('common.cancel')}>
            <Ionicons name="close" size={22} color={tokens.ink} />
          </Pressable>
        </View>
        <FlatList
          data={docs}
          keyExtractor={(doc) => doc.id}
          ListEmptyComponent={<Text style={[styles.empty, { color: tokens.muted }]}>{t('reader.edit.noDocuments')}</Text>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" style={[styles.row, { borderBottomColor: tokens.edge }]} onPress={() => onPick(item)}>
              <Text style={{ color: tokens.ink }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: tokens.muted }}>{t('library.pages', { count: item.pages.length })}</Text>
            </Pressable>
          )}
        />
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
  },
  title: { flex: 1, fontSize: typeScale.title.fontSize },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { padding: spacing.lg },
});
