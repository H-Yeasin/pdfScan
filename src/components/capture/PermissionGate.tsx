import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';

type PermissionGateProps = {
  onRequestPermission: () => void;
  onImportInstead: () => void;
  canAskAgain: boolean;
};

export function PermissionGate({ onRequestPermission, onImportInstead, canAskAgain }: PermissionGateProps) {
  const chrome = useCaptureChrome();

  return (
    <View style={[styles.container, { backgroundColor: chrome.base }]}>
      <Ionicons name="camera-outline" size={40} color={chrome.textDim} />
      <Text style={[styles.title, { color: chrome.text }]}>Camera access needed</Text>
      <Text style={[styles.body, { color: chrome.textDim }]}>
        {canAskAgain
          ? 'Allow camera access so PDF Scan can detect and capture your documents.'
          : 'Camera access is off. Enable it for this app in your device settings to start scanning.'}
      </Text>
      {canAskAgain ? (
        <Pressable style={[styles.button, { backgroundColor: chrome.accent }]} onPress={onRequestPermission}>
          <Text style={styles.buttonLabel}>Grant camera access</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onImportInstead} hitSlop={8}>
        <Text style={[styles.ghostLabel, { color: chrome.accentInk }]}>Import from gallery instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  ghostLabel: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
  },
});
