import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Canvas, Group, Picture } from '@shopify/react-native-skia';
import type { SkPicture } from '@shopify/react-native-skia';
import { fitBox } from '../../utils/fitBox';

type FilteredPreviewProps = {
  picture: SkPicture;
  // The picture's own recorded size (the preview image's pixels), aspect-fit into this view.
  contentWidth: number;
  contentHeight: number;
};

// <Canvas> equivalent of an <Image resizeMode="contain"> for an SkPicture from useFilteredPicture.
export function FilteredPreview({ picture, contentWidth, contentHeight }: FilteredPreviewProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const fit = size && size.width > 0 && size.height > 0 ? fitBox(contentWidth, contentHeight, 0, 0, size.width, size.height) : null;

  return (
    <View style={styles.fill} onLayout={handleLayout}>
      {fit && (
        <Canvas style={styles.fill}>
          <Group transform={[{ translateX: fit.origin.x }, { translateY: fit.origin.y }, { scale: fit.scale }]}>
            <Picture picture={picture} />
          </Group>
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
