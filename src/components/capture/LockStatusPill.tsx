import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useCaptureChrome } from '../../theme/captureChrome';
import { Pill } from '../shared/Pill';

type LockStatusPillProps = {
  locked: boolean;
};

export function LockStatusPill({ locked }: LockStatusPillProps) {
  const chrome = useCaptureChrome();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!locked) {
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
  }, [locked, pulse]);

  return (
    <Pill
      backgroundColor={chrome.pillBg}
      borderColor={chrome.pillBorder}
      textColor={chrome.text}
      icon={
        <Animated.View
          style={[styles.dot, { backgroundColor: locked ? chrome.accent : chrome.textDim, opacity: pulse }]}
        />
      }
    >
      {locked ? 'Page locked — hold still' : 'Fit the page in frame'}
    </Pill>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
