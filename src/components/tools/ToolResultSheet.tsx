import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { formatBytes } from '../../utils/format';
import { FileCover } from '../library/FileRow';
import { Button, ListItem, Sheet, Text } from '../ui';

const MARK = 56;

type ToolResultSheetProps = {
  // The documents the tool made or changed (the first is shown); null: closed.
  docs: LibraryDocument[] | null;
  // Compress's "Compressed · done" and the like; else "Saved in Files".
  message?: string;
  onOpen: (doc: LibraryDocument) => void;
  onShare: (doc: LibraryDocument) => void;
  onClose: () => void;
};

// §17 U8: what a tool made: a tick, the new file's card, and Open · Share · Done. U4's SuccessBurst
// takes the tick's place when it is built.
export function ToolResultSheet({ docs, message, onOpen, onShare, onClose }: ToolResultSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const first = docs?.[0];
  const more = docs && docs.length > 1 ? docs.length : 0;

  return (
    <Sheet
      visible={!!first}
      onClose={onClose}
      testID="tool-result"
      footer={
        first ? (
          <>
            <Button label={t('tools.result.done')} variant="ghost" onPress={onClose} />
            <Button label={t('tools.result.share')} variant="tonal" onPress={() => onShare(first)} />
            <Button label={t('tools.result.open')} onPress={() => onOpen(first)} />
          </>
        ) : null
      }
    >
      {first ? (
        <>
          <View style={styles.head} accessibilityLiveRegion="polite">
            <View style={[styles.mark, { backgroundColor: tokens.successSoft }]}>
              <Ionicons name="checkmark" size={30} color={tokens.success} />
            </View>
            <Text variant="title" accessibilityRole="header" style={styles.center}>
              {more ? t('tools.result.made', { count: more }) : t('tools.result.title')}
            </Text>
            <Text color="muted" style={styles.center}>
              {message ?? t('tools.result.saved')}
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: tokens.surface2 }]}>
            <ListItem
              title={first.name}
              subtitle={`${isPageRasterFormat(first.format) ? t('library.pages', { count: first.pages.length }) : first.format} · ${formatBytes(first.sizeBytes)}`}
              leading={<FileCover doc={first} />}
              onPress={() => onOpen(first)}
            />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  mark: { width: MARK, height: MARK, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  card: { borderRadius: radii.card, overflow: 'hidden' },
});
