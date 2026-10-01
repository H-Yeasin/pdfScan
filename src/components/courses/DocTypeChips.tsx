import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DOC_TYPES, docTypeCounts, getDocType } from '../../services/courses/docTypes';
import { radii, spacing, useTheme } from '../../theme';
import type { DocType, LibraryDocument } from '../../types/models';

function Chip({ label, icon, selected, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? tokens.accentInk : tokens.muted} /> : null}
      <Text style={[styles.chipLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>{label}</Text>
    </Pressable>
  );
}

// Filter chips for a document list: "All" plus each type present, with counts. Hidden when every
// document has the same type (nothing to filter), unless a filter is on, so it can be cleared.
export function DocTypeFilterChips({
  docs,
  value,
  onChange,
}: {
  docs: readonly Pick<LibraryDocument, 'docType'>[];
  value: DocType | null;
  onChange: (type: DocType | null) => void;
}) {
  const counts = docTypeCounts(docs);
  if (counts.length < 2 && value === null) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      <Chip label={`All ${docs.length}`} selected={value === null} onPress={() => onChange(null)} />
      {counts.map(({ type, count }) => (
        <Chip
          key={type}
          label={`${getDocType(type).plural} ${count}`}
          selected={value === type}
          onPress={() => onChange(value === type ? null : type)}
        />
      ))}
    </ScrollView>
  );
}

// Deliver's type choice: all six, one tap to change.
export function DocTypeSelector({ value, onChange }: { value: DocType; onChange: (type: DocType) => void }) {
  return (
    <View style={styles.wrap}>
      {DOC_TYPES.map((spec) => (
        <Chip key={spec.id} label={spec.label} icon={spec.icon} selected={value === spec.id} onPress={() => onChange(spec.id)} />
      ))}
    </View>
  );
}

// "Change type" (Reader) and "Set type" (multi-select). `value` is marked when every target shares it.
export function DocTypePickerModal({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: DocType | null;
  onSelect: (type: DocType) => void;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.surface, borderColor: tokens.edge, paddingBottom: spacing.md + insets.bottom }]}
        >
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
          {DOC_TYPES.map((spec) => (
            <Pressable
              key={spec.id}
              style={styles.item}
              onPress={() => {
                onSelect(spec.id);
                onClose();
              }}
            >
              <Ionicons name={spec.icon} size={20} color={tokens.ink} />
              <Text style={[styles.itemLabel, { color: tokens.ink }]}>{spec.label}</Text>
              {value === spec.id ? <Ionicons name="checkmark" size={18} color={tokens.accent} /> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
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
    gap: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  itemLabel: {
    flex: 1,
    fontSize: 15.5,
  },
});
