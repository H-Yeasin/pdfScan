import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';
import { StatusPill } from './StatusPill';

type AutoCapturePillProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function AutoCapturePill({ enabled, onToggle }: AutoCapturePillProps) {
  return (
    <Pressable onPress={onToggle} hitSlop={8}>
      <StatusPill
        variant={enabled ? 'solid' : 'translucent'}
        textColor={enabled ? colors.onAccent : colors.textSecondary}
        icon={<View style={[styles.dot, { backgroundColor: enabled ? colors.onAccent : colors.textDim }]} />}
      >
        {enabled ? 'Auto-capture on · free' : 'Auto-capture off'}
      </StatusPill>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
