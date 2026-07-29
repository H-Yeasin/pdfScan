import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextPromptModal } from '../shared/TextPromptModal';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryFolder } from '../../types/models';

type FolderPickerModalProps = {
  visible: boolean;
  folders: LibraryFolder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreate: (name: string) => string;
  onClose: () => void;
};

export function FolderPickerModal({
  visible,
  folders,
  selectedFolderId,
  onSelect,
  onCreate,
  onClose,
}: FolderPickerModalProps) {
  const { tokens } = useTheme();
  const [creating, setCreating] = useState(false);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.title, { color: tokens.ink }]}>Save to</Text>
          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xs }}>
            <Pressable
              style={styles.row}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            >
              <Text style={[styles.rowLabel, { color: tokens.ink }]}>My Scans</Text>
              {selectedFolderId === null && <Ionicons name="checkmark" size={18} color={tokens.accent} />}
            </Pressable>
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                style={styles.row}
                onPress={() => {
                  onSelect(folder.id);
                  onClose();
                }}
              >
                <Text style={[styles.rowLabel, { color: tokens.ink }]} numberOfLines={1}>
                  {folder.name}
                </Text>
                {selectedFolderId === folder.id && <Ionicons name="checkmark" size={18} color={tokens.accent} />}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={styles.newRow} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={18} color={tokens.accentInk} />
            <Text style={[styles.newLabel, { color: tokens.accentInk }]}>New folder</Text>
          </Pressable>

          <Pressable style={styles.cancelRow} onPress={onClose}>
            <Text style={[styles.cancelLabel, { color: tokens.muted }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      <TextPromptModal
        visible={creating}
        title="New folder"
        placeholder="Folder name"
        submitLabel="Create"
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
