import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { useT } from '../../i18n/useT';
import type { OutlineEntry } from '../../services/reader/outline';
import { MIN_TOUCH, spacing, typeScale, useTheme } from '../../theme';

type OutlineListProps = {
  entries: OutlineEntry[];
  // The entry being read (outline.sectionIndex), marked and scrolled into view; -1 for none.
  currentIndex: number;
  // 0-based page of the file.
  onPick: (page: number) => void;
  maxHeight: number;
};

// §18 W11: a PDF's contents, one row per outline entry, indented by its level, with the page it
// starts on. An entry that points nowhere in the file reads as a heading and can't be tapped.
export function OutlineList({ entries, currentIndex, onPick, maxHeight }: OutlineListProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const listRef = useRef<FlatList<OutlineEntry>>(null);

  // Opens on the section being read. Read once: the list must not move under a finger.
  const openOn = useRef(currentIndex);
  useEffect(() => {
    if (openOn.current <= 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index: openOn.current, viewPosition: 0.3, animated: false }), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <FlatList
      ref={listRef}
      style={{ maxHeight }}
      data={entries}
      keyExtractor={(entry) => entry.key}
      contentContainerStyle={styles.list}
      // Rows wrap, so their heights aren't known ahead: aim by the average, which lands close.
      onScrollToIndexFailed={(info) => listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })}
      renderItem={({ item, index }) => {
        const current = index === currentIndex;
        const page = item.page;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: current, disabled: page === undefined }}
            accessibilityLabel={page === undefined ? item.title : t('reader.contentsEntryA11y', { title: item.title, page: page + 1 })}
            disabled={page === undefined}
            onPress={() => (page === undefined ? undefined : onPick(page))}
            style={[styles.row, { paddingLeft: spacing.lg + item.depth * spacing.md }, current ? { backgroundColor: tokens.surface2 } : null]}
          >
            <Text
              numberOfLines={2}
              style={[styles.title, { color: page === undefined ? tokens.muted : tokens.ink }, item.depth === 0 || current ? styles.strong : null, current ? { color: tokens.accent } : null]}
            >
              {item.title}
            </Text>
            {page === undefined ? null : <Text style={[styles.page, { color: current ? tokens.accent : tokens.muted }]}>{page + 1}</Text>}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.sm },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { flex: 1, fontSize: typeScale.label.fontSize, fontFamily: typeScale.body.fontFamily },
  strong: { fontFamily: typeScale.label.fontFamily },
  page: { fontSize: typeScale.caption.fontSize, fontFamily: typeScale.caption.fontFamily, fontVariant: ['tabular-nums'] },
});
