import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

export type SelectionToolId = 'merge' | 'split' | 'compress' | 'protect' | 'sign';

type Tool = { id: SelectionToolId; label: string; icon: keyof typeof Ionicons.glyphMap };

const TOOLS: Tool[] = [
  { id: 'merge', label: 'Merge', icon: 'git-merge-outline' },
  { id: 'split', label: 'Split', icon: 'git-branch-outline' },
  { id: 'compress', label: 'Compress', icon: 'contract-outline' },
  { id: 'protect', label: 'Protect', icon: 'shield-outline' },
  { id: 'sign', label: 'Sign', icon: 'create-outline' },
];

type SelectionBarProps = {
  selectionCount: number;
  onPress: (id: SelectionToolId) => void;
};

export function SelectionBar({ selectionCount, onPress }: SelectionBarProps) {
  const { tokens } = useTheme();

  const disabled = (id: SelectionToolId) => {
    if (id === 'merge') return selectionCount < 2;
    if (id === 'split') return selectionCount !== 1;
    return false;
  };

  return (
    <View style={[styles.row, { backgroundColor: tokens.surface, borderTopColor: tokens.edge }]}>
      {TOOLS.map((tool) => {
        const isDisabled = disabled(tool.id);
        return (
          <Pressable
            key={tool.id}
            style={[styles.item, isDisabled && styles.disabled]}
            onPress={() => onPress(tool.id)}
            disabled={isDisabled}
          >
            <Ionicons name={tool.icon} size={20} color={tokens.ink} />
            <Text style={[styles.label, { color: tokens.ink }]}>{tool.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
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
