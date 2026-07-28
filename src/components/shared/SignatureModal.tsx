import { useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { captureSignedPage } from '../../services/signature/signatureService';
import { radii, spacing, useTheme } from '../../theme';
import { SignaturePad } from './SignaturePad';

type SignatureModalProps = {
  visible: boolean;
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  onCancel: () => void;
  onConfirm: (flattenedUri: string) => void;
};

export function SignatureModal({ visible, uri, naturalWidth, naturalHeight, onCancel, onConfirm }: SignatureModalProps) {
  const { tokens } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const shotRef = useRef<View>(null);
  const [empty, setEmpty] = useState(true);
  const [padKey, setPadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const maxWidth = screenWidth - spacing.xl * 2;
  const maxHeight = screenHeight * 0.6;
  const ratio = naturalHeight / naturalWidth;
  let displayWidth = maxWidth;
  let displayHeight = displayWidth * ratio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight / ratio;
  }

  const handleClear = () => {
    setPadKey((k) => k + 1);
    setEmpty(true);
  };

  const handleDone = async () => {
    if (empty || saving) return;
    setSaving(true);
    try {
      const flattenedUri = await captureSignedPage(shotRef);
      onConfirm(flattenedUri);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View ref={shotRef} collapsable={false} style={{ width: displayWidth, height: displayHeight }}>
          <Image source={{ uri }} style={{ width: displayWidth, height: displayHeight }} resizeMode="contain" />
          <SignaturePad key={padKey} onChangeEmpty={setEmpty} />
        </View>

        <Text style={styles.hint}>Draw your signature above</Text>

        <View style={styles.actions}>
          <Pressable style={styles.ghostButton} onPress={onCancel}>
            <Text style={styles.ghostLabel}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={handleClear}>
            <Text style={styles.ghostLabel}>Clear</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: tokens.accent, opacity: empty || saving ? 0.5 : 1 }]}
            onPress={handleDone}
            disabled={empty || saving}
          >
            <Text style={styles.primaryLabel}>{saving ? 'Saving…' : 'Done'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  hint: {
    color: 'rgba(255,255,255,.65)',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  ghostButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ghostLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
