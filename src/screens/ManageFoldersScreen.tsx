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
  const { folders, files } = state.library;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    files.forEach((f) => {
      if (f.folderId) result[f.folderId] = (result[f.folderId] ?? 0) + 1;
    });
    return result;
  }, [files]);

  const unfiledCount = useMemo(() => files.filter((f) => !f.folderId).length, [files]);

  const handleCreate = useCallback(
    (name: string) => dispatch({ type: 'library/CREATE_FOLDER', id: createId('folder'), name }),
    [dispatch]
  );
  const handleRename = useCallback(
    (id: string, name: string) => dispatch({ type: 'library/RENAME_FOLDER', id, name }),
    [dispatch]
  );
  const handleDelete = useCallback((id: string) => dispatch({ type: 'library/DELETE_FOLDER', id }), [dispatch]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Manage folders</Text>
      </View>

      <ScrollView>
        <FolderList
          folders={folders}
          counts={counts}
          unfiledCount={unfiledCount}
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
