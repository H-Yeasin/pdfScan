import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BookmarkedPage } from '../../services/study/bookmarks';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { rotationStyle } from '../../utils/rotation';
import { EmptyState } from '../shared/EmptyState';

// §5 T5: bookmarked pages as rows: the page's thumbnail, "<document> · p. 4", and its label.
export function BookmarkList({
  items,
  onOpen,
  onRemove,
  showDocument = true,
}: {
  items: readonly BookmarkedPage[];
  onOpen: (item: BookmarkedPage) => void;
  onRemove?: (item: BookmarkedPage) => void;
  showDocument?: boolean;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const page = item.doc.pages[item.idx];
        return (
          <Pressable
            key={item.bookmark.id}
            style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.doc.name}, page ${item.idx + 1}`}
          >
            <View style={[styles.thumb, { backgroundColor: tokens.surface2 }]}>
              {page ? <Image source={{ uri: page.thumbUri ?? page.fileUri }} style={[styles.thumbImage, rotationStyle(page.rotation)]} resizeMode="cover" /> : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
                {showDocument ? `${item.doc.name} · ` : ''}p. {item.idx + 1}
              </Text>
              {item.bookmark.label ? (
                <Text style={[styles.label, { color: tokens.muted }]} numberOfLines={1}>
                  {item.bookmark.label}
                </Text>
              ) : null}
            </View>
            {onRemove ? (
              <Pressable accessibilityRole="button" onPress={() => onRemove(item)} hitSlop={10} accessibilityLabel={t('study.removeBookmark')} style={styles.remove}>
                <Ionicons name="close" size={18} color={tokens.muted} />
              </Pressable>
            ) : (
              <Ionicons name="bookmark" size={16} color={tokens.accentInk} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// The Reader's list of this document's bookmarks.
export function BookmarksSheet({
  visible,
  items,
  onOpen,
  onRemove,
  onClose,
}: {
  visible: boolean;
  items: readonly BookmarkedPage[];
  onOpen: (item: BookmarkedPage) => void;
  onRemove: (item: BookmarkedPage) => void;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: tokens.bg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[styles.sheetTitle, { color: tokens.ink }]}>{t('study.bookmarks')}</Text>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          {items.length ? (
            <BookmarkList items={items} onOpen={onOpen} onRemove={onRemove} showDocument={false} />
          ) : (
            <EmptyState variant="inline" title={t('study.noBookmarksTitle')} body={t('study.noBookmarks')} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 40,
    height: 52,
    borderRadius: radii.thumb,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
  },
  remove: {
    padding: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.4)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.lg,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sheetBody: {
    paddingHorizontal: spacing.lg,
  },
});
