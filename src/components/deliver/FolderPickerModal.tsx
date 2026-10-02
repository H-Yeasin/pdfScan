import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CourseBadge } from '../courses/CourseBadge';
import { TextPromptModal } from '../shared/TextPromptModal';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { Course } from '../../types/models';

type FolderPickerModalProps = {
  visible: boolean;
  courses: Course[];
  selectedCourseId: string | null;
  onSelect: (courseId: string | null) => void;
  onCreate: (name: string) => string;
  onClose: () => void;
};

export function FolderPickerModal({
  visible,
  courses,
  selectedCourseId,
  onSelect,
  onCreate,
  onClose,
}: FolderPickerModalProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [creating, setCreating] = useState(false);
  // Archived courses can't be picked for new documents; the current choice stays visible though.
  const pickable = courses.filter((c) => !c.archived || c.id === selectedCourseId);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable accessible={false} style={[styles.sheet, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('deliver.picker.title')}</Text>
          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xs }}>
            <Pressable accessibilityRole="button"
              style={styles.row}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            >
              <Text style={[styles.rowLabel, { color: tokens.ink }]}>{t('common.unsorted')}</Text>
              {selectedCourseId === null && <Ionicons name="checkmark" size={18} color={tokens.accent} />}
            </Pressable>
            {pickable.map((course) => (
              <Pressable accessibilityRole="button"
                key={course.id}
                style={styles.row}
                onPress={() => {
                  onSelect(course.id);
                  onClose();
                }}
              >
                <CourseBadge course={course} size={28} />
                <Text style={[styles.rowLabel, { color: tokens.ink }]} numberOfLines={1}>
                  {course.name}
                </Text>
                {selectedCourseId === course.id && <Ionicons name="checkmark" size={18} color={tokens.accent} />}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable accessibilityRole="button" style={styles.newRow} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={18} color={tokens.accentInk} />
            <Text style={[styles.newLabel, { color: tokens.accentInk }]}>{t('deliver.picker.newCourse')}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" style={styles.cancelRow} onPress={onClose}>
            <Text style={[styles.cancelLabel, { color: tokens.muted }]}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      <TextPromptModal
        visible={creating}
        title={t('deliver.picker.newCourse')}
        placeholder={t('deliver.picker.newCoursePlaceholder')}
        submitLabel={t('deliver.picker.create')}
        onCancel={() => setCreating(false)}
        onSubmit={(value) => {
          const newId = onCreate(value);
          setCreating(false);
          onSelect(newId);
          onClose();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.card * 1.5,
    borderTopRightRadius: radii.card * 1.5,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '70%',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  rowLabel: {
    fontSize: 15.5,
    flex: 1,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  newLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
