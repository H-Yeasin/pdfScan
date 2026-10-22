import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { getDocType } from '../../services/courses/docTypes';
import { activeFilterChips, activeFilterCount, UNSORTED_COURSE_ID, withoutChip, type DocumentFilters, type FilterChipId } from '../../services/library/documentFilters';
import type { DocumentSort } from '../../services/library/documentSort';
import type { FilesLayout } from '../../services/library/filesView';
import { ICONS, spacing, useTheme } from '../../theme';
import type { Course } from '../../types/models';
import { Chip, FilterChip, IconButton } from '../ui';

type FilesToolbarProps = {
  filters: DocumentFilters;
  sort: DocumentSort;
  layout: FilesLayout;
  courses: readonly Course[];
  onFilters: (filters: DocumentFilters) => void;
  onOpenFilters: () => void;
  onOpenSort: () => void;
  onLayout: (layout: FilesLayout) => void;
};

// §17 U7: the row over Files' documents - Filter (with how many are on), the Starred quick chip,
// Sort (named by the order in use) and list / grid - and under it one removable chip per active
// filter. It stays at the top while the documents scroll (the list's sticky first item).
export const FilesToolbar = memo(function FilesToolbar({ filters, sort, layout, courses, onFilters, onOpenFilters, onOpenSort, onLayout }: FilesToolbarProps) {
  const { t } = useT();
  const { tokens } = useTheme();
  const count = activeFilterCount(filters);
  const chips = activeFilterChips(filters);

  const chipLabel = (chip: FilterChipId): string => {
    switch (chip.kind) {
      case 'course':
        return chip.id === UNSORTED_COURSE_ID ? t('common.unsorted') : (courses.find((c) => c.id === chip.id)?.name ?? t('library.movedFallback'));
      case 'type':
        return t(getDocType(chip.type).pluralKey);
      case 'submitted':
        return filters.submitted === 'submitted' ? t('library.filters.submitted') : t('library.filters.notSubmitted');
      case 'bookmarked':
        return t('library.filters.bookmarked');
      case 'archived':
        return t('library.filters.archived');
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: tokens.bg }]} testID="files-toolbar">
      <View style={styles.row}>
        <Chip
          label={t('library.filter')}
          icon={ICONS.filter}
          count={count || undefined}
          onPress={onOpenFilters}
          accessibilityLabel={count ? t('library.filterA11y', { count }) : t('library.filter')}
          testID="files-filter"
        />
        <FilterChip
          label={t('library.filters.starred')}
          icon={ICONS.star}
          selected={filters.starred}
          onPress={() => onFilters({ ...filters, starred: !filters.starred })}
          testID="files-starred"
        />
        <Chip
          label={t(`library.sort.${sort.key}`)}
          icon={ICONS.sort}
          onPress={onOpenSort}
          accessibilityLabel={t('library.sortA11y', { order: t(`library.sort.${sort.key}`) })}
          testID="files-sort"
        />
        <View style={styles.spacer} />
        <IconButton
          icon={layout === 'grid' ? ICONS.listView : ICONS.gridView}
          accessibilityLabel={layout === 'grid' ? t('library.showList') : t('library.showGrid')}
          onPress={() => onLayout(layout === 'grid' ? 'list' : 'grid')}
          testID="files-layout"
        />
      </View>
      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((chip) => {
            const label = chipLabel(chip);
            return <Chip key={`${chip.kind}-${'id' in chip ? chip.id : 'type' in chip ? chip.type : ''}`} label={label} onRemove={() => onFilters(withoutChip(filters, chip))} />;
          })}
        </ScrollView>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  spacer: {
    flex: 1,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
});
