import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { radii } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';

const DOCUMENT_ASPECT_RATIO = 1.32; // height / width, close to A4/letter
const FRAME_WIDTH_RATIO = 0.66;

export type FrameRect = { x: number; y: number; width: number; height: number };

type DocumentFrameProps = {
  // Reports the frame's on-screen bounds (window coordinates) once laid out, so the capture
  // screen can map this guide onto the captured photo's pixel space for an auto-crop.
  onMeasured?: (rect: FrameRect) => void;
};

export function DocumentFrame({ onMeasured }: DocumentFrameProps) {
  const chrome = useCaptureChrome();
  const { width: screenWidth } = useWindowDimensions();
  const viewRef = useRef<View>(null);

  const frameWidth = screenWidth * FRAME_WIDTH_RATIO;
  const frameHeight = frameWidth * DOCUMENT_ASPECT_RATIO;

  const handleLayout = () => {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      onMeasured?.({ x, y, width, height });
    });
  };

  return (
    <View
      ref={viewRef}
      onLayout={handleLayout}
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
