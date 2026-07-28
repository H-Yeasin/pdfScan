import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { radii } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';

const DOCUMENT_ASPECT_RATIO = 1.32; // height / width, close to A4/letter
const FRAME_WIDTH_RATIO = 0.66;

type DocumentFrameProps = {
  locked: boolean;
};

export function DocumentFrame({ locked }: DocumentFrameProps) {
  const chrome = useCaptureChrome();
  const { width: screenWidth } = useWindowDimensions();
  const progress = useRef(new Animated.Value(locked ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: locked ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [locked, progress]);

  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [chrome.frameIdle, chrome.accent],
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
          borderWidth: locked ? 3 : 2,
          borderStyle: locked ? 'solid' : 'dashed',
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    borderRadius: radii.card,
  },
});
