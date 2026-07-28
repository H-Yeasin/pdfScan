import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

type StickyActionsProps = {
  saving: boolean;
  onSave: () => void;
  onSaveShare: () => void;
};

export function StickyActions({ saving, onSave, onSaveShare }: StickyActionsProps) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <Pressable
        style={[styles.primary, { backgroundColor: tokens.accent, opacity: saving ? 0.7 : 1 }]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Save</Text>}
      </Pressable>
      <Pressable style={styles.ghost} onPress={onSaveShare} disabled={saving}>
        <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>Save & Share</Text>
      </Pressable>
      <Text style={[styles.footnote, { color: tokens.muted }]}>No watermark. No account. Nothing leaves your phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  primary: {
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ghost: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  footnote: {
    textAlign: 'center',
    fontSize: 12.5,
    marginTop: 2,
  },
});
