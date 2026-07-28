import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';
import type { LibraryTab } from '../../store/slices/librarySlice';

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'starred', label: '★ Starred' },
  { id: 'recent', label: 'Recent' },
  { id: 'folders', label: 'Folders' },
];

type LibraryTabsProps = {
  value: LibraryTab;
  onChange: (tab: LibraryTab) => void;
};

export function LibraryTabs({ value, onChange }: LibraryTabsProps) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: tokens.edge }]}>
      {TABS.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.tab}>
            <Text style={[styles.label, { color: active ? tokens.accent : tokens.muted }]}>{tab.label}</Text>
            {active && <View style={[styles.underline, { backgroundColor: tokens.accent }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  underline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
});
