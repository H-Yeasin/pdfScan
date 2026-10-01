import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import type { LibraryDocument } from '../../types/models';

export type SelectionToolId = 'merge' | 'split' | 'compress' | 'sign' | 'type' | 'submit' | 'move' | 'archive';

type Tool = { id: SelectionToolId; label: string; icon: keyof typeof Ionicons.glyphMap };

const TOOLS: Tool[] = [
  { id: 'submit', label: 'Submit', icon: 'paper-plane-outline' },
  { id: 'move', label: 'Move', icon: 'folder-open-outline' },
  { id: 'type', label: 'Set type', icon: 'pricetag-outline' },
  { id: 'archive', label: 'Archive', icon: 'archive-outline' },
  { id: 'merge', label: 'Merge', icon: 'git-merge-outline' },
  { id: 'split', label: 'Split', icon: 'git-branch-outline' },
  { id: 'compress', label: 'Compress', icon: 'contract-outline' },
  { id: 'sign', label: 'Sign', icon: 'create-outline' },
];

// Merge/Split/Compress/Sign all rebuild a PDF from doc.pages' raster images - meaningless (and, for
// Compress/Sign, actively corrupting) for a format with no real page images.
const RASTER_ONLY_TOOLS: SelectionToolId[] = ['merge', 'split', 'compress', 'sign', 'submit'];

type SelectionBarProps = {
  selectedDocs: LibraryDocument[];
  onPress: (id: SelectionToolId) => void;
};

export function SelectionBar({ selectedDocs, onPress }: SelectionBarProps) {
  const { tokens } = useTheme();
  const selectionCount = selectedDocs.length;
  const allRaster = selectedDocs.every((doc) => isPageRasterFormat(doc.format));
  // Archive turns into Unarchive when everything selected is already archived.
  const allArchived = selectionCount > 0 && selectedDocs.every((doc) => doc.archived);

  const disabled = (id: SelectionToolId) => {
    if (RASTER_ONLY_TOOLS.includes(id) && !allRaster) return true;
    if (id === 'merge') return selectionCount < 2;
    if (id === 'split' || id === 'sign' || id === 'submit') return selectionCount !== 1;
    return false;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.bar, { backgroundColor: tokens.surface, borderTopColor: tokens.edge }]}
      contentContainerStyle={styles.row}
    >
      {TOOLS.map((tool) => {
        const isDisabled = disabled(tool.id);
        return (
          <Pressable
            key={tool.id}
            style={[styles.item, isDisabled && styles.disabled]}
            onPress={() => onPress(tool.id)}
            disabled={isDisabled}
          >
            <Ionicons name={tool.id === 'archive' && allArchived ? 'arrow-undo-outline' : tool.icon} size={20} color={tokens.ink} />
            <Text style={[styles.label, { color: tokens.ink }]}>{tool.id === 'archive' && allArchived ? 'Unarchive' : tool.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: {
    width: 72,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  disabled: {
    opacity: 0.38,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
