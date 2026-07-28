import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import type { LockState } from '../../types/capture';
import { StatusPill } from './StatusPill';

const LABEL: Record<LockState, string> = {
  searching: 'Searching for document…',
  locked: 'Page locked — hold still',
  capturing: 'Capturing…',
};

type LockStatusPillProps = {
  lockState: LockState;
};

export function LockStatusPill({ lockState }: LockStatusPillProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (lockState !== 'locked') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [lockState, pulse]);

  return (
    <StatusPill
      icon={
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: lockState === 'locked' ? colors.accent : colors.textDim, opacity: pulse },
          ]}
        />
      }
    >
      {LABEL[lockState]}
    </StatusPill>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
