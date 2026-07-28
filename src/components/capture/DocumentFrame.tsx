import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { colors, radii } from '../../theme';
import type { LockState } from '../../types/capture';

const DOCUMENT_ASPECT_RATIO = 1.32; // height / width, close to A4/letter
const FRAME_WIDTH_RATIO = 0.66;

type DocumentFrameProps = {
  lockState: LockState;
};

export function DocumentFrame({ lockState }: DocumentFrameProps) {
  const { width: screenWidth } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: lockState === 'searching' ? 0 : 1,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [lockState, progress]);

  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.frameIdle, colors.frameLocked],
  });

  const frameWidth = screenWidth * FRAME_WIDTH_RATIO;
  const frameHeight = frameWidth * DOCUMENT_ASPECT_RATIO;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.frame,
        {
          width: frameWidth,
          height: frameHeight,
          borderColor,
          borderWidth: lockState === 'searching' ? 2 : 3,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    borderRadius: radii.lg,
  },
});
