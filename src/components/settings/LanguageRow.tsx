import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

type LanguageRowProps = {
  name: string;
  // The English label under the name, and a few words in the script so it can be recognised.
  subtitle?: string;
  sample?: string;
  selected: boolean;
  // A planned script: shown so students know it's coming, but not selectable.
  comingSoon?: boolean;
  onPress?: () => void;
};

export function LanguageRow({ name, subtitle, sample, selected, comingSoon, onPress }: LanguageRowProps) {
  const { tokens } = useTheme();

  return (
    <Pressable
      style={[styles.row, { borderBottomColor: tokens.edge }]}
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: comingSoon }}
      accessibilityLabel={comingSoon ? `Coming soon: ${name}${subtitle ? ` (${subtitle})` : ''}` : undefined}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: comingSoon ? tokens.muted : tokens.ink }]}>{name}</Text>
        {subtitle || sample ? (
          <Text style={[styles.subtitle, { color: tokens.muted }]} numberOfLines={1}>
            {[subtitle, sample].filter(Boolean).join('  ·  ')}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.status, { color: selected ? tokens.accentInk : tokens.muted }]}>
        {comingSoon ? 'Coming soon' : selected ? 'Active' : 'Select'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: 15.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
  },
});
