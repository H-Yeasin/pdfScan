import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radii, spacing, fontFamily, typeScale, useTheme } from '../../theme';
import type { SessionPage } from '../../types/models';

const COLUMNS = 3;
const GAP = spacing.sm;
const LONG_PRESS_MS = 400; // matches FileRow.tsx's own long-press-to-select convention

type GridPagesModalProps = {
  visible: boolean;
  pages: SessionPage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
  onMerge: (ids: [string, string]) => void;
  onClose: () => void;
};

export function GridPagesModal({ visible, pages, selectedIndex, onSelect, onDelete, onMerge, onClose }: GridPagesModalProps) {
  const { tokens } = useTheme();
  // Component-local, not store state - this selection is transient to the modal itself (same
  // reasoning as why review.sel is a plain number rather than Library's selMode/selection array).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Never carry a stale selection into the next time the modal is reopened.
  useEffect(() => {
    if (!visible) {
      setSelectionMode(false);
      setSelectedIds([]);
    }
  }, [visible]);

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleTilePress = (index: number, page: SessionPage) => {
    if (selectionMode) {
      setSelectedIds((ids) => (ids.includes(page.id) ? ids.filter((id) => id !== page.id) : [...ids, page.id]));
      return;
    }
    onSelect(index);
    onClose();
  };

  const handleTileLongPress = (page: SessionPage) => {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds([page.id]);
  };

  const handleMergePress = () => {
    // Sort by position in `pages`, not tap order, so the top/bottom halves of the merged page
    // always match page order.
    const sorted = pages.filter((p) => selectedIds.includes(p.id)).map((p) => p.id);
    if (sorted.length !== 2) return;
    onMerge([sorted[0], sorted[1]]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={selectionMode ? handleCancelSelection : onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
        {selectionMode ? (
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={handleCancelSelection}>
              <Ionicons name="close" size={22} color={tokens.ink} />
            </Pressable>
            <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>
              {selectedIds.length} selected
            </Text>
          </View>
        ) : (
          <View style={styles.header}>
            <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>All Pages</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={22} color={tokens.ink} />
            </Pressable>
          </View>
        )}

        <FlatList
          data={pages}
          keyExtractor={(page) => page.id}
          numColumns={COLUMNS}
          contentContainerStyle={styles.content}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => {
            const chosen = selectedIds.includes(item.id);
            return (
              <Pressable
                style={[
                  styles.tile,
                  { backgroundColor: tokens.surface, borderColor: index === selectedIndex ? tokens.accent : tokens.edge },
                ]}
                onPress={() => handleTilePress(index, item)}
                onLongPress={() => handleTileLongPress(item)}
                delayLongPress={LONG_PRESS_MS}
              >
                <Image source={{ uri: item.uri }} style={styles.tileImage} resizeMode="cover" />
                <View style={styles.indexBadge}>
                  <Text style={styles.indexBadgeText}>{index + 1}</Text>
                </View>
                {selectionMode ? (
                  <View style={[styles.selectBadge, { backgroundColor: chosen ? tokens.accent : 'rgba(0,0,0,.35)' }]}>
                    {chosen && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                ) : (
                  <Pressable
                    hitSlop={8}
                    style={[styles.deleteBadge, { backgroundColor: tokens.danger }]}
                    onPress={() => onDelete(item.id)}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />

        {selectionMode && (
          <View style={[styles.mergeBar, { backgroundColor: tokens.surface, borderTopColor: tokens.edge }]}>
            <Pressable
              style={[
                styles.mergeButton,
                { backgroundColor: tokens.accent, opacity: selectedIds.length === 2 ? 1 : 0.38 },
              ]}
              onPress={handleMergePress}
              disabled={selectedIds.length !== 2}
            >
              <Ionicons name="git-merge-outline" size={18} color="#fff" />
              <Text style={styles.mergeButtonLabel}>Merge</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: typeScale.title.fontSize,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  tile: {
    flex: 1 / COLUMNS,
    aspectRatio: 3 / 4,
    borderRadius: radii.thumb,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  indexBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergeBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  mergeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  mergeButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
