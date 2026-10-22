import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { spacing } from '../../theme';
import type { Course, Deadline } from '../../types/models';
import { DeadlineList } from '../deadlines/DeadlineList';
import { Button } from '../ui';
import { SectionHeader } from './SectionHeader';

type DueSoonProps = {
  // dueSoon(): the next 7 days', overdue first. Empty: the section isn't there at all (Home puts a
  // small "Add a deadline" chip on the Courses row instead).
  deadlines: readonly Deadline[];
  courses: readonly Course[];
  now: number;
  onOpen: (deadline: Deadline) => void;
  onAdd: () => void;
};

// §17 U6: only when something is due.
export function DueSoon({ deadlines, courses, now, onOpen, onAdd }: DueSoonProps) {
  const { t } = useT();
  if (deadlines.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={t('home.dueSoon')} trailing={<Button variant="ghost" size="sm" label={t('home.addDeadline')} onPress={onAdd} />} />
      <DeadlineList
        deadlines={deadlines}
        now={now}
        courseLabel={(d) => {
          const c = courses.find((x) => x.id === d.courseId);
          return c?.code || c?.name;
        }}
        onPress={onOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
});
