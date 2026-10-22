import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import { modifiedAt } from '../../services/library/documentSort';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { formatRelativeDate } from '../../utils/format';
import { useRenderCount } from '../../utils/renderCounts';
import { IconButton, Text, Touchable } from '../ui';
import { FileCover } from './FileRow';

type FileGridItemProps = {
  doc: LibraryDocument;
  selected: boolean;
  selectionMode: boolean;
  courseColor?: string;
  onPress: (doc: LibraryDocument) => void;
  onLongPress: (doc: LibraryDocument) => void;
  onMore: (doc: LibraryDocument) => void;
};

// §17 U7: a document in Files' grid (two columns): the cover as a card, the name and when it last
// changed under it, the ⋯ beside the name. Selecting draws a check in the corner and the accent
// border, so the state never rests on colour alone. Same props as FileRow, so the list switches
// between the two without anything else changing.
export const FileGridItem = memo(function FileGridItem({ doc, selected, selectionMode, courseColor, onPress, onLongPress, onMore }: FileGridItemProps) {
  useRenderCount('FileGridItem');
  const { tokens } = useTheme();
  const { t } = useT();
  const meta = `${isPageRasterFormat(doc.format) ? t('library.pages', { count: doc.pages.length }) : doc.format} · ${formatRelativeDate(modifiedAt(doc))}`;

  return (
    <View style={styles.cell}>
      <Touchable
        accessibilityRole={selectionMode ? 'checkbox' : 'button'}
        accessibilityState={selectionMode ? { checked: selected } : undefined}
        accessibilityLabel={`${doc.name}, ${meta}`}
        accessibilityHint={selectionMode ? undefined : t('library.rowHint')}
        onPress={() => onPress(doc)}
        onLongPress={() => onLongPress(doc)}
        scale={false}
        testID={`file-grid-${doc.id}`}
        style={[styles.card, { backgroundColor: tokens.surface, borderColor: selected ? tokens.accent : tokens.edge }, selected && styles.cardSelected]}
      >
        <FileCover doc={doc} courseColor={courseColor} large />
        {selectionMode ? (
          <View style={[styles.check, { backgroundColor: tokens.surface }]}>
            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? tokens.accent : tokens.muted} />
          </View>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.texts}>
            <Text variant="label" numberOfLines={2}>
              {doc.name}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {meta}
            </Text>
          </View>
          {selectionMode ? null : (
            <IconButton icon={ICONS.more} size="sm" accessibilityLabel={t('library.rowMore', { name: doc.name })} onPress={() => onMore(doc)} />
          )}
        </View>
      </Touchable>
    </View>
  );
});

const styles = StyleSheet.create({
  // FlashList's content style takes padding only, so the gutter is each cell's own.
  cell: {
    flex: 1,
    padding: spacing.xs + 2,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  cardSelected: {
    borderWidth: 2,
    padding: spacing.sm - 1,
  },
  check: {
    position: 'absolute',
    top: spacing.sm + spacing.xs,
    right: spacing.sm + spacing.xs,
    borderRadius: radii.full,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  texts: {
    flex: 1,
    gap: 2,
    minHeight: ICON_SIZE.row * 2,
  },
});
