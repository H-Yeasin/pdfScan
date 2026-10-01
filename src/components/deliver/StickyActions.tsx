import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

type StickyActionsProps = {
  saving: boolean;
  // Shown under the Save button while saving (e.g. "Preparing page 3 of 10…").
  progress?: string | null;
  // §4 S6: save, build the teacher's copy and open the share sheet, in one tap.
  onSubmit: () => void;
  onSave: () => void;
  onSaveShare: () => void;
};

export function StickyActions({ saving, progress, onSubmit, onSave, onSaveShare }: StickyActionsProps) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <Pressable
        style={[styles.primary, { backgroundColor: tokens.accent, opacity: saving ? 0.7 : 1 }]}
        onPress={onSubmit}
        disabled={saving}
        accessibilityLabel="Submit: save, then share the named file"
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Submit</Text>}
      </Pressable>
      {saving && progress ? (
        <Text style={[styles.progress, { color: tokens.muted }]} accessibilityLiveRegion="polite">
          {progress}
        </Text>
      ) : null}
      <View style={styles.secondaryRow}>
        <Pressable style={styles.ghost} onPress={onSave} disabled={saving}>
          <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>Save</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={onSaveShare} disabled={saving}>
          <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>Save & Share</Text>
        </Pressable>
      </View>
      {Platform.OS === 'ios' && (
        <Text style={[styles.shareHint, { color: tokens.muted }]}>
          Share also lets you save to Files, iCloud Drive, or another app.
        </Text>
      )}
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
  progress: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: spacing.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
  },
  ghost: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  shareHint: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 2,
  },
  footnote: {
    textAlign: 'center',
    fontSize: 12.5,
    marginTop: 2,
  },
});
