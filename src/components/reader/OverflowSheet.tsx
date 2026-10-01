import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';

export type OverflowItemId =
  | 'share'
  | 'sign'
  | 'export'
  | 'print'
  | 'delete'
  | 'addToLibrary'
  | 'changeType'
  | 'submit'
  | 'selectText'
  | 'copyText'
  | 'extractText'
  | 'annotate';

type Item = { id: OverflowItemId; label: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean };

// Share/Sign/Export/Print live in the persistent ReaderActionBar; management/destructive actions
// stay here so there's exactly one, deliberately-gated path to each.
const DELETE_ITEM: Item = { id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true };
const CHANGE_TYPE_ITEM: Item = { id: 'changeType', label: 'Change type', icon: 'pricetag-outline' };
// §4 S6: rebuild and share the teacher's copy with the course's preset.
const SUBMIT_ITEM: Item = { id: 'submit', label: 'Submit', icon: 'paper-plane-outline' };
// §5 T3: the OCR text of scanned pages.
const TEXT_ITEMS: Item[] = [
  // §5 T4.
  { id: 'annotate', label: 'Annotate', icon: 'color-fill-outline' },
  { id: 'selectText', label: 'Select text', icon: 'text-outline' },
  { id: 'copyText', label: 'Copy page text', icon: 'copy-outline' },
  { id: 'extractText', label: 'Extract text (.txt)', icon: 'document-text-outline' },
];
const ADD_TO_LIBRARY_ITEM: Item = { id: 'addToLibrary', label: 'Add to Library', icon: 'add-circle-outline' };

type OverflowSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: OverflowItemId) => void;
  // An externally-opened PDF (not yet in the library) has nothing to delete and needs the promote
  // action instead - these two are mutually exclusive in practice (see ReaderScreen's usage).
  showDelete?: boolean;
  showAddToLibrary?: boolean;
  showSubmit?: boolean;
  showText?: boolean;
};

export function OverflowSheet({
  visible,
  onClose,
  onSelect,
  showDelete = true,
  showAddToLibrary = false,
  showSubmit = false,
  showText = false,
}: OverflowSheetProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const items: Item[] = [
    ...(showAddToLibrary ? [ADD_TO_LIBRARY_ITEM] : []),
    ...(showSubmit ? [SUBMIT_ITEM] : []),
    ...(showText ? TEXT_ITEMS : []),
    // Library documents only, like Delete: an external file has no type until it's added.
    ...(showDelete ? [CHANGE_TYPE_ITEM, DELETE_ITEM] : []),
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md }]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={styles.item}
              onPress={() => {
                onClose();
                onSelect(item.id);
              }}
            >
              <Ionicons name={item.icon} size={20} color={item.destructive ? tokens.danger : tokens.ink} />
              <Text style={[styles.itemLabel, { color: item.destructive ? tokens.danger : tokens.ink }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
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
