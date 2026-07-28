import { Canvas, ColorMatrix, Image, useImage } from '@shopify/react-native-skia';
import { StyleSheet, View, ViewStyle } from 'react-native';

// Real, live, non-destructive invert via a Skia color matrix — approximates the source
// design's CSS `invert(1) hue-rotate(180deg) sepia(.2) brightness(.95)` with a single linear
// matrix (inverted RGB with a warm bias baked into the offsets) rather than reproducing the
// exact multi-stage filter chain. Static (no pinch-zoom) — see PageList for why.
const NIGHT_MATRIX = [
  -0.95, 0, 0, 0, 245,
  0, -1, 0, 0, 240,
  0, 0, -1, 0, 220,
  0, 0, 0, 1, 0,
];

type NightImageProps = {
  uri: string;
  style?: ViewStyle;
};

export function NightImage({ uri, style }: NightImageProps) {
  const image = useImage(uri);

  if (!image) return <View style={[styles.fallback, style]} />;

  return (
    <Canvas style={[styles.canvas, style]}>
      <Image image={image} x={0} y={0} width={image.width()} height={image.height()} fit="contain">
        <ColorMatrix matrix={NIGHT_MATRIX} />
      </Image>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    backgroundColor: '#0b0a09',
  },
});
