import { Ionicons } from '@expo/vector-icons';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { rotationStyle } from '../../utils/rotation';
import { useStableCallback } from '../../utils/useStableCallback';
import { AppImage } from './AppImage';
import { useThumb } from './PageThumb';

const COLUMNS = 3;
const GAP = spacing.sm;
const LONG_PRESS_MS = 400; // matches FileRow.tsx's own long-press-to-select convention

// `uri`: the page's thumbnail. Undefined: the tile shows the placeholder (and, with `documentId`,
// the thumbnail is made).
export type GridPage = { id: string; uri?: string; rotation?: number };

type PageGridProps = {
  pages: GridPage[];
  // The library document the pages belong to: a page without a thumbnail gets one made (§16 G6).
  // Left out for session pages (Review), which always come with a picture.
  documentId?: string;
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

const pageKey = (page: GridPage) => page.id;

// The grid of page thumbnails shared by Review's "All pages" (GridPagesModal) and the Reader's
// "Edit pages" (§7 R3). Each thumbnail shows its page's turn as a transform.
//
// §16 G6: a FlashList, and a memo'd tile that takes primitives and stable handlers: the callers
// build `pages` anew on every render, and a tap used to re-render every tile of a 200-page
// document.
export function PageGrid({ pages, documentId, highlightedIndex, selecting, selectedIds, onPress, onLongPress, onDelete }: PageGridProps) {
  const chosenIds = useMemo(() => new Set(selectedIds), [selectedIds]);
  const press = useStableCallback(onPress);
  const longPress = useStableCallback((page: GridPage) => onLongPress?.(page));
  const remove = useStableCallback((page: GridPage) => onDelete?.(page));
  const canLongPress = !!onLongPress;
  const canDelete = !!onDelete;

  const renderTile = useCallback(
    ({ item, index }: ListRenderItemInfo<GridPage>) => (
      <PageTile
        id={item.id}
        uri={item.uri}
        rotation={item.rotation}
        documentId={documentId}
        index={index}
        highlighted={index === highlightedIndex}
        chosen={chosenIds.has(item.id)}
        selecting={selecting}
        onPress={press}
        onLongPress={canLongPress ? longPress : undefined}
        onDelete={canDelete ? remove : undefined}
      />
    ),
    [documentId, highlightedIndex, chosenIds, selecting, press, longPress, remove, canLongPress, canDelete]
  );

  return <FlashList data={pages} keyExtractor={pageKey} numColumns={COLUMNS} contentContainerStyle={styles.content} renderItem={renderTile} />;
}

type PageTileProps = {
  id: string;
  uri?: string;
  rotation?: number;
  documentId?: string;
  index: number;
  highlighted: boolean;
  chosen: boolean;
  selecting: boolean;
  onPress: (index: number, page: GridPage) => void;
  onLongPress?: (page: GridPage) => void;
  onDelete?: (page: GridPage) => void;
};

const PageTile = memo(function PageTile({ id, uri, rotation, documentId, index, highlighted, chosen, selecting, onPress, onLongPress, onDelete }: PageTileProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const shown = useThumb(uri ? undefined : documentId, { id, thumbUri: uri });
  const page: GridPage = { id, uri, rotation };
  return (
    <Pressable accessibilityRole="button"
      style={[
        styles.tile,
        {
          backgroundColor: tokens.surface,
          borderColor: highlighted || (selecting && chosen) ? tokens.accent : tokens.edge,
        },
      ]}
      onPress={() => onPress(index, page)}
      onLongPress={onLongPress ? () => onLongPress(page) : undefined}
      delayLongPress={LONG_PRESS_MS}
    >
      {shown ? <AppImage uri={shown} recyclingKey={id} style={[styles.tileImage, rotationStyle(rotation)]} /> : null}
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
          onPress={() => onDelete(page)}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.removePage', { n: index + 1 })}
        >
          <Ionicons name="close" size={13} color="#fff" />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // FlashList gives each tile a third of the width and its content style takes padding only, so
  // the gap is half a gap around every tile, taken back off the edge padding.
  content: {
    padding: spacing.lg - GAP / 2,
  },
  tile: {
    margin: GAP / 2,
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
