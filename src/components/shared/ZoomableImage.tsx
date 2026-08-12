import { StyleSheet, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useZoomableImageGesture } from './useZoomableImageGesture';

type ZoomableImageProps = {
  uri: string;
  style?: ViewStyle;
  // Pan-while-zoomed is disabled by default when an image sits inside a scrollable list
  // (e.g. Reader) to avoid the drag gesture fighting the list's own vertical scroll.
  panEnabled?: boolean;
};

export function ZoomableImage({ uri, style, panEnabled = true }: ZoomableImageProps) {
  const { gesture, animatedStyle } = useZoomableImageGesture({ panEnabled });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.container, style]}>
        <Animated.Image source={{ uri }} style={[styles.image, animatedStyle]} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
