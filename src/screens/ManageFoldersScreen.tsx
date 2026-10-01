import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderList } from '../components/library/FolderList';
import { useRouter } from '../navigation/router';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import { createId } from '../utils/id';

export function ManageFoldersScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { courses, files } = state.library;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    files.forEach((f) => {
      if (f.courseId) result[f.courseId] = (result[f.courseId] ?? 0) + 1;
    });
    return result;
  }, [files]);

  const unsortedCount = useMemo(() => files.filter((f) => !f.courseId).length, [files]);

  const handleCreate = useCallback(
    (name: string) => dispatch({ type: 'library/CREATE_COURSE', id: createId('course'), name }),
    [dispatch]
  );
  const handleRename = useCallback(
    (id: string, name: string) => dispatch({ type: 'library/UPDATE_COURSE', id, patch: { name } }),
    [dispatch]
  );
  const handleDelete = useCallback((id: string) => dispatch({ type: 'library/DELETE_COURSE', id }), [dispatch]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Manage courses</Text>
      </View>

      <ScrollView>
        <FolderList
          courses={courses}
          counts={counts}
          unsortedCount={unsortedCount}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize + 4,
  },
});
