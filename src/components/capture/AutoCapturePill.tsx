import { Pressable, StyleSheet, View } from 'react-native';
import { useCaptureChrome } from '../../theme/captureChrome';
import { Pill } from '../shared/Pill';

type AutoCapturePillProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function AutoCapturePill({ enabled, onToggle }: AutoCapturePillProps) {
  const chrome = useCaptureChrome();

  return (
    <Pressable onPress={onToggle} hitSlop={8}>
      <Pill
        backgroundColor={chrome.pillBg}
        borderColor={chrome.pillBorder}
        textColor={chrome.text}
        icon={<View style={[styles.dot, { backgroundColor: enabled ? chrome.text : chrome.textDim }]} />}
      >
        {enabled ? 'Auto-capture on · free' : 'Auto-capture off'}
      </Pill>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
