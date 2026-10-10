import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomBar } from '../shared/BottomBar';
import { radii, spacing, fontFamily, typeScale, useTheme, touchSlop } from '../../theme';
import { useT } from '../../i18n/useT';
import type { SessionPage } from '../../types/models';
import { PageGrid } from '../shared/PageGrid';

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
  const { t } = useT();
  // Component-local, not store state - this selection is transient to the modal itself (same
  // reasoning as why review.sel is a plain number rather than Library's selMode/selection, state.libraryUi).
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

  const handleTilePress = (index: number, id: string) => {
    if (selectionMode) {
      setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
      return;
    }
    onSelect(index);
    onClose();
  };

  const handleTileLongPress = (id: string) => {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds([id]);
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
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" onRequestClose={selectionMode ? handleCancelSelection : onClose}>
      {/* §14 Q4: while selecting, the merge bar pads itself (BottomBar); otherwise the grid stops above the navigation bar. */}
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={selectionMode ? ['top'] : ['top', 'bottom']}>
        {selectionMode ? (
          <View style={styles.header}>
            <Pressable hitSlop={touchSlop(36)} accessibilityRole="button" style={styles.closeButton} onPress={handleCancelSelection} accessibilityLabel={t('common.cancel')}>
              <Ionicons name="close" size={22} color={tokens.ink} />
            </Pressable>
            <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>
              {t('review.grid.selected', { count: selectedIds.length })}
            </Text>
          </View>
        ) : (
          <View style={styles.header}>
            <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>{t('review.grid.title')}</Text>
            <Pressable hitSlop={touchSlop(36)} style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={22} color={tokens.ink} />
            </Pressable>
          </View>
        )}

        <PageGrid
          pages={pages.map((p) => ({ id: p.id, uri: p.thumbUri ?? p.uri, rotation: p.rotation }))}
          highlightedIndex={selectedIndex}
          selecting={selectionMode}
          selectedIds={selectedIds}
          onPress={(index, page) => handleTilePress(index, page.id)}
          onLongPress={(page) => handleTileLongPress(page.id)}
          onDelete={(page) => onDelete(page.id)}
        />

        {selectionMode && (
          <BottomBar backgroundColor={tokens.surface} style={[styles.mergeBarEdge, { borderTopColor: tokens.edge }]}>
            <View style={styles.mergeBar}>
              <Pressable accessibilityRole="button"
                style={[
                  styles.mergeButton,
                  { backgroundColor: tokens.accent, opacity: selectedIds.length === 2 ? 1 : 0.38 },
                ]}
                onPress={handleMergePress}
                disabled={selectedIds.length !== 2}
              >
                <Ionicons name="git-merge-outline" size={18} color={tokens.onAccent} />
                <Text style={[styles.mergeButtonLabel, { color: tokens.onAccent }]}>{t('review.grid.merge')}</Text>
              </Pressable>
            </View>
          </BottomBar>
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
  mergeBarEdge: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mergeBar: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    fontSize: 15,
    fontWeight: '700',
  },
});
