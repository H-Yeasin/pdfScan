import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { radii } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';

const DOCUMENT_ASPECT_RATIO = 1.32; // height / width, close to A4/letter
const FRAME_WIDTH_RATIO = 0.66;

export function DocumentFrame() {
  const chrome = useCaptureChrome();
  const { width: screenWidth } = useWindowDimensions();

  const frameWidth = screenWidth * FRAME_WIDTH_RATIO;
  const frameHeight = frameWidth * DOCUMENT_ASPECT_RATIO;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.frame,
        {
          width: frameWidth,
          height: frameHeight,
          borderColor: chrome.frameIdle,
          borderWidth: 2,
          borderStyle: 'dashed',
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
