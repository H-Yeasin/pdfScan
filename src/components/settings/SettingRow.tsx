import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

type SettingRowProps = {
  title: string;
  subtitle?: string;
  trailing?: string;
  onPress?: () => void;
  chevron?: boolean;
};

export function SettingRow({ title, subtitle, trailing, onPress, chevron }: SettingRowProps) {
  const { tokens } = useTheme();

  return (
    <Pressable
      style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: tokens.muted }]}>{subtitle}</Text> : null}
      </View>
      {trailing ? <Text style={[styles.trailing, { color: tokens.muted }]}>{trailing}</Text> : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={tokens.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15.5,
  },
  subtitle: {
    fontSize: 13.5,
  },
  trailing: {
    fontSize: 14,
    fontWeight: '600',
  },
});
