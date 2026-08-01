import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';

export type OverflowItemId = 'share' | 'sign' | 'export' | 'print' | 'delete';

type Item = { id: OverflowItemId; label: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean };

// Share/Sign/Export/Print now live in the persistent ReaderActionBar; Delete stays here so
// there's exactly one, deliberately-gated path to a destructive action.
const ITEMS: Item[] = [{ id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true }];

type OverflowSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: OverflowItemId) => void;
};

export function OverflowSheet({ visible, onClose, onSelect }: OverflowSheetProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md }]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          {ITEMS.map((item) => (
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
