import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { isPageRasterFormat, isPasswordProtected } from '../../services/documents/formatCapabilities';
import type { LibraryDocument } from '../../types/models';
import { useT } from '../../i18n/useT';

export type SelectionToolId = 'merge' | 'split' | 'compress' | 'sign' | 'type' | 'submit' | 'move' | 'archive';

type Tool = { id: SelectionToolId; icon: keyof typeof Ionicons.glyphMap };

const TOOLS: Tool[] = [
  { id: 'submit', icon: 'paper-plane-outline' },
  { id: 'move', icon: 'folder-open-outline' },
  { id: 'type', icon: 'pricetag-outline' },
  { id: 'archive', icon: 'archive-outline' },
  { id: 'merge', icon: 'git-merge-outline' },
  { id: 'split', icon: 'git-branch-outline' },
  { id: 'compress', icon: 'contract-outline' },
  { id: 'sign', icon: 'create-outline' },
];

// Merge/Split/Compress/Sign/Submit work on PDF pages (rebuilt from scans' masters, or copied from
// an imported PDF, §7 R2) - meaningless for a format read by its own viewer.
const RASTER_ONLY_TOOLS: SelectionToolId[] = ['merge', 'split', 'compress', 'sign', 'submit'];

type SelectionBarProps = {
  selectedDocs: LibraryDocument[];
  onPress: (id: SelectionToolId) => void;
};

export function SelectionBar({ selectedDocs, onPress }: SelectionBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const selectionCount = selectedDocs.length;
  const allRaster = selectedDocs.every((doc) => isPageRasterFormat(doc.format));
  // Archive turns into Unarchive when everything selected is already archived.
  const allArchived = selectionCount > 0 && selectedDocs.every((doc) => doc.archived);
  // A password-protected PDF: its page tools look off but stay tappable, to say why (the handler
  // shows "This PDF is password-protected").
  const anyProtected = selectedDocs.some(isPasswordProtected);
  const blocked = (id: SelectionToolId) => anyProtected && RASTER_ONLY_TOOLS.includes(id);

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
            style={[styles.item, (isDisabled || blocked(tool.id)) && styles.disabled]}
            onPress={() => onPress(tool.id)}
            disabled={isDisabled}
          >
            <Ionicons name={tool.id === 'archive' && allArchived ? 'arrow-undo-outline' : tool.icon} size={20} color={tokens.ink} />
            <Text style={[styles.label, { color: tokens.ink }]}>{tool.id === 'archive' && allArchived ? t('library.tools.unarchive') : t(`library.tools.${tool.id}`)}</Text>
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
