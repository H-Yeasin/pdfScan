import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextPromptModal } from '../shared/TextPromptModal';
import { radii, spacing, useTheme } from '../../theme';
import type { Course } from '../../types/models';

// Sentinel id for the synthetic "Unsorted" bucket — never a real Course.id,
// so it can share the same activeCourseId slot as real course ids.
export const UNSORTED_COURSE_ID = '__unsorted__';

type FolderListProps = {
  courses: Course[];
  counts: Record<string, number>;
  unsortedCount: number;
  onOpenCourse?: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

function pluralFiles(n: number): string {
  return `${n} ${n === 1 ? 'file' : 'files'}`;
}

export function FolderList({ courses, counts, unsortedCount, onOpenCourse, onCreate, onRename, onDelete }: FolderListProps) {
  const { tokens } = useTheme();
  const [promptMode, setPromptMode] = useState<{ kind: 'create' } | { kind: 'rename'; course: Course } | null>(
    null
  );

  const handleLongPress = (course: Course) => {
    Alert.alert(course.name, undefined, [
      { text: 'Rename', onPress: () => setPromptMode({ kind: 'rename', course }) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete course?', 'Files inside stay in your library, moved to Unsorted.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(course.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      {unsortedCount > 0 && (
        <Pressable
          style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => onOpenCourse?.(UNSORTED_COURSE_ID)}
          disabled={!onOpenCourse}
        >
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]}>Unsorted</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{pluralFiles(unsortedCount)}</Text>
          </View>
          {onOpenCourse ? <Ionicons name="chevron-forward" size={18} color={tokens.muted} /> : null}
        </Pressable>
      )}

      {courses.map((course) => (
        <Pressable
          key={course.id}
          style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => onOpenCourse?.(course.id)}
          onLongPress={() => handleLongPress(course)}
          delayLongPress={400}
        >
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {course.name}
            </Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{pluralFiles(counts[course.id] ?? 0)}</Text>
          </View>
          <Pressable onPress={() => handleLongPress(course)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={tokens.muted} />
          </Pressable>
        </Pressable>
      ))}

      <Pressable
        style={[styles.newRow, { borderColor: tokens.edge }]}
        onPress={() => setPromptMode({ kind: 'create' })}
      >
        <Ionicons name="add" size={18} color={tokens.accentInk} />
        <Text style={[styles.newLabel, { color: tokens.accentInk }]}>New course</Text>
      </Pressable>

      <TextPromptModal
        visible={promptMode !== null}
        title={promptMode?.kind === 'rename' ? 'Rename course' : 'New course'}
        initialValue={promptMode?.kind === 'rename' ? promptMode.course.name : ''}
        placeholder="Course name, e.g. CSE 101"
        submitLabel={promptMode?.kind === 'rename' ? 'Rename' : 'Create'}
        onCancel={() => setPromptMode(null)}
        onSubmit={(value) => {
          if (promptMode?.kind === 'rename') onRename(promptMode.course.id, value);
          else onCreate(value);
          setPromptMode(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 15.5,
  },
  subtitle: {
    fontSize: 13.5,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  newLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
});
