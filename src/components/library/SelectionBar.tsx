import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { spacing, useTheme, CHROME_MAX_FONT_SCALE } from '../../theme';
import { canAddCover, isPageRasterFormat, isPasswordProtected } from '../../services/documents/formatCapabilities';
import type { LibraryDocument } from '../../types/models';
import { useT } from '../../i18n/useT';
import { BottomBar } from '../shared/BottomBar';

export type SelectionToolId = 'merge' | 'split' | 'compress' | 'sign' | 'type' | 'submit' | 'move' | 'archive' | 'export' | 'cover' | 'delete';

type Tool = { id: SelectionToolId; icon: keyof typeof Ionicons.glyphMap };

const TOOLS: Tool[] = [
  { id: 'submit', icon: 'paper-plane-outline' },
  { id: 'move', icon: 'folder-open-outline' },
  { id: 'type', icon: 'pricetag-outline' },
  { id: 'archive', icon: 'archive-outline' },
  // §8 B3: a zip of the chosen documents (Everything or PDFs only), for any format.
  { id: 'export', icon: 'download-outline' },
  { id: 'merge', icon: 'git-merge-outline' },
  { id: 'split', icon: 'git-branch-outline' },
  { id: 'compress', icon: 'contract-outline' },
  { id: 'sign', icon: 'create-outline' },
  // §14 Q7: a cover page on one PDF (Academic options, then Save as a copy or Replace).
  { id: 'cover', icon: 'document-attach-outline' },
  // §14 Q5: destructive, so last. Any format, a password-protected PDF too: it's never disabled.
  { id: 'delete', icon: 'trash-outline' },
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
  // Cover on one document that can't have one (a DOCX, a protected PDF): dimmed but tappable too,
  // to say "Convert to PDF first" (or that it's protected).
  const blocked = (id: SelectionToolId) =>
    id === 'cover' ? selectionCount === 1 && !canAddCover(selectedDocs[0]) : anyProtected && RASTER_ONLY_TOOLS.includes(id);

  const disabled = (id: SelectionToolId) => {
    if (RASTER_ONLY_TOOLS.includes(id) && !allRaster) return true;
    if (id === 'merge') return selectionCount < 2;
    if (id === 'split' || id === 'sign' || id === 'submit' || id === 'cover') return selectionCount !== 1;
    return false;
  };

  return (
    <BottomBar testID="selection-bar" backgroundColor={tokens.surface} style={[styles.bar, { borderTopColor: tokens.edge }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TOOLS.map((tool) => {
          const isDisabled = disabled(tool.id);
          const color = tool.id === 'delete' ? tokens.danger : tokens.ink;
          return (
            <Pressable accessibilityRole="button"
              key={tool.id}
              testID={`selection-tool-${tool.id}`}
              style={[styles.item, (isDisabled || blocked(tool.id)) && styles.disabled]}
              onPress={() => onPress(tool.id)}
              disabled={isDisabled}
            >
              <Ionicons name={tool.id === 'archive' && allArchived ? 'arrow-undo-outline' : tool.icon} size={20} color={color} />
              <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} numberOfLines={1} style={[styles.label, { color }]}>{tool.id === 'archive' && allArchived ? t('library.tools.unarchive') : t(`library.tools.${tool.id}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomBar>
  );
}

const styles = StyleSheet.create({
  bar: {
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
