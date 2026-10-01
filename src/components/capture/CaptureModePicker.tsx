import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';
import { CAPTURE_MODES } from '../../services/capture/captureModes';
import type { CaptureMode } from '../../types/models';

type CaptureModePickerProps = {
  value: CaptureMode;
  onChange: (mode: CaptureMode) => void;
  disabled?: boolean;
};

// Camera-app style row of mode labels above the shutter. Tap a label to switch; the parent
// also wires left/right swipes to the neighbouring mode (see CaptureControls).
export function CaptureModePicker({ value, onChange, disabled }: CaptureModePickerProps) {
  const chrome = useCaptureChrome();

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {CAPTURE_MODES.map((spec) => {
        const active = spec.id === value;
        return (
          <Pressable
            key={spec.id}
            onPress={() => onChange(spec.id)}
            disabled={disabled}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={`${spec.label} mode`}
            style={styles.item}
          >
            <Text style={[styles.label, { color: active ? chrome.accent : chrome.textDim }]}>
              {spec.label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  item: {
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
