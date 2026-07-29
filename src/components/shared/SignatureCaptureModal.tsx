import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { captureIsolatedSignature } from '../../services/signature/signatureService';
import { radii, spacing, useTheme } from '../../theme';
import { INK_COLORS, SignaturePad } from './SignaturePad';

const SIGNATURE_CANVAS_RATIO = 0.4; // canvasHeight = canvasWidth * this — a landscape signature box

type SignatureCaptureModalProps = {
  visible: boolean;
  onCancel: () => void;
  onCapture: (signature: { uri: string; aspectRatio: number }) => void;
};

// Step 1 of the two-step PDF signing flow: captures ink only (no page image behind it) as a
// transparent PNG, so it can be placed and resized independently in step 2. The visible frame
// lives on an outer View, not the screenshotted node, so it never gets rasterized into the PNG.
export function SignatureCaptureModal({ visible, onCancel, onCapture }: SignatureCaptureModalProps) {
  const { tokens } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const shotRef = useRef<View>(null);
  const [empty, setEmpty] = useState(true);
  const [padKey, setPadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [strokeColor, setStrokeColor] = useState(INK_COLORS[0]);

  const canvasWidth = screenWidth - spacing.xl * 2;
  const canvasHeight = canvasWidth * SIGNATURE_CANVAS_RATIO;

  const handleClear = () => {
    setPadKey((k) => k + 1);
    setEmpty(true);
  };

  const handleDone = async () => {
    if (empty || saving) return;
    setSaving(true);
    try {
      const uri = await captureIsolatedSignature(shotRef);
      onCapture({ uri, aspectRatio: canvasHeight / canvasWidth });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <GestureHandlerRootView style={styles.backdrop}>
        <View style={[styles.frame, { width: canvasWidth, height: canvasHeight, borderColor: tokens.accent }]}>
          <View ref={shotRef} collapsable={false} style={{ width: canvasWidth, height: canvasHeight }}>
            <SignaturePad key={padKey} strokeColor={strokeColor} onChangeEmpty={setEmpty} />
          </View>
        </View>

        <View style={styles.swatches}>
          {INK_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => setStrokeColor(color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                strokeColor === color && [styles.swatchSelected, { borderColor: tokens.accent }],
              ]}
            />
          ))}
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
            <Text style={styles.primaryLabel}>{saving ? 'Saving…' : 'Next'}</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
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
  frame: {
    borderWidth: 1,
    borderRadius: radii.card,
  },
  swatches: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderWidth: 2,
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
