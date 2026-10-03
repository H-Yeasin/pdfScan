import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { Hint } from '../shared/Hint';
import type { ReaderMoreItemId } from '../../services/documents/readerTools';

export type OverflowItemId = ReaderMoreItemId;

const ICONS: Record<OverflowItemId, keyof typeof Ionicons.glyphMap> = {
  addToLibrary: 'add-circle-outline',
  // §4 S6: rebuild and share the teacher's copy with the course's preset.
  submit: 'paper-plane-outline',
  share: 'share-outline',
  export: 'download-outline',
  // §12 D5: Office → PDF (Pro).
  convertToPdf: 'document-attach-outline',
  print: 'print-outline',
  sign: 'create-outline',
  // §7 R3: reorder, rotate, delete, extract and add pages of a saved document.
  editPages: 'albums-outline',
  // §5 T5.
  bookmarks: 'bookmarks-outline',
  // §5 T3: the OCR text of scanned pages.
  copyText: 'copy-outline',
  extractText: 'document-text-outline',
  // §12 D2.
  readingSettings: 'options-outline',
  changeType: 'pricetag-outline',
  delete: 'trash-outline',
};

type OverflowSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: OverflowItemId) => void;
  // In order: services/documents/readerTools.readerMoreItems decides which apply.
  items: OverflowItemId[];
  // §9 O3: the one-time hint shown under Submit (inside this sheet, never over it).
  submitHint?: { text: string; onDismiss: () => void };
};

// §12 D2: the Reader's More sheet. Study actions are in the bottom tool bar; sharing and managing
// the file are here, with Delete last as the one, deliberately-gated path to a destructive action.
export function OverflowSheet({ visible, onClose, onSelect, items, submitHint }: OverflowSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: tokens.surface,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          {/* A scan has a dozen items: on a small phone they scroll. */}
          <ScrollView style={styles.list} bounces={false}>
            {items.map((id) => {
              const destructive = id === 'delete';
              return (
                <Fragment key={id}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.item}
                    onPress={() => {
                      onClose();
                      onSelect(id);
                    }}
                  >
                    <Ionicons name={ICONS[id]} size={20} color={destructive ? tokens.danger : tokens.ink} />
                    <Text style={[styles.itemLabel, { color: destructive ? tokens.danger : tokens.ink }]}>{t(`reader.actions.${id}`)}</Text>
                  </Pressable>
                  {id === 'submit' && submitHint ? (
                    <Hint text={submitHint.text} onDismiss={submitHint.onDismiss} arrow="up" arrowAlign="left" style={styles.hint} />
                  ) : null}
                </Fragment>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    maxHeight: '90%',
  },
  list: {
    flexGrow: 0,
  },
  hint: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
  },
  itemLabel: {
    fontSize: 15.5,
  },
});
