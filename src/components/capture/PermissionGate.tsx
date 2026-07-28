import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type PermissionGateProps = {
  onRequestPermission: () => void;
  canAskAgain: boolean;
};

export function PermissionGate({ onRequestPermission, canAskAgain }: PermissionGateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="camera-outline" size={40} color={colors.textSecondary} />
      <Text style={styles.title}>Camera access needed</Text>
      <Text style={styles.body}>
        {canAskAgain
          ? 'Allow camera access so PDF Scan can detect and capture your documents.'
          : 'Camera access is off. Enable it for this app in your device settings to start scanning.'}
      </Text>
      {canAskAgain ? (
        <Pressable style={styles.button} onPress={onRequestPermission}>
          <Text style={styles.buttonLabel}>Grant camera access</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxxl,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  buttonLabel: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
});
