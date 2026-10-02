import { Ionicons } from '@expo/vector-icons';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { rotationStyle } from '../../utils/rotation';

const COLUMNS = 3;
const GAP = spacing.sm;
const LONG_PRESS_MS = 400; // matches FileRow.tsx's own long-press-to-select convention

export type GridPage = { id: string; uri: string; rotation?: number };

type PageGridProps = {
  pages: GridPage[];
  // Outlined in the accent colour (Review's current page).
  highlightedIndex?: number;
  // Selection mode: a check badge on every tile instead of the delete badge.
  selecting: boolean;
  selectedIds: readonly string[];
  onPress: (index: number, page: GridPage) => void;
  onLongPress?: (page: GridPage) => void;
  // The delete badge, outside selection mode. Left out: no badge.
  onDelete?: (page: GridPage) => void;
};

// The grid of page thumbnails shared by Review's "All pages" (GridPagesModal) and the Reader's
// "Edit pages" (§7 R3). Each thumbnail shows its page's turn as a transform.
export function PageGrid({ pages, highlightedIndex, selecting, selectedIds, onPress, onLongPress, onDelete }: PageGridProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <FlatList
      data={pages}
      keyExtractor={(page) => page.id}
      numColumns={COLUMNS}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.row}
      renderItem={({ item, index }) => {
        const chosen = selectedIds.includes(item.id);
        return (
          <Pressable accessibilityRole="button"
            style={[
              styles.tile,
              {
                backgroundColor: tokens.surface,
                borderColor: index === highlightedIndex || (selecting && chosen) ? tokens.accent : tokens.edge,
              },
            ]}
            onPress={() => onPress(index, item)}
            onLongPress={onLongPress ? () => onLongPress(item) : undefined}
            delayLongPress={LONG_PRESS_MS}
          >
            {item.uri ? (
              <Image source={{ uri: item.uri }} style={[styles.tileImage, rotationStyle(item.rotation)]} resizeMode="cover" />
            ) : null}
            <View style={styles.indexBadge}>
              <Text style={styles.indexBadgeText}>{index + 1}</Text>
            </View>
            {selecting ? (
              <View style={[styles.selectBadge, { backgroundColor: chosen ? tokens.accent : 'rgba(0,0,0,.35)' }]}>
                {chosen && <Ionicons name="checkmark" size={13} color={tokens.onAccent} />}
              </View>
            ) : onDelete ? (
              <Pressable
                hitSlop={8}
                style={[styles.deleteBadge, { backgroundColor: tokens.danger }]}
                onPress={() => onDelete(item)}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.removePage', { n: index + 1 })}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
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
});
