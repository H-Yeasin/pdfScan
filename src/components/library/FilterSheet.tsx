import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { DOC_TYPES } from '../../services/courses/docTypes';
import { NO_FILTERS, toggleIn, UNSORTED_COURSE_ID, type DocumentFilters } from '../../services/library/documentFilters';
import { spacing } from '../../theme';
import type { Course } from '../../types/models';
import { Button, FilterChip, ListItem, Sheet, Text } from '../ui';

type FilterSheetProps = {
  visible: boolean;
  filters: DocumentFilters;
  courses: readonly Course[];
  // Offered only when there is something to filter by (any submission, any bookmark).
  hasSubmissions: boolean;
  hasBookmarks: boolean;
  onApply: (filters: DocumentFilters) => void;
  onClose: () => void;
};

// §17 U7: Files' filters - courses and types (any of them), submitted or not, bookmarked, starred,
// archived shown. The choices are a draft until Apply, so trying one out doesn't reshuffle the list
// under the sheet; Clear empties the draft.
export function FilterSheet({ visible, filters, courses, hasSubmissions, hasBookmarks, onApply, onClose }: FilterSheetProps) {
  const { t } = useT();
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const shownCourses = courses.filter((c) => !c.archived || draft.courseIds.includes(c.id));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('library.filters.title')}
      testID="files-filter-sheet"
      footer={
        <>
          <Button label={t('library.filters.clear')} variant="ghost" onPress={() => setDraft(NO_FILTERS)} />
          <Button
            label={t('library.filters.apply')}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
            testID="files-filter-apply"
          />
        </>
      }
    >
      <Text variant="overline" color="muted" accessibilityRole="header">
        {t('library.filters.course')}
      </Text>
      <View style={styles.chips}>
        {shownCourses.map((course) => (
          <FilterChip
            key={course.id}
            label={course.name}
            selected={draft.courseIds.includes(course.id)}
            onPress={() => setDraft({ ...draft, courseIds: toggleIn(draft.courseIds, course.id) })}
          />
        ))}
        <FilterChip
          label={t('common.unsorted')}
          selected={draft.courseIds.includes(UNSORTED_COURSE_ID)}
          onPress={() => setDraft({ ...draft, courseIds: toggleIn(draft.courseIds, UNSORTED_COURSE_ID) })}
        />
      </View>

      <Text variant="overline" color="muted" accessibilityRole="header">
        {t('library.filters.type')}
      </Text>
      <View style={styles.chips}>
        {DOC_TYPES.map((spec) => (
          <FilterChip
            key={spec.id}
            label={t(spec.pluralKey)}
            icon={spec.icon}
            selected={draft.types.includes(spec.id)}
            onPress={() => setDraft({ ...draft, types: toggleIn(draft.types, spec.id) })}
          />
        ))}
      </View>

      {hasSubmissions ? (
        <>
          <Text variant="overline" color="muted" accessibilityRole="header">
            {t('library.filters.submittedTitle')}
          </Text>
          <View style={styles.chips}>
            {(['any', 'submitted', 'notSubmitted'] as const).map((value) => (
              <FilterChip
                key={value}
                label={t(`library.filters.${value}`)}
                selected={draft.submitted === value}
                onPress={() => setDraft({ ...draft, submitted: value })}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.switches}>
        <ListItem
          title={t('library.filters.starred')}
          switchValue={draft.starred}
          onValueChange={(starred) => setDraft({ ...draft, starred })}
          style={styles.switchRow}
        />
        {hasBookmarks ? (
          <ListItem
            title={t('library.filters.bookmarked')}
            switchValue={draft.bookmarked}
            onValueChange={(bookmarked) => setDraft({ ...draft, bookmarked })}
            style={styles.switchRow}
          />
        ) : null}
        <ListItem
          title={t('library.filters.showArchived')}
          subtitle={t('library.filters.showArchivedHint')}
          switchValue={draft.showArchived}
          onValueChange={(showArchived) => setDraft({ ...draft, showArchived })}
          style={styles.switchRow}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  switches: {
    marginHorizontal: -spacing.lg,
  },
  switchRow: {
    minHeight: 52,
  },
});
