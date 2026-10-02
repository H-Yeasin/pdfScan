import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';
import type { LibraryTab } from '../../store/slices/librarySlice';
import { useT } from '../../i18n/useT';

const TABS: LibraryTab[] = ['starred', 'recent', 'courses'];

type LibraryTabsProps = {
  value: LibraryTab;
  onChange: (tab: LibraryTab) => void;
};

export function LibraryTabs({ value, onChange }: LibraryTabsProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <View style={[styles.row, { borderBottomColor: tokens.edge }]}>
      {TABS.map((tab) => {
        const active = tab === value;
        return (
          <Pressable key={tab} onPress={() => onChange(tab)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={[styles.label, { color: active ? tokens.accent : tokens.muted }]}>{t(`library.tabs.${tab}`)}</Text>
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
