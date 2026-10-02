import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import type { PackItem } from '../../store/slices/packSlice';
import { useT } from '../../i18n/useT';

// §5 T6: pick pages from documents (a course's, for the exam pack), each document's pages as a
// row of thumbnails; tap to select. Pages already in the pack are marked and can't be picked again.
export function PagePickerModal({
  visible,
  docs,
  already,
  onAdd,
  onClose,
}: {
  visible: boolean;
  docs: readonly LibraryDocument[];
  already: readonly PackItem[];
  onAdd: (items: PackItem[]) => void;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [picked, setPicked] = useState<PackItem[]>([]);
  useEffect(() => {
    if (visible) setPicked([]);
  }, [visible]);

  const has = (list: readonly PackItem[], documentId: string, pageId: string) => list.some((x) => x.documentId === documentId && x.pageId === pageId);
  const toggle = (item: PackItem) =>
    setPicked((list) => (has(list, item.documentId, item.pageId) ? list.filter((x) => !(x.documentId === item.documentId && x.pageId === item.pageId)) : [...list, item]));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.bg }]}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onClose} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={22} color={tokens.ink} />
          </Pressable>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('study.addPages')}</Text>
          <Pressable
            style={[styles.add, { backgroundColor: tokens.accent, opacity: picked.length ? 1 : 0.5 }]}
            onPress={() => {
              onAdd(picked);
              onClose();
            }}
            disabled={!picked.length}
            accessibilityRole="button"
          >
            <Text style={styles.addLabel}>{picked.length ? t('study.addCount', { count: picked.length }) : t('study.add')}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {docs.map((doc) => (
            <View key={doc.id} style={styles.doc}>
              <Text style={[styles.docName, { color: tokens.ink }]} numberOfLines={1}>
                {doc.name}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pages}>
                {doc.pages.map((page, i) => {
                  const inPack = has(already, doc.id, page.id);
                  const on = has(picked, doc.id, page.id);
                  return (
                    <Pressable
                      key={page.id}
                      onPress={() => !inPack && toggle({ documentId: doc.id, pageId: page.id })}
                      disabled={inPack}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: inPack }}
                      accessibilityLabel={t('study.pageA11y', { doc: doc.name, page: i + 1 })}
                      style={[styles.page, { borderColor: on ? tokens.accent : tokens.edge, opacity: inPack ? 0.4 : 1 }]}
                    >
                      <Image source={{ uri: page.thumbUri ?? page.fileUri }} style={styles.thumb} resizeMode="cover" />
                      <Text style={[styles.pageNo, { color: tokens.ink, backgroundColor: on ? tokens.accentSoft : tokens.surface }]}>{i + 1}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ))}
          {docs.length === 0 ? <Text style={{ color: tokens.muted }}>{t('study.noDocs')}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 56,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  add: {
    height: 38,
    minWidth: 76,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  doc: {
    gap: spacing.sm,
  },
  docName: {
    fontSize: 14,
    fontWeight: '600',
  },
  pages: {
    gap: spacing.sm,
  },
  page: {
    width: 68,
    borderRadius: radii.thumb,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: 88,
  },
  pageNo: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 2,
  },
});
