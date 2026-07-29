import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextPromptModal } from '../shared/TextPromptModal';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryFolder } from '../../types/models';

// Sentinel id for the synthetic "Unfiled" bucket — never a real LibraryFolder.id,
// so it can share the same activeFolderId slot as real folder ids.
export const UNFILED_FOLDER_ID = '__unfiled__';

type FolderListProps = {
  folders: LibraryFolder[];
  counts: Record<string, number>;
  unfiledCount: number;
  onOpenFolder?: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

function pluralFiles(n: number): string {
  return `${n} ${n === 1 ? 'file' : 'files'}`;
}

export function FolderList({ folders, counts, unfiledCount, onOpenFolder, onCreate, onRename, onDelete }: FolderListProps) {
  const { tokens } = useTheme();
  const [promptMode, setPromptMode] = useState<{ kind: 'create' } | { kind: 'rename'; folder: LibraryFolder } | null>(
    null
  );

  const handleLongPress = (folder: LibraryFolder) => {
    Alert.alert(folder.name, undefined, [
      { text: 'Rename', onPress: () => setPromptMode({ kind: 'rename', folder }) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete folder?', 'Files inside stay in your library, moved to Unfiled.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(folder.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      {unfiledCount > 0 && (
        <Pressable
          style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => onOpenFolder?.(UNFILED_FOLDER_ID)}
          disabled={!onOpenFolder}
        >
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]}>Unfiled</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{pluralFiles(unfiledCount)}</Text>
          </View>
          {onOpenFolder ? <Ionicons name="chevron-forward" size={18} color={tokens.muted} /> : null}
        </Pressable>
      )}

      {folders.map((folder) => (
        <Pressable
          key={folder.id}
          style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => onOpenFolder?.(folder.id)}
          onLongPress={() => handleLongPress(folder)}
          delayLongPress={400}
        >
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {folder.name}
            </Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{pluralFiles(counts[folder.id] ?? 0)}</Text>
          </View>
          <Pressable onPress={() => handleLongPress(folder)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={tokens.muted} />
          </Pressable>
        </Pressable>
      ))}

      <Pressable
        style={[styles.newRow, { borderColor: tokens.edge }]}
        onPress={() => setPromptMode({ kind: 'create' })}
      >
        <Ionicons name="add" size={18} color={tokens.accentInk} />
        <Text style={[styles.newLabel, { color: tokens.accentInk }]}>New folder</Text>
      </Pressable>

      <TextPromptModal
        visible={promptMode !== null}
        title={promptMode?.kind === 'rename' ? 'Rename folder' : 'New folder'}
        initialValue={promptMode?.kind === 'rename' ? promptMode.folder.name : ''}
        placeholder="Folder name"
        submitLabel={promptMode?.kind === 'rename' ? 'Rename' : 'Create'}
        onCancel={() => setPromptMode(null)}
        onSubmit={(value) => {
          if (promptMode?.kind === 'rename') onRename(promptMode.folder.id, value);
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
